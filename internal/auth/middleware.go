package auth

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"net/http"
	"strings"

	"github.com/GravSpace/GravSpace/internal/audit"
	"github.com/golang-jwt/jwt"
	"github.com/labstack/echo/v4"
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

func S3AuthMiddleware(um *UserManager, auditLogger *audit.AuditLogger) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			authHeader := c.Request().Header.Get("Authorization")
			queryCred := c.QueryParam("X-Amz-Credential")
			querySignature := c.QueryParam("X-Amz-Signature")

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
					return sendS3Error(c, "Forbidden", "Anonymous access disabled", "", "")
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
					return sendS3Error(c, "InvalidToken", "Invalid Authorization header", "", "")
				}
				// Extract Credential and Signature
				parts := strings.Split(authHeader, " ")
				for _, p := range parts {
					p = strings.TrimSuffix(p, ",")
					if strings.HasPrefix(p, "Credential=") {
						cred := strings.TrimPrefix(p, "Credential=")
						accessKeyID = strings.Split(cred, "/")[0]
					}
					if strings.HasPrefix(p, "Signature=") {
						providedSignature = strings.TrimPrefix(p, "Signature=")
					}
				}
			}

			if accessKeyID != "" {
				user, _ = um.GetUserByKey(accessKeyID)
				if user == nil {
					if auditLogger != nil {
						auditLogger.LogDenied(accessKeyID, "authenticate", "", c.RealIP(), c.Request().UserAgent(), "Invalid access key")
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
					amzDate = c.QueryParam("X-Amz-Date")
					signedHeadersStr = c.QueryParam("X-Amz-SignedHeaders")
					algorithm = c.QueryParam("X-Amz-Algorithm")
					credentialScope = strings.SplitN(queryCred, "/", 2)[1]
				} else {
					amzDate = c.Request().Header.Get("X-Amz-Date")
					if amzDate == "" {
						amzDate = c.Request().Header.Get("Date")
					}
					// Parse Auth Header for signed headers
					parts := strings.Split(authHeader, " ")
					for _, p := range parts {
						p = strings.TrimSuffix(p, ",")
						if strings.HasPrefix(p, "SignedHeaders=") {
							signedHeadersStr = strings.TrimPrefix(p, "SignedHeaders=")
						}
					}
					algorithm = "AWS4-HMAC-SHA256"
					// Extract scope from auth header
					for _, p := range parts {
						p = strings.TrimSuffix(p, ",")
						if strings.HasPrefix(p, "Credential=") {
							cred := strings.TrimPrefix(p, "Credential=")
							credentialScope = strings.Join(strings.Split(cred, "/")[1:], "/")
						}
					}
				}

				scopeParts := strings.Split(credentialScope, "/")
				date := scopeParts[0]
				region := scopeParts[1]
				service := scopeParts[2]

				signedHeaders := strings.Split(signedHeadersStr, ";")

				// Build Canonical Request
				query := c.QueryParams()
				path := c.Request().URL.Path

				payloadHash := c.Request().Header.Get("X-Amz-Content-Sha256")
				if isPresigned {
					payloadHash = "UNSIGNED-PAYLOAD"
				}

				canonicalRequest := BuildCanonicalRequest(c.Request().Method, path, query, c.Request().Header, signedHeaders, payloadHash, c.Request().Host)
				stringToSign := BuildStringToSign(algorithm, amzDate, credentialScope, canonicalRequest)
				calculatedSignature := CalculateSignature(secretKey, date, region, service, stringToSign)

				if providedSignature != calculatedSignature {
					fmt.Printf("Signature Mismatch!\nCalculated: %s\nProvided: %s\nCanonical Request:\n%s\nString to Sign:\n%s\n",
						calculatedSignature, providedSignature, canonicalRequest, stringToSign)
					if auditLogger != nil {
						auditLogger.LogDenied(user.Username, "authenticate", "", c.RealIP(), c.Request().UserAgent(), "Signature mismatch")
					}
					return sendS3Error(c, "SignatureDoesNotMatch", "The request signature we calculated does not match the signature you provided.", "", "")
				}
			}

			// Policy Enforcement
			action, resource := determineS3Action(c)
			if !um.CheckPermission(user, action, resource) {
				if auditLogger != nil {
					auditLogger.LogDenied(user.Username, action, resource, c.RealIP(), c.Request().UserAgent(), "Policy denied")
				}
				return sendS3Error(c, "AccessDenied", "Access Denied by IAM Policy", c.Param("bucket"), c.Param("*"))
			}

			// Log successful authentication and authorization
			if auditLogger != nil {
				auditLogger.LogSuccess(user.Username, action, resource, c.RealIP(), c.Request().UserAgent(), nil)
			}

			c.Set("user", user)
			return next(c)
		}
	}
}

func AdminOnlyMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		user := c.Get("user").(*jwt.Token)
		claims := user.Claims.(jwt.MapClaims)
		username := claims["username"].(string)

		if username != "admin" {
			return c.JSON(http.StatusForbidden, echo.Map{"error": "Admin access required"})
		}

		return next(c)
	}
}

func sendS3Error(c echo.Context, code, message, bucket, key string) error {
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

	c.Response().Header().Set(echo.HeaderContentType, echo.MIMEApplicationXML)
	return c.XML(http.StatusForbidden, errRes)
}

func determineS3Action(c echo.Context) (string, string) {
	method := c.Request().Method
	bucket := c.Param("bucket")
	key := c.Param("*")
	path := c.Request().URL.Path

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
