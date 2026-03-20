package s3

import (
	"encoding/json"
	"fmt"
	"log"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/GravSpace/GravSpace/internal/auth"
	"github.com/GravSpace/GravSpace/internal/database"
	"github.com/GravSpace/GravSpace/internal/storage"
	"github.com/gofiber/fiber/v2"
)

type AdminHandler struct {
	UserManager *auth.UserManager
	Storage     storage.Storage
	S3Port      string
}

func (h *AdminHandler) ListBuckets(c *fiber.Ctx) error {
	buckets, err := h.Storage.ListBuckets()
	if err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return c.JSON(buckets)
}

func (h *AdminHandler) CreateBucket(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	if err := h.Storage.CreateBucket(bucket); err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return c.SendStatus(http.StatusCreated)
}

func (h *AdminHandler) DeleteBucket(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	if err := h.Storage.DeleteBucket(bucket); err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return c.SendStatus(http.StatusOK)
}

func (h *AdminHandler) GetBucketInfo(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	info, err := h.Storage.GetBucketInfo(bucket)
	if err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	if info == nil {
		return c.Status(http.StatusNotFound).SendString("Bucket not found")
	}

	// Get current size
	_, currentSize, _ := h.Storage.GetBucketStats(bucket)

	return c.JSON(fiber.Map{
		"Name":                 info.Name,
		"CreatedAt":            info.CreatedAt,
		"Owner":                info.Owner,
		"VersioningEnabled":    info.VersioningEnabled,
		"ObjectLockEnabled":    info.ObjectLockEnabled,
		"DefaultRetentionMode": info.DefaultRetentionMode,
		"DefaultRetentionDays": info.DefaultRetentionDays,
		"SoftDeleteEnabled":    info.SoftDeleteEnabled,
		"SoftDeleteRetention":  info.SoftDeleteRetention,
		"QuotaBytes":           info.QuotaBytes,
		"CurrentSize":          currentSize,
	})
}

func (h *AdminHandler) SetBucketVersioning(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(http.StatusBadRequest).SendString("Invalid request")
	}
	if err := h.Storage.SetBucketVersioning(bucket, req.Enabled); err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return c.SendStatus(http.StatusOK)
}

func (h *AdminHandler) SetBucketObjectLock(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(http.StatusBadRequest).SendString("Invalid request")
	}
	if err := h.Storage.SetBucketObjectLock(bucket, req.Enabled); err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return h.SetBucketDefaultRetention(c) // Also allow setting defaults if provided
}

func (h *AdminHandler) SetBucketDefaultRetention(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	var req struct {
		Mode string `json:"mode"`
		Days int    `json:"days"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(http.StatusBadRequest).SendString("Invalid request")
	}
	if err := h.Storage.SetBucketDefaultRetention(bucket, req.Mode, req.Days); err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return c.SendStatus(http.StatusOK)
}

func (h *AdminHandler) SetBucketQuota(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	var req struct {
		QuotaBytes int64 `json:"quota_bytes"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(http.StatusBadRequest).SendString("Invalid request")
	}
	if err := h.Storage.SetBucketQuota(bucket, req.QuotaBytes); err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return c.SendStatus(http.StatusOK)
}

func (h *AdminHandler) SetObjectRetention(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	key := c.Query("key")
	versionID := c.Query("versionId")

	var req struct {
		RetainUntilDate string `json:"retainUntilDate"` // ISO 8601 format
		Mode            string `json:"mode"`            // COMPLIANCE or GOVERNANCE
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(http.StatusBadRequest).SendString("Invalid request")
	}

	retainUntil, err := time.Parse(time.RFC3339, req.RetainUntilDate)
	if err != nil {
		return c.Status(http.StatusBadRequest).SendString("Invalid retainUntilDate format")
	}

	if req.Mode != "COMPLIANCE" && req.Mode != "GOVERNANCE" {
		return c.Status(http.StatusBadRequest).SendString("Mode must be COMPLIANCE or GOVERNANCE")
	}

	if err := h.Storage.SetObjectRetention(bucket, key, versionID, retainUntil, req.Mode); err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return c.SendStatus(http.StatusOK)
}

func (h *AdminHandler) SetObjectLegalHold(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	key := c.Query("key")
	versionID := c.Query("versionId")

	var req struct {
		Hold   bool   `json:"hold"`
		Reason string `json:"reason"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(http.StatusBadRequest).SendString("Invalid request")
	}

	if err := h.Storage.SetObjectLegalHold(bucket, key, versionID, req.Hold, req.Reason); err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return c.SendStatus(http.StatusOK)
}

func (h *AdminHandler) ListObjects(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	prefix := c.Query("prefix")
	delimiter := c.Query("delimiter")
	search := c.Query("search")

	if c.Query("versions") != "" {
		objects, commonPrefixes, err := h.Storage.ListObjects(bucket, prefix, delimiter, search)
		if err != nil {
			return c.Status(http.StatusInternalServerError).SendString(err.Error())
		}
		var allVersions []storage.Object
		for _, o := range objects {
			versions, _ := h.Storage.ListVersions(bucket, o.Key)
			allVersions = append(allVersions, versions...)
		}
		return c.JSON(fiber.Map{
			"versions":        allVersions,
			"common_prefixes": commonPrefixes,
		})
	}

	objects, commonPrefixes, err := h.Storage.ListObjects(bucket, prefix, delimiter, search)
	if err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}

	return c.JSON(fiber.Map{
		"objects":         objects,
		"common_prefixes": commonPrefixes,
	})
}

func (h *AdminHandler) GetObject(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	key := c.Params("*")
	versionID := c.Query("versionId")

	reader, obj, err := h.Storage.GetObject(bucket, key, versionID)
	if err != nil {
		fmt.Printf("DEBUG: GetObject failed for bucket=%s, key=%s, err=%v\n", bucket, key, err)
		return c.Status(http.StatusNotFound).SendString(fmt.Sprintf("Object not found: %v", err))
	}

	contentType := mime.TypeByExtension(filepath.Ext(key))
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	c.Set("x-amz-version-id", obj.VersionID)
	if c.Query("download") == "true" {
		c.Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filepath.Base(key)))
	}

	c.Type(contentType)
	return c.SendStream(reader)
}

func (h *AdminHandler) PutObject(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	key := c.Params("*")

	// Defensive check: if the request path ends with a slash but the key parameter doesn't,
	// it means Fiber's routing or parameter extraction stripped it.
	if strings.HasSuffix(c.Path(), "/") && !strings.HasSuffix(key, "/") {
		key += "/"
	}

	log.Printf("Admin PUT Object: bucket=%s, key=%s", bucket, key)

	// Fiber's RequestBodyStream might be nil if body is already read or empty
	reader := c.Context().RequestBodyStream()
	if reader == nil {
		body := c.Body()
		log.Printf("RequestBodyStream is nil, using c.Body() (size: %d)", len(body))
		reader = strings.NewReader(string(body))
	}

	vid, err := h.Storage.PutObject(bucket, key, reader, "")
	if err != nil {
		log.Printf("Error in PutObject: %v", err)
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	c.Set("x-amz-version-id", vid)
	log.Printf("Successfully put object: %s/%s, version: %s", bucket, key, vid)
	return c.SendStatus(http.StatusOK)
}

func (h *AdminHandler) DownloadObject(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	key := c.Params("*")
	versionID := c.Query("versionId")

	reader, obj, err := h.Storage.GetObject(bucket, key, versionID)
	if err != nil {
		fmt.Printf("DEBUG: DownloadObject failed for bucket=%s, key=%s, err=%v\n", bucket, key, err)
		return c.Status(http.StatusNotFound).SendString(fmt.Sprintf("Object not found: %v", err))
	}

	contentType := mime.TypeByExtension(filepath.Ext(key))
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	c.Set("x-amz-version-id", obj.VersionID)
	c.Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filepath.Base(key)))

	c.Type(contentType)
	return c.SendStream(reader)
}

func (h *AdminHandler) DeleteObject(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	key := c.Params("*")
	versionID := c.Query("versionId")
	bypass := c.Query("bypassGovernance") != "false" // Admin by default bypasses unless explicitly false

	if err := h.Storage.DeleteObject(bucket, key, versionID, bypass); err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return c.SendStatus(http.StatusNoContent)
}

func (h *AdminHandler) GetObjectTagging(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	key := c.Params("*")
	versionID := c.Query("versionId")

	tags, err := h.Storage.GetObjectTagging(bucket, key, versionID)
	if err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return c.JSON(tags)
}

func (h *AdminHandler) PutObjectTagging(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	key := c.Params("*")
	versionID := c.Query("versionId")

	var tags map[string]string
	if err := c.BodyParser(&tags); err != nil {
		return c.Status(http.StatusBadRequest).SendString("Invalid tags format")
	}

	if err := h.Storage.PutObjectTagging(bucket, key, versionID, tags); err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return c.SendStatus(http.StatusOK)
}

func (h *AdminHandler) ListUsers(c *fiber.Ctx) error {
	return c.JSON(h.UserManager.Users)
}

func (h *AdminHandler) CreateUser(c *fiber.Ctx) error {
	var req struct {
		Username string `json:"username"`
	}
	if err := c.BodyParser(&req); err != nil {
		return err
	}
	user := h.UserManager.CreateUser(req.Username)
	return c.Status(http.StatusCreated).JSON(user)
}

func (h *AdminHandler) DeleteUser(c *fiber.Ctx) error {
	username := c.Params("username")
	h.UserManager.DeleteUser(username)
	return c.SendStatus(http.StatusOK)
}

func (h *AdminHandler) UpdatePassword(c *fiber.Ctx) error {
	username := c.Params("username")
	var req struct {
		Password string `json:"password"`
	}
	if err := c.BodyParser(&req); err != nil {
		return err
	}
	if err := h.UserManager.UpdatePassword(username, req.Password); err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return c.SendStatus(http.StatusOK)
}

func (h *AdminHandler) GenerateKey(c *fiber.Ctx) error {
	username := c.Params("username")
	key := h.UserManager.GenerateKey(username)
	if key == nil {
		return c.SendStatus(http.StatusNotFound)
	}
	return c.JSON(key)
}

func (h *AdminHandler) DeleteKey(c *fiber.Ctx) error {
	username := c.Params("username")
	keyID := c.Params("id")
	if err := h.UserManager.DeleteKey(username, keyID); err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return c.SendStatus(http.StatusOK)
}

func (h *AdminHandler) AddPolicy(c *fiber.Ctx) error {
	username := c.Params("username")
	var policy auth.Policy
	if err := c.BodyParser(&policy); err != nil {
		return err
	}
	if err := h.UserManager.AddPolicy(username, policy); err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return c.SendStatus(http.StatusOK)
}

func (h *AdminHandler) RemovePolicy(c *fiber.Ctx) error {
	username := c.Params("username")
	policyName := c.Params("name")
	if err := h.UserManager.RemovePolicy(username, policyName); err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return c.SendStatus(http.StatusOK)
}

func (h *AdminHandler) AttachPolicyTemplate(c *fiber.Ctx) error {
	username := c.Params("username")
	var req struct {
		TemplateName string `json:"templateName"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	if err := h.UserManager.AttachPolicyTemplate(username, req.TemplateName); err != nil {
		if err == os.ErrNotExist {
			return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "User or policy template not found"})
		}
		if err == os.ErrExist {
			return c.Status(http.StatusConflict).JSON(fiber.Map{"error": "Policy already attached to user"})
		}
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"message": "Policy template attached successfully"})
}

var startTime = time.Now()

func (h *AdminHandler) GetSystemStats(c *fiber.Ctx) error {
	count, size, err := h.Storage.GetGlobalStats()
	if err != nil {
		count, size = 0, 0
	}

	stats := map[string]interface{}{}
	stats["total_users"] = len(h.UserManager.Users)
	stats["total_objects"] = count
	stats["total_size"] = size
	stats["uptime"] = time.Since(startTime).String()

	return c.JSON(stats)
}

func (h *AdminHandler) GeneratePresignURL(c *fiber.Ctx) error {
	bucket := c.Query("bucket")
	key := c.Query("key")
	expires := c.Query("expires")
	if expires == "" {
		expires = "3600"
	}

	// For simplicity, we use the first key of the 'admin' user
	user, ok := h.UserManager.Users["admin"]
	if !ok || len(user.AccessKeys) == 0 {
		return c.Status(http.StatusInternalServerError).SendString("No admin user or keys found")
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
	// Fiber check for TLS
	if c.Secure() {
		scheme = "https"
	}

	path := fmt.Sprintf("/%s/%s", bucket, key)
	headers := http.Header{}
	headers.Set("Host", c.Hostname())

	// Build Signature
	canonicalRequest := auth.BuildCanonicalRequest("GET", path, params, headers, []string{"host"}, "UNSIGNED-PAYLOAD", c.Hostname())
	stringToSign := auth.BuildStringToSign(algorithm, now, credentialScope, canonicalRequest)
	signature := auth.CalculateSignature(secretKey, date, region, service, stringToSign)

	params.Set("X-Amz-Signature", signature)

	presignedURL := fmt.Sprintf("%s://%s%s?%s", scheme, c.Hostname(), path, params.Encode())

	return c.JSON(map[string]string{
		"url": presignedURL,
	})
}

func (h *AdminHandler) ListPolicies(c *fiber.Ctx) error {
	return c.JSON(h.UserManager.ListPolicyTemplates())
}

func (h *AdminHandler) CreatePolicy(c *fiber.Ctx) error {
	var policy auth.Policy
	if err := c.BodyParser(&policy); err != nil {
		return err
	}
	if err := h.UserManager.CreatePolicyTemplate(policy.Name, policy); err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return c.SendStatus(http.StatusCreated)
}

func (h *AdminHandler) DeletePolicy(c *fiber.Ctx) error {
	name := c.Params("name")
	if err := h.UserManager.DeletePolicyTemplate(name); err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return c.SendStatus(http.StatusOK)
}
func (h *AdminHandler) GetObjectLegalHold(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	key := c.Params("*")
	versionID := c.Query("versionId")

	obj, err := h.Storage.StatObject(bucket, key, versionID)
	if err != nil {
		return c.Status(http.StatusNotFound).SendString(err.Error())
	}

	return c.JSON(fiber.Map{"legalHold": obj.LegalHold})
}

// Webhook Handlers

func (h *AdminHandler) ListWebhooks(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	db := h.Storage.(*storage.FileStorage).DB
	hooks, err := db.ListWebhooks(bucket)
	if err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return c.JSON(hooks)
}

func (h *AdminHandler) CreateWebhook(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	var req struct {
		URL    string   `json:"url"`
		Events []string `json:"events"`
		Secret string   `json:"secret"`
		Active bool     `json:"active"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(http.StatusBadRequest).SendString("Invalid request")
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
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}

	return c.Status(http.StatusCreated).JSON(fiber.Map{"id": id})
}

func (h *AdminHandler) DeleteWebhook(c *fiber.Ctx) error {
	idStr := c.Params("id")
	var id int64
	fmt.Sscanf(idStr, "%d", &id)

	db := h.Storage.(*storage.FileStorage).DB
	if err := db.DeleteWebhook(id); err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return c.SendStatus(http.StatusOK)
}

func (h *AdminHandler) GetAuditLogs(c *fiber.Ctx) error {
	limitStr := c.Query("limit")
	offsetStr := c.Query("offset")

	limit, _ := strconv.Atoi(limitStr)
	if limit == 0 {
		limit = 50
	}
	offset, _ := strconv.Atoi(offsetStr)

	db := h.Storage.(*storage.FileStorage).DB
	logs, err := db.ListAuditLogs(limit, offset)
	if err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}

	return c.JSON(logs)
}

func (h *AdminHandler) GetStorageAnalytics(c *fiber.Ctx) error {
	daysStr := c.Query("days")
	days, _ := strconv.Atoi(daysStr)
	if days == 0 {
		days = 30
	}

	db := h.Storage.(*storage.FileStorage).DB
	history, err := db.GetStorageHistory(days)
	if err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}

	return c.JSON(history)
}

func (h *AdminHandler) GetActionAnalytics(c *fiber.Ctx) error {
	daysStr := c.Query("days")
	days, _ := strconv.Atoi(daysStr)
	if days == 0 {
		days = 30
	}

	db := h.Storage.(*storage.FileStorage).DB
	trends, err := db.GetActionTrends(days)
	if err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}

	return c.JSON(trends)
}

func (h *AdminHandler) GetBucketWebsite(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	config, err := h.Storage.GetBucketWebsite(bucket)
	if err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	if config == nil {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "Website configuration not found"})
	}
	return c.JSON(config)
}

func (h *AdminHandler) SetBucketWebsite(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	var config storage.WebsiteConfiguration
	if err := c.BodyParser(&config); err != nil {
		return c.Status(http.StatusBadRequest).SendString("Invalid website configuration")
	}

	if err := h.Storage.PutBucketWebsite(bucket, config); err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return c.SendStatus(http.StatusOK)
}

func (h *AdminHandler) DeleteBucketWebsite(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	if err := h.Storage.DeleteBucketWebsite(bucket); err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return c.SendStatus(http.StatusOK)
}

func (h *AdminHandler) SetBucketSoftDelete(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	var req struct {
		Enabled       bool `json:"enabled"`
		RetentionDays int  `json:"retention_days"`
	}
	if err := c.BodyParser(&req); err != nil {
		log.Printf("Soft delete bind error: %v", err)
		return c.Status(http.StatusBadRequest).SendString(fmt.Sprintf("Invalid request: %v", err))
	}
	if err := h.Storage.SetBucketSoftDelete(bucket, req.Enabled, req.RetentionDays); err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return c.SendStatus(http.StatusOK)
}

func (h *AdminHandler) ListTrash(c *fiber.Ctx) error {
	bucket := c.Query("bucket")
	search := c.Query("search")
	objects, err := h.Storage.ListTrash(bucket, search)
	if err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return c.JSON(objects)
}

func (h *AdminHandler) EmptyTrash(c *fiber.Ctx) error {
	bucket := c.Query("bucket")
	if err := h.Storage.EmptyTrash(bucket); err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return c.SendStatus(http.StatusOK)
}

func (h *AdminHandler) RestoreObject(c *fiber.Ctx) error {
	var req struct {
		Bucket    string `json:"bucket"`
		Key       string `json:"key"`
		VersionID string `json:"versionId"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(http.StatusBadRequest).SendString("Invalid request")
	}
	if err := h.Storage.RestoreObject(req.Bucket, req.Key, req.VersionID); err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return c.SendStatus(http.StatusOK)
}

func (h *AdminHandler) DeleteTrashObject(c *fiber.Ctx) error {
	bucket := c.Query("bucket")
	key := c.Query("key")
	versionID := c.Query("versionId")

	if bucket == "" || key == "" {
		return c.Status(http.StatusBadRequest).SendString("Missing bucket or key")
	}

	// Permanent deletion from trash
	if err := h.Storage.DeleteTrashObject(bucket, key, versionID); err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return c.SendStatus(http.StatusOK)
}

func (h *AdminHandler) BulkRestoreObjects(c *fiber.Ctx) error {
	var req struct {
		Items []struct {
			Bucket    string `json:"bucket"`
			Key       string `json:"key"`
			VersionID string `json:"versionId"`
		} `json:"items"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(http.StatusBadRequest).SendString("Invalid request")
	}

	for _, item := range req.Items {
		h.Storage.RestoreObject(item.Bucket, item.Key, item.VersionID)
	}
	return c.SendStatus(http.StatusOK)
}

func (h *AdminHandler) BulkDeleteTrashObjects(c *fiber.Ctx) error {
	var req struct {
		Items []struct {
			Bucket    string `json:"bucket"`
			Key       string `json:"key"`
			VersionID string `json:"versionId"`
		} `json:"items"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(http.StatusBadRequest).SendString("Invalid request")
	}

	for _, item := range req.Items {
		h.Storage.DeleteTrashObject(item.Bucket, item.Key, item.VersionID)
	}

	// Notify if significant number of items deleted
	if len(req.Items) > 0 {
		if fs, ok := h.Storage.(*storage.FileStorage); ok && fs.Notifier != nil {
			fs.Notifier.SendAlert("Start Bulk Deletion", fmt.Sprintf("Admin initiated permanent deletion of %d items from trash.", len(req.Items)))
		}
	}

	return c.SendStatus(http.StatusOK)
}

func (h *AdminHandler) ShareObject(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	var req struct {
		Key           string `json:"key"`
		VersionID     string `json:"versionId"`
		ExpirySeconds int    `json:"expirySeconds"`
		AllowedIP     string `json:"allowedIp"`
		OneTimeUse    bool   `json:"oneTimeUse"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(http.StatusBadRequest).SendString("Invalid request")
	}

	if req.ExpirySeconds <= 0 {
		req.ExpirySeconds = 3600 // Default 1 hour
	}

	presignedURL, err := h.GeneratePresignedURL(bucket, req.Key, req.VersionID, time.Duration(req.ExpirySeconds)*time.Second, req.AllowedIP, req.OneTimeUse)
	if err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}

	return c.JSON(fiber.Map{
		"url": presignedURL,
	})
}

func (h *AdminHandler) VerifyAdminPassword(c *fiber.Ctx) error {
	var req struct {
		Password string `json:"password"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(http.StatusBadRequest).SendString("Invalid request")
	}

	username, ok := c.Locals("username").(string)
	if !ok {
		return c.Status(http.StatusUnauthorized).SendString("User context missing")
	}

	valid, err := h.UserManager.VerifyPassword(username, req.Password)
	if err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	if !valid {
		return c.Status(http.StatusUnauthorized).SendString("Invalid password")
	}

	return c.JSON(fiber.Map{"valid": true})
}

func (h *AdminHandler) GeneratePresignedURL(bucket, key, versionID string, expiry time.Duration, allowedIP string, oneTimeUse bool) (string, error) {
	keys, err := h.UserManager.GetAccessKeys("admin")
	if err != nil || len(keys) == 0 {
		// Fallback to "admin" if current user keys not found - simple hack for feature
		return "", fmt.Errorf("no access keys available for signing (admin)")
	}
	accessKey := keys[0].AccessKeyID
	secretKey := keys[0].SecretAccessKey

	region := "us-east-1"
	date := time.Now().UTC()
	algorithm := "AWS4-HMAC-SHA256"
	service := "s3"

	// Use S3Port for presigned URLs
	hostPort := h.S3Port
	if hostPort == "" {
		hostPort = "9000"
	}
	host := "localhost:" + hostPort
	if envHost := os.Getenv("SERVER_HOST"); envHost != "" {
		host = envHost
	}

	// URL components often need to be encoded
	encodedKey := ""
	parts := strings.Split(key, "/")
	for i, part := range parts {
		if i > 0 {
			encodedKey += "/"
		}
		encodedKey += url.PathEscape(part)
	}

	endpoint := fmt.Sprintf("http://%s/%s/%s", host, bucket, encodedKey)

	query := url.Values{}
	query.Set("X-Amz-Algorithm", algorithm)
	query.Set("X-Amz-Credential", fmt.Sprintf("%s/%s/%s/%s/aws4_request", accessKey, date.Format("20060102"), region, service))
	query.Set("X-Amz-Date", date.Format("20060102T150405Z"))
	query.Set("X-Amz-Expires", strconv.Itoa(int(expiry.Seconds())))
	query.Set("X-Amz-SignedHeaders", "host")
	if versionID != "" && versionID != "simple" && versionID != "folder" {
		query.Set("versionId", versionID)
		endpoint += "?versionId=" + versionID
	}

	if allowedIP != "" {
		query.Set("X-Amz-Allowed-IP", allowedIP)
	}
	if oneTimeUse {
		query.Set("X-Amz-One-Time-Use", "true")
	}

	canonicalURI := fmt.Sprintf("/%s/%s", bucket, encodedKey)

	// Encode and fix spaces for canonical query
	canonicalQuery := strings.ReplaceAll(query.Encode(), "+", "%20")

	canonicalHeaders := fmt.Sprintf("host:%s\n", host)
	signedHeaders := "host"
	payloadHash := "UNSIGNED-PAYLOAD"

	canonicalRequest := fmt.Sprintf("GET\n%s\n%s\n%s\n%s\n%s", canonicalURI, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash)

	credentialScope := fmt.Sprintf("%s/%s/%s/aws4_request", date.Format("20060102"), region, service)
	stringToSign := fmt.Sprintf("%s\n%s\n%s\n%s", algorithm, date.Format("20060102T150405Z"), credentialScope, auth.Sha256Hex(canonicalRequest))

	signature := auth.CalculateSignature(secretKey, date.Format("20060102"), region, service, stringToSign)

	finalURL := fmt.Sprintf("%s?%s&X-Amz-Signature=%s", endpoint, canonicalQuery, signature)
	// If versionID was added to endpoint manually above, we need to be careful not to duplicate ? or &
	// Actually, endpoint has ?versionId=...
	if strings.Contains(endpoint, "?") {
		finalURL = fmt.Sprintf("%s&%s&X-Amz-Signature=%s", endpoint, canonicalQuery, signature)
	}

	return finalURL, nil
}

func (h *AdminHandler) GetSystemSettings(c *fiber.Ctx) error {
	fs, ok := h.Storage.(*storage.FileStorage)
	if !ok {
		return c.Status(http.StatusInternalServerError).SendString("Storage type not supported")
	}

	slackWebhook, err := fs.DB.GetSystemSetting("slack_webhook_url")
	if err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}

	return c.JSON(fiber.Map{
		"slack_webhook_url": slackWebhook,
	})
}

func (h *AdminHandler) UpdateSystemSettings(c *fiber.Ctx) error {
	var req struct {
		SlackWebhookURL string `json:"slack_webhook_url"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(http.StatusBadRequest).SendString("Invalid request")
	}

	fs, ok := h.Storage.(*storage.FileStorage)
	if !ok {
		return c.Status(http.StatusInternalServerError).SendString("Storage type not supported")
	}

	if err := fs.DB.SetSystemSetting("slack_webhook_url", req.SlackWebhookURL); err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}

	return c.SendStatus(http.StatusOK)
}
