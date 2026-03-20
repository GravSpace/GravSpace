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

	"net/url"

	"github.com/GravSpace/GravSpace/internal/audit"
	"github.com/GravSpace/GravSpace/internal/storage"
	"github.com/gofiber/fiber/v2"
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

func S3AuthMiddleware(um *UserManager, auditLogger *audit.AuditLogger, store storage.Storage) fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
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
				return sendS3Error(c, "AccessDenied", "Anonymous access is not enabled", "", "")
			}
		} else if queryCred != "" {
			isPresigned = true
			parts := strings.Split(queryCred, "/")
			if len(parts) < 1 {
				return sendS3Error(c, "IncompleteBody", "Invalid Credential parameter", "", "")
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
					return sendS3Error(c, "InvalidToken", "Invalid Authorization header", "", "")
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
				if auditLogger != nil {
					auditLogger.LogDenied(accessKeyID, "authenticate", "", c.IP(), c.Get("User-Agent"), "Invalid access key")
				}
				return sendS3Error(c, "InvalidAccessKeyId", "The AWS Access Key Id you provided does not exist in our records.", "", "")
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
				amzDate = c.Get("X-Amz-Date")
				if amzDate == "" {
					amzDate = c.Get("Date")
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
				return sendS3Error(c, "AuthorizationHeaderMalformed", "The authorization header is malformed; the credential scope is missing.", "", "")
			}

			scopeParts := strings.Split(credentialScope, "/")
			if len(scopeParts) < 3 {
				return sendS3Error(c, "AuthorizationHeaderMalformed", "The authorization header is malformed; invalid credential scope.", "", "")
			}
			date := scopeParts[0]
			region := scopeParts[1]
			service := scopeParts[2]

			signedHeaders := strings.Split(signedHeadersStr, ";")

			// Build Canonical Request
			query := url.Values{}
			for k, v := range c.Queries() {
				query.Add(k, v)
			}
			path := c.Path()

			payloadHash := c.Get("X-Amz-Content-Sha256")
			if isPresigned || payloadHash == "" {
				payloadHash = "UNSIGNED-PAYLOAD"
			}

			headers := http.Header{}
			for k, vs := range c.GetReqHeaders() {
				for _, v := range vs {
					headers.Add(k, v)
				}
			}

			canonicalRequest := BuildCanonicalRequest(c.Method(), path, query, headers, signedHeaders, payloadHash, c.Hostname())
			stringToSign := BuildStringToSign(algorithm, amzDate, credentialScope, canonicalRequest)
			calculatedSignature := CalculateSignature(secretKey, date, region, service, stringToSign)

			if providedSignature != calculatedSignature {
				// Fallback: If signature fails but user is anonymous-eligible, we'll check permission later
				// But usually, if they provided keys, they must be valid.
				if auditLogger != nil {
					auditLogger.LogDenied(user.Username, "authenticate", "", c.IP(), c.Get("User-Agent"), "Signature mismatch")
				}
				return sendS3Error(c, "SignatureDoesNotMatch", "The request signature we calculated does not match the signature you provided.", "", "")
			}

			// ADDITIONAL SECURITY CHECKS FOR PRESIGNED URLS
			if isPresigned {
				// 1. IP Restriction
				allowedIP := c.Query("X-Amz-Allowed-IP")
				if allowedIP != "" && allowedIP != c.IP() {
					if auditLogger != nil {
						auditLogger.LogDenied(user.Username, "authenticate", "", c.IP(), c.Get("User-Agent"), "IP restriction failure")
					}
					return sendS3Error(c, "AccessDenied", "IP address restricted for this URL", "", "")
				}

				// 2. One-time Use
				isOneTime := c.Query("X-Amz-One-Time-Use") == "true"
				if isOneTime && store != nil {
					used, _ := store.IsSignatureUsed(providedSignature)
					if used {
						if auditLogger != nil {
							auditLogger.LogDenied(user.Username, "authenticate", "", c.IP(), c.Get("User-Agent"), "One-time URL already used")
						}
						return sendS3Error(c, "AccessDenied", "This one-time use URL has already been used.", "", "")
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
			if auditLogger != nil {
				auditLogger.LogDenied(user.Username, action, resource, c.IP(), c.Get("User-Agent"), "Policy denied")
			}
			// Special case: if user is not anonymous and access denied, they might need better policies.
			// If they ARE anonymous, return 403.
			return sendS3Error(c, "AccessDenied", "Access Denied by IAM Policy", c.Params("bucket"), c.Params("*"))
		}

		// Log successful authentication and authorization
		if auditLogger != nil {
			auditLogger.LogSuccess(user.Username, action, resource, c.IP(), c.Get("User-Agent"), nil)
		}

		c.Locals("user", user)
		return c.Next()
	}
}

func AdminOnlyMiddleware(c *fiber.Ctx) error {
	user := c.Locals("user").(*jwt.Token)
	claims := user.Claims.(jwt.MapClaims)
	username := claims["username"].(string)

	if username != "admin" {
		return c.Status(http.StatusForbidden).JSON(fiber.Map{"error": "Admin access required"})
	}

	return c.Next()
}

func sendS3Error(c *fiber.Ctx, code, message, bucket, key string) error {
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

	c.Set(fiber.HeaderContentType, fiber.MIMEApplicationXML)
	return c.Status(http.StatusForbidden).XML(errRes)
}

func determineS3Action(c *fiber.Ctx) (string, string) {
	method := c.Method()
	bucket := c.Params("bucket")
	key := c.Params("*")
	path := c.Path()

	// Root path
	if path == "/" {
		return "s3:ListAllMyBuckets", "*"
	}

	resource := "arn:aws:s3:::" + bucket
	if key != "" {
		if !strings.HasPrefix(key, "/") {
			resource += "/"
		}
		resource += key
	}

	switch method {
	case "GET":
		if key == "" {
			return "s3:ListBucket", resource
		}
		return "s3:GetObject", resource
	case "PUT":
		if key == "" {
			return "s3:CreateBucket", resource
		}
		return "s3:PutObject", resource
	case "DELETE":
		if key == "" {
			return "s3:DeleteBucket", resource
		}
		return "s3:DeleteObject", resource
	}

	return "s3:Unknown", resource
}
