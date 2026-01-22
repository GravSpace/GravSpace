package auth

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"net/http"
	"strings"

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

func S3AuthMiddleware(um *UserManager) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			authHeader := c.Request().Header.Get("Authorization")
			var user *User

			if authHeader == "" {
				// Treat as anonymous request
				um.mu.RLock()
				user = um.Users["anonymous"]
				um.mu.RUnlock()
				if user == nil {
					return c.NoContent(http.StatusForbidden)
				}
			} else {
				// Basic check for S3 V4 Authorization header format:
				// AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-date, Signature=fe5f80f77d5fa3bea149ccf21544b47337129911439a667047309db558e2024a

				if !strings.HasPrefix(authHeader, "AWS4-HMAC-SHA256") {
					return c.NoContent(http.StatusForbidden)
				}

				// Extract Access Key ID
				credentialPart := ""
				if strings.Contains(authHeader, "Credential=") {
					parts := strings.Split(authHeader, " ")
					for _, p := range parts {
						if strings.HasPrefix(p, "Credential=") {
							credentialPart = strings.TrimPrefix(p, "Credential=")
							break
						}
					}
				}

				if credentialPart == "" {
					return c.NoContent(http.StatusForbidden)
				}

				accessKeyID := strings.Split(credentialPart, "/")[0]
				if accessKeyID == "" {
					return c.NoContent(http.StatusForbidden)
				}

				user, _ = um.GetUserByKey(accessKeyID)
				if user == nil {
					return c.NoContent(http.StatusForbidden)
				}
			}

			// Policy Enforcement
			action, resource := determineS3Action(c)
			if !um.CheckPermission(user, action, resource) {
				bucket := c.Param("bucket")
				key := c.Param("*")

				reqID := make([]byte, 8)
				rand.Read(reqID)
				hostID := make([]byte, 32)
				rand.Read(hostID)

				errRes := S3Error{
					Code:       "AccessDenied",
					Message:    "Access Denied.",
					Key:        key,
					BucketName: bucket,
					Resource:   fmt.Sprintf("/%s/%s", bucket, key),
					RequestId:  strings.ToUpper(hex.EncodeToString(reqID)),
					HostId:     hex.EncodeToString(hostID),
				}

				c.Response().Header().Set(echo.HeaderContentType, echo.MIMEApplicationXML)
				return c.XML(http.StatusForbidden, errRes)
			}

			c.Set("user", user)
			return next(c)
		}
	}
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
