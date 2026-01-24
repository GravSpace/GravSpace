package s3

import (
	"fmt"
	"mime"
	"net/http"
	"net/url"
	"path/filepath"
	"time"

	"github.com/GravSpace/GravSpace/internal/auth"
	"github.com/GravSpace/GravSpace/internal/storage"
	"github.com/labstack/echo/v4"
)

type AdminHandler struct {
	UserManager *auth.UserManager
	Storage     storage.Storage
}

func (h *AdminHandler) ListBuckets(c echo.Context) error {
	buckets, err := h.Storage.ListBuckets()
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, buckets)
}

func (h *AdminHandler) CreateBucket(c echo.Context) error {
	bucket := c.Param("bucket")
	if err := h.Storage.CreateBucket(bucket); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusCreated)
}

func (h *AdminHandler) DeleteBucket(c echo.Context) error {
	bucket := c.Param("bucket")
	if err := h.Storage.DeleteBucket(bucket); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusOK)
}

func (h *AdminHandler) GetBucketInfo(c echo.Context) error {
	bucket := c.Param("bucket")
	info, err := h.Storage.GetBucketInfo(bucket)
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	if info == nil {
		return c.String(http.StatusNotFound, "Bucket not found")
	}
	return c.JSON(http.StatusOK, info)
}

func (h *AdminHandler) SetBucketVersioning(c echo.Context) error {
	bucket := c.Param("bucket")
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.Bind(&req); err != nil {
		return c.String(http.StatusBadRequest, "Invalid request")
	}
	if err := h.Storage.SetBucketVersioning(bucket, req.Enabled); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusOK)
}

func (h *AdminHandler) SetBucketObjectLock(c echo.Context) error {
	bucket := c.Param("bucket")
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.Bind(&req); err != nil {
		return c.String(http.StatusBadRequest, "Invalid request")
	}
	if err := h.Storage.SetBucketObjectLock(bucket, req.Enabled); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusOK)
}

func (h *AdminHandler) SetObjectRetention(c echo.Context) error {
	bucket := c.Param("bucket")
	key := c.QueryParam("key")
	versionID := c.QueryParam("versionId")

	var req struct {
		RetainUntilDate string `json:"retainUntilDate"` // ISO 8601 format
		Mode            string `json:"mode"`            // COMPLIANCE or GOVERNANCE
	}
	if err := c.Bind(&req); err != nil {
		return c.String(http.StatusBadRequest, "Invalid request")
	}

	retainUntil, err := time.Parse(time.RFC3339, req.RetainUntilDate)
	if err != nil {
		return c.String(http.StatusBadRequest, "Invalid retainUntilDate format")
	}

	if req.Mode != "COMPLIANCE" && req.Mode != "GOVERNANCE" {
		return c.String(http.StatusBadRequest, "Mode must be COMPLIANCE or GOVERNANCE")
	}

	if err := h.Storage.SetObjectRetention(bucket, key, versionID, retainUntil, req.Mode); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusOK)
}

func (h *AdminHandler) SetObjectLegalHold(c echo.Context) error {
	bucket := c.Param("bucket")
	key := c.QueryParam("key")
	versionID := c.QueryParam("versionId")

	var req struct {
		Hold bool `json:"hold"`
	}
	if err := c.Bind(&req); err != nil {
		return c.String(http.StatusBadRequest, "Invalid request")
	}

	if err := h.Storage.SetObjectLegalHold(bucket, key, versionID, req.Hold); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusOK)
}

func (h *AdminHandler) ListObjects(c echo.Context) error {
	bucket := c.Param("bucket")
	prefix := c.QueryParam("prefix")
	delimiter := c.QueryParam("delimiter")

	if c.Request().URL.Query().Has("versions") {
		objects, commonPrefixes, err := h.Storage.ListObjects(bucket, prefix, delimiter)
		if err != nil {
			return c.String(http.StatusInternalServerError, err.Error())
		}
		var allVersions []storage.Object
		for _, o := range objects {
			versions, _ := h.Storage.ListVersions(bucket, o.Key)
			allVersions = append(allVersions, versions...)
		}
		return c.JSON(http.StatusOK, echo.Map{
			"versions":        allVersions,
			"common_prefixes": commonPrefixes,
		})
	}

	objects, commonPrefixes, err := h.Storage.ListObjects(bucket, prefix, delimiter)
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, echo.Map{
		"objects":         objects,
		"common_prefixes": commonPrefixes,
	})
}

func (h *AdminHandler) GetObject(c echo.Context) error {
	bucket := c.Param("bucket")
	key := c.Param("*")
	versionID := c.QueryParam("versionId")

	reader, vid, err := h.Storage.GetObject(bucket, key, versionID)
	if err != nil {
		fmt.Printf("DEBUG: GetObject failed for bucket=%s, key=%s, err=%v\n", bucket, key, err)
		return c.String(http.StatusNotFound, fmt.Sprintf("Object not found: %v", err))
	}
	defer reader.Close()

	contentType := mime.TypeByExtension(filepath.Ext(key))
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	c.Response().Header().Set("x-amz-version-id", vid)
	if c.QueryParam("download") == "true" {
		c.Response().Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filepath.Base(key)))
	}

	return c.Stream(http.StatusOK, contentType, reader)
}

func (h *AdminHandler) PutObject(c echo.Context) error {
	bucket := c.Param("bucket")
	key := c.Param("*")

	vid, err := h.Storage.PutObject(bucket, key, c.Request().Body, "")
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	c.Response().Header().Set("x-amz-version-id", vid)
	return c.NoContent(http.StatusOK)
}

func (h *AdminHandler) DownloadObject(c echo.Context) error {
	bucket := c.Param("bucket")
	key := c.Param("*")
	versionID := c.QueryParam("versionId")

	reader, vid, err := h.Storage.GetObject(bucket, key, versionID)
	if err != nil {
		fmt.Printf("DEBUG: DownloadObject failed for bucket=%s, key=%s, err=%v\n", bucket, key, err)
		return c.String(http.StatusNotFound, fmt.Sprintf("Object not found: %v", err))
	}
	defer reader.Close()

	contentType := mime.TypeByExtension(filepath.Ext(key))
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	c.Response().Header().Set("x-amz-version-id", vid)
	c.Response().Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filepath.Base(key)))

	return c.Stream(http.StatusOK, contentType, reader)
}

func (h *AdminHandler) DeleteObject(c echo.Context) error {
	bucket := c.Param("bucket")
	key := c.Param("*")
	versionID := c.QueryParam("versionId")

	if err := h.Storage.DeleteObject(bucket, key, versionID); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
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

func (h *AdminHandler) UpdatePassword(c echo.Context) error {
	username := c.Param("username")
	var req struct {
		Password string `json:"password"`
	}
	if err := c.Bind(&req); err != nil {
		return err
	}
	if err := h.UserManager.UpdatePassword(username, req.Password); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
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

func (h *AdminHandler) DeleteKey(c echo.Context) error {
	username := c.Param("username")
	keyID := c.Param("id")
	if err := h.UserManager.DeleteKey(username, keyID); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusOK)
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
