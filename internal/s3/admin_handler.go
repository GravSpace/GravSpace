package s3

import (
	"encoding/json"
	"fmt"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/GravSpace/GravSpace/internal/auth"
	"github.com/GravSpace/GravSpace/internal/database"
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
	return h.SetBucketDefaultRetention(c) // Also allow setting defaults if provided
}

func (h *AdminHandler) SetBucketDefaultRetention(c echo.Context) error {
	bucket := c.Param("bucket")
	var req struct {
		Mode string `json:"mode"`
		Days int    `json:"days"`
	}
	if err := c.Bind(&req); err != nil {
		return c.String(http.StatusBadRequest, "Invalid request")
	}
	if err := h.Storage.SetBucketDefaultRetention(bucket, req.Mode, req.Days); err != nil {
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
	search := c.QueryParam("search")

	if c.Request().URL.Query().Has("versions") {
		objects, commonPrefixes, err := h.Storage.ListObjects(bucket, prefix, delimiter, search)
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

	objects, commonPrefixes, err := h.Storage.ListObjects(bucket, prefix, delimiter, search)
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

	reader, obj, err := h.Storage.GetObject(bucket, key, versionID)
	if err != nil {
		fmt.Printf("DEBUG: GetObject failed for bucket=%s, key=%s, err=%v\n", bucket, key, err)
		return c.String(http.StatusNotFound, fmt.Sprintf("Object not found: %v", err))
	}
	defer reader.Close()

	contentType := mime.TypeByExtension(filepath.Ext(key))
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	c.Response().Header().Set("x-amz-version-id", obj.VersionID)
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

	reader, obj, err := h.Storage.GetObject(bucket, key, versionID)
	if err != nil {
		fmt.Printf("DEBUG: DownloadObject failed for bucket=%s, key=%s, err=%v\n", bucket, key, err)
		return c.String(http.StatusNotFound, fmt.Sprintf("Object not found: %v", err))
	}
	defer reader.Close()

	contentType := mime.TypeByExtension(filepath.Ext(key))
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	c.Response().Header().Set("x-amz-version-id", obj.VersionID)
	c.Response().Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filepath.Base(key)))

	return c.Stream(http.StatusOK, contentType, reader)
}

func (h *AdminHandler) DeleteObject(c echo.Context) error {
	bucket := c.Param("bucket")
	key := c.Param("*")
	versionID := c.QueryParam("versionId")
	bypass := c.QueryParam("bypassGovernance") != "false" // Admin by default bypasses unless explicitly false

	if err := h.Storage.DeleteObject(bucket, key, versionID, bypass); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *AdminHandler) GetObjectTagging(c echo.Context) error {
	bucket := c.Param("bucket")
	key := c.Param("*")
	versionID := c.QueryParam("versionId")

	tags, err := h.Storage.GetObjectTagging(bucket, key, versionID)
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, tags)
}

func (h *AdminHandler) PutObjectTagging(c echo.Context) error {
	bucket := c.Param("bucket")
	key := c.Param("*")
	versionID := c.QueryParam("versionId")

	var tags map[string]string
	if err := c.Bind(&tags); err != nil {
		return c.String(http.StatusBadRequest, "Invalid tags format")
	}

	if err := h.Storage.PutObjectTagging(bucket, key, versionID, tags); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusOK)
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

func (h *AdminHandler) AttachPolicyTemplate(c echo.Context) error {
	username := c.Param("username")
	var req struct {
		TemplateName string `json:"templateName"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "Invalid request"})
	}

	if err := h.UserManager.AttachPolicyTemplate(username, req.TemplateName); err != nil {
		if err == os.ErrNotExist {
			return c.JSON(http.StatusNotFound, echo.Map{"error": "User or policy template not found"})
		}
		if err == os.ErrExist {
			return c.JSON(http.StatusConflict, echo.Map{"error": "Policy already attached to user"})
		}
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": err.Error()})
	}

	return c.JSON(http.StatusOK, echo.Map{"message": "Policy template attached successfully"})
}

var startTime = time.Now()

func (h *AdminHandler) GetSystemStats(c echo.Context) error {
	count, size, err := h.Storage.GetGlobalStats()
	if err != nil {
		count, size = 0, 0
	}

	stats := map[string]interface{}{}
	stats["total_users"] = len(h.UserManager.Users)
	stats["total_objects"] = count
	stats["total_size"] = size
	stats["uptime"] = time.Since(startTime).String()

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

func (h *AdminHandler) ListPolicies(c echo.Context) error {
	return c.JSON(http.StatusOK, h.UserManager.ListPolicyTemplates())
}

func (h *AdminHandler) CreatePolicy(c echo.Context) error {
	var policy auth.Policy
	if err := c.Bind(&policy); err != nil {
		return err
	}
	if err := h.UserManager.CreatePolicyTemplate(policy.Name, policy); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusCreated)
}

func (h *AdminHandler) DeletePolicy(c echo.Context) error {
	name := c.Param("name")
	if err := h.UserManager.DeletePolicyTemplate(name); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusOK)
}
func (h *AdminHandler) GetObjectLegalHold(c echo.Context) error {
	bucket := c.Param("bucket")
	key := c.Param("*")
	versionID := c.QueryParam("versionId")

	obj, err := h.Storage.StatObject(bucket, key, versionID)
	if err != nil {
		return c.String(http.StatusNotFound, err.Error())
	}

	return c.JSON(http.StatusOK, echo.Map{"legalHold": obj.LegalHold})
}

// Webhook Handlers

func (h *AdminHandler) ListWebhooks(c echo.Context) error {
	bucket := c.Param("bucket")
	db := h.Storage.(*storage.FileStorage).DB
	hooks, err := db.ListWebhooks(bucket)
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, hooks)
}

func (h *AdminHandler) CreateWebhook(c echo.Context) error {
	bucket := c.Param("bucket")
	var req struct {
		URL    string   `json:"url"`
		Events []string `json:"events"`
		Secret string   `json:"secret"`
		Active bool     `json:"active"`
	}
	if err := c.Bind(&req); err != nil {
		return c.String(http.StatusBadRequest, "Invalid request")
	}

	eventsJSON, _ := json.Marshal(req.Events)
	db := h.Storage.(*storage.FileStorage).DB
	id, err := db.CreateWebhook(&database.WebhookRecord{
		Bucket: bucket,
		URL:    req.URL,
		Events: string(eventsJSON),
		Secret: req.Secret,
		Active: req.Active,
	})
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusCreated, echo.Map{"id": id})
}

func (h *AdminHandler) DeleteWebhook(c echo.Context) error {
	idStr := c.Param("id")
	var id int64
	fmt.Sscanf(idStr, "%d", &id)

	db := h.Storage.(*storage.FileStorage).DB
	if err := db.DeleteWebhook(id); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusOK)
}

func (h *AdminHandler) GetAuditLogs(c echo.Context) error {
	limitStr := c.QueryParam("limit")
	offsetStr := c.QueryParam("offset")

	limit, _ := strconv.Atoi(limitStr)
	if limit == 0 {
		limit = 50
	}
	offset, _ := strconv.Atoi(offsetStr)

	db := h.Storage.(*storage.FileStorage).DB
	logs, err := db.ListAuditLogs(limit, offset)
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, logs)
}

func (h *AdminHandler) GetStorageAnalytics(c echo.Context) error {
	daysStr := c.QueryParam("days")
	days, _ := strconv.Atoi(daysStr)
	if days == 0 {
		days = 30
	}

	db := h.Storage.(*storage.FileStorage).DB
	history, err := db.GetStorageHistory(days)
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, history)
}

func (h *AdminHandler) GetActionAnalytics(c echo.Context) error {
	daysStr := c.QueryParam("days")
	days, _ := strconv.Atoi(daysStr)
	if days == 0 {
		days = 30
	}

	db := h.Storage.(*storage.FileStorage).DB
	trends, err := db.GetActionTrends(days)
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, trends)
}

func (h *AdminHandler) GetBucketWebsite(c echo.Context) error {
	bucket := c.Param("bucket")
	config, err := h.Storage.GetBucketWebsite(bucket)
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	if config == nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "Website configuration not found"})
	}
	return c.JSON(http.StatusOK, config)
}

func (h *AdminHandler) SetBucketWebsite(c echo.Context) error {
	bucket := c.Param("bucket")
	var config storage.WebsiteConfiguration
	if err := c.Bind(&config); err != nil {
		return c.String(http.StatusBadRequest, "Invalid website configuration")
	}

	if err := h.Storage.PutBucketWebsite(bucket, config); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusOK)
}

func (h *AdminHandler) DeleteBucketWebsite(c echo.Context) error {
	bucket := c.Param("bucket")
	if err := h.Storage.DeleteBucketWebsite(bucket); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusOK)
}
