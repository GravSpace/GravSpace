package auth

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/GravSpace/GravSpace/internal/audit"
	"github.com/GravSpace/GravSpace/internal/storage"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt"
)

type S3Error struct {
	XMLName    xml.Name `xml:"Error"`
	Code       string   `xml:"Code"`
	Message    string   `xml:"Message"`
	Key        string   `xml:"Key"`
	BucketName string   `xml:"BucketName"`
	Resource   string   `xml:"Resource"`
	RequestId  string   `xml:"RequestId"`
	HostId     string   `xml:"HostId"`
}

func S3AuthMiddleware(um *UserManager, auditLogger *audit.AuditLogger, store storage.Storage) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		queryCred := c.Query("X-Amz-Credential")
		querySignature := c.Query("X-Amz-Signature")

		var user *User
		var accessKeyID string
		var providedSignature string
		var isPresigned bool

		if authHeader == "" && queryCred == "" {
			// Treat as anonymous request
			um.mu.RLock()
			user = um.Users["anonymous"]
			um.mu.RUnlock()
			if user == nil {
				sendS3Error(c, "AccessDenied", "Anonymous access is not enabled", "", "")
				c.Abort()
				return
			}
		} else if queryCred != "" {
			isPresigned = true
			parts := strings.Split(queryCred, "/")
			if len(parts) < 1 {
				sendS3Error(c, "IncompleteBody", "Invalid Credential parameter", "", "")
				c.Abort()
				return
			}
			accessKeyID = parts[0]
			providedSignature = querySignature
		} else {
			// Header-based
			if !strings.HasPrefix(authHeader, "AWS4-HMAC-SHA256") {
				// Fallback to anonymous if auth header is malformed but some apps do this
				um.mu.RLock()
				user = um.Users["anonymous"]
				um.mu.RUnlock()
				if user == nil {
					sendS3Error(c, "InvalidToken", "Invalid Authorization header", "", "")
					c.Abort()
					return
				}
			} else {
				// Extract Credential and Signature
				authParts := strings.Split(authHeader, ",")
				for _, p := range authParts {
					p = strings.TrimSpace(p)
					if strings.HasPrefix(p, "AWS4-HMAC-SHA256 Credential=") {
						cred := strings.TrimPrefix(p, "AWS4-HMAC-SHA256 Credential=")
						accessKeyID = strings.Split(cred, "/")[0]
					} else if strings.HasPrefix(p, "Credential=") {
						cred := strings.TrimPrefix(p, "Credential=")
						accessKeyID = strings.Split(cred, "/")[0]
					}
					if strings.HasPrefix(p, "Signature=") {
						providedSignature = strings.TrimPrefix(p, "Signature=")
					}
				}
			}
		}

		if accessKeyID != "" {
			user, _ = um.GetUserByKey(accessKeyID)
			if user == nil {
				sendS3Error(c, "InvalidAccessKeyId", "The AWS Access Key Id you provided does not exist in our records.", "", "")
				c.Abort()
				return
			}

			// VERIFY SIGNATURE
			var secretKey string
			for _, k := range user.AccessKeys {
				if k.AccessKeyID == accessKeyID {
					secretKey = k.SecretAccessKey
					break
				}
			}

			// Get signing parameters
			var amzDate, signedHeadersStr, algorithm, credentialScope string
			if isPresigned {
				amzDate = c.Query("X-Amz-Date")
				signedHeadersStr = c.Query("X-Amz-SignedHeaders")
				algorithm = c.Query("X-Amz-Algorithm")
				credentialScope = strings.SplitN(queryCred, "/", 2)[1]
			} else {
				amzDate = c.GetHeader("X-Amz-Date")
				if amzDate == "" {
					amzDate = c.GetHeader("Date")
				}
				// Parse Auth Header for signed headers
				authParts := strings.Split(authHeader, ",")
				for _, p := range authParts {
					p = strings.TrimSpace(p)
					if strings.HasPrefix(p, "SignedHeaders=") {
						signedHeadersStr = strings.TrimPrefix(p, "SignedHeaders=")
					}
				}
				algorithm = "AWS4-HMAC-SHA256"
				// Extract scope from auth header
				for _, p := range authParts {
					p = strings.TrimSpace(p)
					if strings.HasPrefix(p, "AWS4-HMAC-SHA256 Credential=") {
						cred := strings.TrimPrefix(p, "AWS4-HMAC-SHA256 Credential=")
						credentialScope = strings.Join(strings.Split(cred, "/")[1:], "/")
					} else if strings.HasPrefix(p, "Credential=") {
						cred := strings.TrimPrefix(p, "Credential=")
						credentialScope = strings.Join(strings.Split(cred, "/")[1:], "/")
					}
				}
			}

			if credentialScope == "" {
				sendS3Error(c, "AuthorizationHeaderMalformed", "The authorization header is malformed; the credential scope is missing.", "", "")
				c.Abort()
				return
			}

			scopeParts := strings.Split(credentialScope, "/")
			if len(scopeParts) < 3 {
				sendS3Error(c, "AuthorizationHeaderMalformed", "The authorization header is malformed; invalid credential scope.", "", "")
				c.Abort()
				return
			}
			date := scopeParts[0]
			region := scopeParts[1]
			service := scopeParts[2]

			signedHeaders := strings.Split(signedHeadersStr, ";")

			// Build Canonical Request
			query := c.Request.URL.Query()
			path := c.Request.URL.Path

			payloadHash := c.GetHeader("X-Amz-Content-Sha256")
			if isPresigned || payloadHash == "" {
				payloadHash = "UNSIGNED-PAYLOAD"
			}

			headers := c.Request.Header

			canonicalRequest := BuildCanonicalRequest(c.Request.Method, path, query, headers, signedHeaders, payloadHash, c.Request.Host)
			stringToSign := BuildStringToSign(algorithm, amzDate, credentialScope, canonicalRequest)
			calculatedSignature := CalculateSignature(secretKey, date, region, service, stringToSign)

			if providedSignature != calculatedSignature {
				// Fallback: If signature fails but user is anonymous-eligible, we'll check permission later
				// But usually, if they provided keys, they must be valid.
				sendS3Error(c, "SignatureDoesNotMatch", "The request signature we calculated does not match the signature you provided.", "", "")
				c.Abort()
				return
			}

			// ADDITIONAL SECURITY CHECKS FOR PRESIGNED URLS
			if isPresigned {
				// 1. IP Restriction
				allowedIP := c.Query("X-Amz-Allowed-IP")
				if allowedIP != "" && allowedIP != c.ClientIP() {
					sendS3Error(c, "AccessDenied", "IP address restricted for this URL", "", "")
					c.Abort()
					return
				}

				// 2. One-time Use
				isOneTime := c.Query("X-Amz-One-Time-Use") == "true"
				if isOneTime && store != nil {
					used, _ := store.IsSignatureUsed(providedSignature)
					if used {
						sendS3Error(c, "AccessDenied", "This one-time use URL has already been used.", "", "")
						c.Abort()
						return
					}
					// Record usage
					expiresStr := c.Query("X-Amz-Expires")
					expiresSec, _ := strconv.Atoi(expiresStr)
					if expiresSec <= 0 {
						expiresSec = 3600
					}
					expiresAt := time.Now().Add(time.Duration(expiresSec) * time.Second)
					store.RecordSignature(providedSignature, expiresAt)
				}
			}
		}

		// Policy Enforcement
		action, resource := determineS3Action(c)
		if !um.CheckPermission(user, action, resource) {
			// Special case: if user is not anonymous and access denied, they might need better policies.
			// If they ARE anonymous, return 403.
			sendS3Error(c, "AccessDenied", "Access Denied by IAM Policy", c.Param("bucket"), c.Param("key"))
			c.Abort()
			return
		}

		c.Set("user", user)
		c.Next()
	}
}

func AdminOnlyMiddleware(c *gin.Context) {
	val, ok := c.Get("user")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		c.Abort()
		return
	}

	token, ok := val.(*jwt.Token)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token type"})
		c.Abort()
		return
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid claims type"})
		c.Abort()
		return
	}

	username, ok := claims["username"].(string)
	if !ok || username != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Admin access required"})
		c.Abort()
		return
	}

	c.Next()
}

func sendS3Error(c *gin.Context, code, message, bucket, key string) {
	reqID := make([]byte, 8)
	rand.Read(reqID)
	hostID := make([]byte, 32)
	rand.Read(hostID)

	errRes := S3Error{
		Code:       code,
		Message:    message,
		Key:        key,
		BucketName: bucket,
		Resource:   fmt.Sprintf("/%s/%s", bucket, key),
		RequestId:  strings.ToUpper(hex.EncodeToString(reqID)),
		HostId:     hex.EncodeToString(hostID),
	}

	c.XML(http.StatusForbidden, errRes)
}

func determineS3Action(c *gin.Context) (string, string) {
	method := c.Request.Method
	bucket := c.Param("bucket")
	key := c.Param("key") // In Gin, we'll use "key" for the * part
	path := c.Request.URL.Path

	// Root path
	if path == "/" || path == "" {
		return "s3:ListAllMyBuckets", "*"
	}

	// Manual extraction if params are empty (happens in global middleware before routing)
	if bucket == "" {
		parts := strings.Split(strings.TrimPrefix(path, "/"), "/")
		if len(parts) > 0 {
			if parts[0] == "website" && len(parts) > 1 {
				bucket = parts[1]
				if len(parts) > 2 {
					key = strings.Join(parts[2:], "/")
				}
			} else if parts[0] != "website" {
				bucket = parts[0]
				if len(parts) > 1 {
					key = strings.Join(parts[1:], "/")
				}
			}
		}
	}

	resource := "arn:aws:s3:::" + bucket
	if key != "" {
		if !strings.HasPrefix(key, "/") {
			resource += "/"
		}
		resource += key
	}

	switch method {
	case "GET", "HEAD":
		if key == "" {
			return "s3:ListBucket", resource
		}
		return "s3:GetObject", resource
	case "PUT":
		if key == "" {
			return "s3:CreateBucket", resource
		}
		return "s3:PutObject", resource
	case "POST":
		if key == "" {
			return "s3:PostBucket", resource
		}
		return "s3:PutObject", resource // Post is often used for uploads too
	case "DELETE":
		if key == "" {
			return "s3:DeleteBucket", resource
		}
		return "s3:DeleteObject", resource
	}

	return "s3:Unknown", resource
}
