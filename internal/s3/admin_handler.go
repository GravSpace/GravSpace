package s3

import (
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/rizal/storage-object/internal/auth"
)

type AdminHandler struct {
	UserManager *auth.UserManager
}

func (h *AdminHandler) ListUsers(c echo.Context) error {
	return c.JSON(http.StatusOK, h.UserManager.Users)
}

func (h *AdminHandler) CreateUser(c echo.Context) error {
	var req struct {
		Username string `json:"username"`
	}
	if err := c.Bind(&req); err != nil {
		return err
	}
	user := h.UserManager.CreateUser(req.Username)
	return c.JSON(http.StatusCreated, user)
}

func (h *AdminHandler) DeleteUser(c echo.Context) error {
	username := c.Param("username")
	h.UserManager.DeleteUser(username)
	return c.NoContent(http.StatusOK)
}

func (h *AdminHandler) GenerateKey(c echo.Context) error {
	username := c.Param("username")
	key := h.UserManager.GenerateKey(username)
	if key == nil {
		return c.NoContent(http.StatusNotFound)
	}
	return c.JSON(http.StatusOK, key)
}

func (h *AdminHandler) AddPolicy(c echo.Context) error {
	username := c.Param("username")
	var policy auth.Policy
	if err := c.Bind(&policy); err != nil {
		return err
	}
	if err := h.UserManager.AddPolicy(username, policy); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusOK)
}

func (h *AdminHandler) RemovePolicy(c echo.Context) error {
	username := c.Param("username")
	policyName := c.Param("name")
	if err := h.UserManager.RemovePolicy(username, policyName); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusOK)
}

func (h *AdminHandler) GetSystemStats(c echo.Context) error {
	// Dummy stats for now
	stats := map[string]interface{}{
		"total_users": len(h.UserManager.Users),
		"uptime":      "running",
	}
	return c.JSON(http.StatusOK, stats)
}

func (h *AdminHandler) GeneratePresignURL(c echo.Context) error {
	bucket := c.QueryParam("bucket")
	key := c.QueryParam("key")
	expires := c.QueryParam("expires")
	if expires == "" {
		expires = "3600"
	}

	// For simplicity, we use the first key of the 'admin' user
	user, ok := h.UserManager.Users["admin"]
	if !ok || len(user.AccessKeys) == 0 {
		return c.String(http.StatusInternalServerError, "No admin user or keys found")
	}
	accessKey := user.AccessKeys[0].AccessKeyID
	secretKey := user.AccessKeys[0].SecretAccessKey

	now := time.Now().UTC().Format("20060102T150405Z")
	date := now[:8]
	region := "us-east-1"
	service := "s3"
	credentialScope := fmt.Sprintf("%s/%s/%s/aws4_request", date, region, service)
	algorithm := "AWS4-HMAC-SHA256"

	params := url.Values{}
	params.Set("X-Amz-Algorithm", algorithm)
	params.Set("X-Amz-Credential", fmt.Sprintf("%s/%s", accessKey, credentialScope))
	params.Set("X-Amz-Date", now)
	params.Set("X-Amz-Expires", expires)
	params.Set("X-Amz-SignedHeaders", "host")

	scheme := "http"
	if c.Request().TLS != nil {
		scheme = "https"
	}

	path := fmt.Sprintf("/%s/%s", bucket, key)
	headers := http.Header{}
	headers.Set("Host", c.Request().Host)

	// Build Signature
	canonicalRequest := auth.BuildCanonicalRequest("GET", path, params, headers, []string{"host"}, "UNSIGNED-PAYLOAD", c.Request().Host)
	stringToSign := auth.BuildStringToSign(algorithm, now, credentialScope, canonicalRequest)
	signature := auth.CalculateSignature(secretKey, date, region, service, stringToSign)

	params.Set("X-Amz-Signature", signature)

	presignedURL := fmt.Sprintf("%s://%s%s?%s", scheme, c.Request().Host, path, params.Encode())

	return c.JSON(http.StatusOK, map[string]string{
		"url": presignedURL,
	})
}
