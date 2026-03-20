package s3

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/GravSpace/GravSpace/internal/storage"
	"github.com/gofiber/fiber/v2"
)

func init() {
	// Register common mime types that might be missing on some systems
	mime.AddExtensionType(".png", "image/png")
	mime.AddExtensionType(".jpg", "image/jpeg")
	mime.AddExtensionType(".jpeg", "image/jpeg")
	mime.AddExtensionType(".gif", "image/gif")
	mime.AddExtensionType(".svg", "image/svg+xml")
	mime.AddExtensionType(".webp", "image/webp")
	mime.AddExtensionType(".pdf", "application/pdf")
	mime.AddExtensionType(".txt", "text/plain")
	mime.AddExtensionType(".html", "text/html")
	mime.AddExtensionType(".css", "text/css")
	mime.AddExtensionType(".js", "application/javascript")
	mime.AddExtensionType(".json", "application/json")
}

type S3Handler struct {
	Storage storage.Storage
}

type ListAllMyBucketsResult struct {
	XMLName xml.Name `xml:"ListAllMyBucketsResult"`
	Owner   Owner    `xml:"Owner"`
	Buckets []Bucket `xml:"Buckets>Bucket"`
}

type Owner struct {
	ID          string `xml:"ID"`
	DisplayName string `xml:"DisplayName"`
}

type Bucket struct {
	Name         string `xml:"Name"`
	CreationDate string `xml:"CreationDate"`
}

type ListBucketResult struct {
	XMLName        xml.Name  `xml:"ListBucketResult"`
	Name           string    `xml:"Name"`
	Prefix         string    `xml:"Prefix"`
	Delimiter      string    `xml:"Delimiter"`
	Contents       []Content `xml:"Contents"`
	CommonPrefixes []string  `xml:"CommonPrefixes>Prefix"`
}

type ListBucketV2Result struct {
	XMLName               xml.Name  `xml:"ListBucketResult"`
	Name                  string    `xml:"Name"`
	Prefix                string    `xml:"Prefix"`
	Delimiter             string    `xml:"Delimiter"`
	IsTruncated           bool      `xml:"IsTruncated"`
	Contents              []Content `xml:"Contents"`
	CommonPrefixes        []string  `xml:"CommonPrefixes>Prefix"`
	KeyCount              int       `xml:"KeyCount"`
	MaxKeys               int       `xml:"MaxKeys"`
	ContinuationToken     string    `xml:"ContinuationToken,omitempty"`
	NextContinuationToken string    `xml:"NextContinuationToken,omitempty"`
}

type Content struct {
	Key          string `xml:"Key"`
	LastModified string `xml:"LastModified"`
	ETag         string `xml:"ETag"`
	Size         int64  `xml:"Size"`
	StorageClass string `xml:"StorageClass"`
}

type ListVersionsResult struct {
	XMLName        xml.Name  `xml:"ListVersionsResult"`
	Name           string    `xml:"Name"`
	Prefix         string    `xml:"Prefix"`
	Delimiter      string    `xml:"Delimiter"`
	Versions       []Version `xml:"Version"`
	CommonPrefixes []string  `xml:"CommonPrefixes>Prefix"`
}

type Version struct {
	Key          string `xml:"Key"`
	VersionId    string `xml:"VersionId"`
	IsLatest     bool   `xml:"IsLatest"`
	LastModified string `xml:"LastModified"`
	Size         int64  `xml:"Size"`
}

type InitiateMultipartUploadResult struct {
	XMLName  xml.Name `xml:"InitiateMultipartUploadResult"`
	Bucket   string   `xml:"Bucket"`
	Key      string   `xml:"Key"`
	UploadId string   `xml:"UploadId"`
}

type CompleteMultipartUpload struct {
	XMLName xml.Name `xml:"CompleteMultipartUpload"`
	Parts   []struct {
		PartNumber int    `xml:"PartNumber"`
		ETag       string `xml:"ETag"`
	} `xml:"Part"`
}

type CompleteMultipartUploadResult struct {
	XMLName  xml.Name `xml:"CompleteMultipartUploadResult"`
	Location string   `xml:"Location"`
	Bucket   string   `xml:"Bucket"`
	Key      string   `xml:"Key"`
	ETag     string   `xml:"ETag"`
}

type DeleteRequest struct {
	XMLName xml.Name `xml:"Delete"`
	Quiet   bool     `xml:"Quiet"`
	Objects []struct {
		Key       string `xml:"Key"`
		VersionId string `xml:"VersionId,omitempty"`
	} `xml:"Object"`
}

type DeleteResult struct {
	XMLName xml.Name `xml:"DeleteResult"`
	Deleted []struct {
		Key       string `xml:"Key"`
		VersionId string `xml:"VersionId,omitempty"`
	} `xml:"Deleted"`
	Error []struct {
		Key     string `xml:"Key"`
		Code    string `xml:"Code"`
		Message string `xml:"Message"`
	} `xml:"Error"`
}

type Tagging struct {
	XMLName xml.Name `xml:"Tagging"`
	TagSet  []Tag    `xml:"TagSet>Tag"`
}

type Tag struct {
	Key   string `xml:"Key"`
	Value string `xml:"Value"`
}

type CORSConfiguration struct {
	XMLName   xml.Name   `xml:"CORSConfiguration"`
	CORSRules []CORSRule `xml:"CORSRule"`
}

type CORSRule struct {
	AllowedOrigins []string `xml:"AllowedOrigin"`
	AllowedMethods []string `xml:"AllowedMethod"`
	AllowedHeaders []string `xml:"AllowedHeader"`
	MaxAgeSeconds  int      `xml:"MaxAgeSeconds"`
	ExposeHeaders  []string `xml:"ExposeHeader"`
}

type LifecycleConfiguration struct {
	XMLName xml.Name        `xml:"LifecycleConfiguration"`
	Rules   []LifecycleRule `xml:"Rule"`
}

type LifecycleRule struct {
	ID         string            `xml:"ID"`
	Status     string            `xml:"Status"`
	Filter     LifecycleFilter   `xml:"Filter"`
	Expiration ElementExpiration `xml:"Expiration"`
}

type LifecycleFilter struct {
	Prefix string `xml:"Prefix"`
}

type ElementExpiration struct {
	Days int `xml:"Days"`
}

type ObjectLockConfiguration struct {
	XMLName           xml.Name        `xml:"ObjectLockConfiguration"`
	ObjectLockEnabled string          `xml:"ObjectLockEnabled"`
	Rule              *ObjectLockRule `xml:"Rule,omitempty"`
}

type ObjectLockRule struct {
	DefaultRetention *DefaultRetention `xml:"DefaultRetention"`
}

type DefaultRetention struct {
	Mode string `xml:"Mode"`
	Days int    `xml:"Days"`
}

func (h *S3Handler) PostBucket(c *fiber.Ctx) error {
	bucket := c.Params("bucket")

	// Batch Delete
	if c.Query("delete") != "" || strings.Contains(c.OriginalURL(), "?delete") {
		var req DeleteRequest
		if err := xml.NewDecoder(c.Context().RequestBodyStream()).Decode(&req); err != nil {
			return c.Status(http.StatusBadRequest).SendString(err.Error())
		}

		bypass := c.Get("x-amz-bypass-governance-retention") == "true"
		result := DeleteResult{}
		for _, obj := range req.Objects {
			if err := h.Storage.DeleteObject(bucket, obj.Key, obj.VersionId, bypass); err != nil {
				result.Error = append(result.Error, struct {
					Key     string `xml:"Key"`
					Code    string `xml:"Code"`
					Message string `xml:"Message"`
				}{Key: obj.Key, Code: "InternalError", Message: err.Error()})
			} else if !req.Quiet {
				result.Deleted = append(result.Deleted, struct {
					Key       string `xml:"Key"`
					VersionId string `xml:"VersionId,omitempty"`
				}{Key: obj.Key, VersionId: obj.VersionId})
			}
		}

		c.Set(fiber.HeaderContentType, fiber.MIMEApplicationXML)
		return c.XML(result)
	}

	return c.SendStatus(http.StatusNotFound)
}

func (h *S3Handler) PutBucket(c *fiber.Ctx) error {
	bucket := c.Params("bucket")

	// CORS
	if c.Query("cors") != "" || strings.Contains(c.OriginalURL(), "?cors") {
		var req CORSConfiguration
		if err := xml.NewDecoder(c.Context().RequestBodyStream()).Decode(&req); err != nil {
			return c.Status(http.StatusBadRequest).SendString(err.Error())
		}

		config := storage.CORSConfiguration{}
		for _, r := range req.CORSRules {
			config.CORSRules = append(config.CORSRules, storage.CORSRule{
				AllowedOrigins: r.AllowedOrigins,
				AllowedMethods: r.AllowedMethods,
				AllowedHeaders: r.AllowedHeaders,
				MaxAgeSeconds:  r.MaxAgeSeconds,
				ExposeHeaders:  r.ExposeHeaders,
			})
		}

		if err := h.Storage.PutBucketCors(bucket, config); err != nil {
			return h.sendS3Error(c, "InternalError", err.Error(), bucket, "")
		}
		return c.SendStatus(http.StatusOK)
	}

	// Lifecycle
	if c.Query("lifecycle") != "" || strings.Contains(c.OriginalURL(), "?lifecycle") {
		var req LifecycleConfiguration
		if err := xml.NewDecoder(c.Context().RequestBodyStream()).Decode(&req); err != nil {
			return c.Status(http.StatusBadRequest).SendString(err.Error())
		}

		config := storage.LifecycleConfiguration{}
		for _, r := range req.Rules {
			config.Rules = append(config.Rules, storage.LifecycleRule{
				ID:     r.ID,
				Status: r.Status,
				Filter: storage.LifecycleFilter{
					Prefix: r.Filter.Prefix,
				},
				Expiration: storage.ElementExpiration{
					Days: r.Expiration.Days,
				},
			})
		}

		if err := h.Storage.PutBucketLifecycle(bucket, config); err != nil {
			return h.sendS3Error(c, "InternalError", err.Error(), bucket, "")
		}
		return c.SendStatus(http.StatusOK)
	}

	// Object Lock
	if c.Query("object-lock") != "" || strings.Contains(c.OriginalURL(), "?object-lock") {
		var req ObjectLockConfiguration
		if err := xml.NewDecoder(c.Context().RequestBodyStream()).Decode(&req); err != nil {
			return c.Status(http.StatusBadRequest).SendString(err.Error())
		}
		enabled := req.ObjectLockEnabled == "Enabled"
		if err := h.Storage.SetBucketObjectLock(bucket, enabled); err != nil {
			return h.sendS3Error(c, "InternalError", err.Error(), bucket, "")
		}
		if req.Rule != nil && req.Rule.DefaultRetention != nil {
			if err := h.Storage.SetBucketDefaultRetention(bucket, req.Rule.DefaultRetention.Mode, req.Rule.DefaultRetention.Days); err != nil {
				return h.sendS3Error(c, "InternalError", err.Error(), bucket, "")
			}
		}
		return c.SendStatus(http.StatusOK)
	}

	exists, err := h.Storage.BucketExists(bucket)
	if err != nil {
		return h.sendS3Error(c, "InternalError", err.Error(), bucket, "")
	}
	if exists {
		return c.SendStatus(http.StatusOK)
	}
	if err := h.Storage.CreateBucket(bucket); err != nil {
		return h.sendS3Error(c, "InternalError", err.Error(), bucket, "")
	}
	return c.SendStatus(http.StatusOK)
}

func (h *S3Handler) sendS3Error(c *fiber.Ctx, code, message, bucket, key string) error {
	// Simple helper to match existing error patterns if any, or just return status
	return c.Status(http.StatusInternalServerError).SendString(message)
}

func (h *S3Handler) ListBuckets(c *fiber.Ctx) error {
	buckets, err := h.Storage.ListBuckets()
	if err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}

	result := ListAllMyBucketsResult{
		Owner: Owner{ID: "admin", DisplayName: "admin"},
	}
	for _, b := range buckets {
		result.Buckets = append(result.Buckets, Bucket{Name: b, CreationDate: "2026-01-01T00:00:00Z"})
	}

	c.Set(fiber.HeaderContentType, fiber.MIMEApplicationXML)
	return c.XML(result)
}

func (h *S3Handler) CreateBucket(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	exists, err := h.Storage.BucketExists(bucket)
	if err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	if exists {
		// S3 returns 200 if you already own it, but for simplicity/clarity
		// we can keep it as is or return 200. Let's return 200 to be compatible
		// with "idempotent" create bucket behavior often expected.
		return c.SendStatus(http.StatusOK)
	}
	if err := h.Storage.CreateBucket(bucket); err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return c.SendStatus(http.StatusOK)
}

func (h *S3Handler) HeadBucket(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	exists, err := h.Storage.BucketExists(bucket)
	if err != nil {
		return c.SendStatus(http.StatusInternalServerError)
	}
	if !exists {
		return c.SendStatus(http.StatusNotFound)
	}
	return c.SendStatus(http.StatusOK)
}

func (h *S3Handler) GetObject(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	key := c.Params("*")
	versionID := c.Query("versionId")

	if c.Query("tagging") != "" || strings.Contains(c.OriginalURL(), "?tagging") {
		tags, err := h.Storage.GetObjectTagging(bucket, key, versionID)
		if err != nil {
			return c.Status(http.StatusInternalServerError).SendString(err.Error())
		}
		result := Tagging{}
		for k, v := range tags {
			result.TagSet = append(result.TagSet, Tag{Key: k, Value: v})
		}
		c.Set(fiber.HeaderContentType, fiber.MIMEApplicationXML)
		return c.XML(result)
	}

	reader, obj, err := h.Storage.GetObject(bucket, key, versionID)
	if err != nil {
		return c.SendStatus(http.StatusNotFound)
	}

	// Use metadata directly from Object
	if obj.EncryptionType != "" {
		c.Set("x-amz-server-side-encryption", obj.EncryptionType)
	}

	contentType := obj.ContentType
	if contentType == "" || contentType == "application/octet-stream" {
		if extType := mime.TypeByExtension(filepath.Ext(key)); extType != "" {
			contentType = extType
		}
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	// Set S3 headers
	c.Set("x-amz-version-id", obj.VersionID)
	c.Set("ETag", fmt.Sprintf("\"%s\"", obj.VersionID))
	c.Set("Last-Modified", obj.ModTime.Format(time.RFC1123))

	// Handle Range Request
	rangeHeader := c.Get("Range")
	if rangeHeader != "" && strings.HasPrefix(rangeHeader, "bytes=") {
		var start, end int64
		fmt.Sscanf(rangeHeader, "bytes=%d-%d", &start, &end)
		if end == 0 || end >= obj.Size {
			end = obj.Size - 1
		}

		contentLength := end - start + 1
		c.Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, obj.Size))
		c.Set("Content-Length", fmt.Sprintf("%d", contentLength))

		// Skip 'start' bytes
		io.CopyN(io.Discard, reader, start)
		c.Type(contentType)
		return c.Status(http.StatusPartialContent).SendStream(io.LimitReader(reader, contentLength))
	}

	// Support response-content-disposition query param
	if disp := c.Query("response-content-disposition"); disp != "" {
		c.Set("Content-Disposition", disp)
	} else if c.Query("download") == "true" {
		filename := filepath.Base(key)
		c.Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	}

	c.Set("Content-Length", fmt.Sprintf("%d", obj.Size))
	c.Type(contentType)
	return c.SendStream(reader)
}

func (h *S3Handler) HeadObject(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	key := c.Params("*")
	versionID := c.Query("versionId")

	obj, err := h.Storage.StatObject(bucket, key, versionID)
	if err != nil {
		return c.SendStatus(http.StatusNotFound)
	}

	contentType := obj.ContentType
	if contentType == "" || contentType == "application/octet-stream" {
		if extType := mime.TypeByExtension(filepath.Ext(key)); extType != "" {
			contentType = extType
		}
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	c.Set(fiber.HeaderContentType, contentType)
	c.Set(fiber.HeaderContentLength, fmt.Sprintf("%d", obj.Size))
	c.Set(fiber.HeaderLastModified, obj.ModTime.Format(time.RFC1123))
	c.Set("x-amz-version-id", obj.VersionID)
	c.Set("ETag", fmt.Sprintf("\"%s\"", obj.VersionID))
	if obj.EncryptionType != "" {
		c.Set("x-amz-server-side-encryption", obj.EncryptionType)
	}

	return c.SendStatus(http.StatusOK)
}

func (h *S3Handler) PutObject(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	key := c.Params("*")
	uploadID := c.Query("uploadId")
	partNumber := c.Query("partNumber")
	versionID := c.Query("versionId")

	if c.Query("tagging") != "" || strings.Contains(c.OriginalURL(), "?tagging") {
		var req Tagging
		if err := xml.NewDecoder(c.Context().RequestBodyStream()).Decode(&req); err != nil {
			return c.Status(http.StatusBadRequest).SendString(err.Error())
		}
		tags := make(map[string]string)
		for _, t := range req.TagSet {
			tags[t.Key] = t.Value
		}
		if err := h.Storage.PutObjectTagging(bucket, key, versionID, tags); err != nil {
			return c.Status(http.StatusInternalServerError).SendString(err.Error())
		}
		return c.SendStatus(http.StatusOK)
	}

	if uploadID != "" && partNumber != "" {
		var pn int
		fmt.Sscanf(partNumber, "%d", &pn)
		etag, err := h.Storage.UploadPart(bucket, key, uploadID, pn, c.Context().RequestBodyStream())
		if err != nil {
			return c.Status(http.StatusInternalServerError).SendString(err.Error())
		}
		c.Set("ETag", etag)
		return c.SendStatus(http.StatusOK)
	}

	encryptionType := c.Get("x-amz-server-side-encryption")
	
	// Fallback to c.Body() if RequestBodyStream is nil
	reader := io.Reader(c.Context().RequestBodyStream())
	if reader == nil {
		reader = bytes.NewReader(c.Body())
	}

	vid, err := h.Storage.PutObject(bucket, key, reader, encryptionType)
	if err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	if encryptionType != "" {
		c.Set("x-amz-server-side-encryption", encryptionType)
	}
	c.Set("x-amz-version-id", vid)
	return c.SendStatus(http.StatusOK)
}

func (h *S3Handler) PostObject(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	key := c.Params("*")
	uploadID := c.Query("uploadId")

	// Initiate Multipart Upload
	if c.Query("uploads") != "" || strings.Contains(c.OriginalURL(), "?uploads") {
		uid, err := h.Storage.InitiateMultipartUpload(bucket, key)
		if err != nil {
			return c.Status(http.StatusInternalServerError).SendString(err.Error())
		}
		result := InitiateMultipartUploadResult{
			Bucket:   bucket,
			Key:      key,
			UploadId: uid,
		}
		c.Set(fiber.HeaderContentType, fiber.MIMEApplicationXML)
		return c.XML(result)
	}

	// Complete Multipart Upload
	if uploadID != "" {
		var req CompleteMultipartUpload
		if err := xml.NewDecoder(c.Context().RequestBodyStream()).Decode(&req); err != nil {
			return c.Status(http.StatusBadRequest).SendString(err.Error())
		}

		var parts []storage.Part
		for _, p := range req.Parts {
			parts = append(parts, storage.Part{
				PartNumber: p.PartNumber,
				ETag:       p.ETag,
			})
		}

		vid, err := h.Storage.CompleteMultipartUpload(bucket, key, uploadID, parts)
		if err != nil {
			return c.Status(http.StatusInternalServerError).SendString(err.Error())
		}

		result := CompleteMultipartUploadResult{
			Location: fmt.Sprintf("http://%s/%s/%s", c.Hostname(), bucket, key),
			Bucket:   bucket,
			Key:      key,
			ETag:     fmt.Sprintf("\"%s\"", vid),
		}
		c.Set("x-amz-version-id", vid)
		c.Set(fiber.HeaderContentType, fiber.MIMEApplicationXML)
		return c.XML(result)
	}

	return c.SendStatus(http.StatusNotFound)
}

func (h *S3Handler) DeleteObject(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	key := c.Params("*")
	versionID := c.Query("versionId")
	uploadID := c.Query("uploadId")

	if uploadID != "" {
		if err := h.Storage.AbortMultipartUpload(bucket, key, uploadID); err != nil {
			return c.Status(http.StatusInternalServerError).SendString(err.Error())
		}
		return c.SendStatus(http.StatusNoContent)
	}

	bypass := c.Get("x-amz-bypass-governance-retention") == "true"
	if err := h.Storage.DeleteObject(bucket, key, versionID, bypass); err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return c.SendStatus(http.StatusNoContent)
}

func (h *S3Handler) DeleteBucket(c *fiber.Ctx) error {
	bucket := c.Params("bucket")

	// CORS
	if c.Query("cors") != "" || strings.Contains(c.OriginalURL(), "?cors") {
		if err := h.Storage.DeleteBucketCors(bucket); err != nil {
			return h.sendS3Error(c, "InternalError", err.Error(), bucket, "")
		}
		return c.SendStatus(http.StatusNoContent)
	}

	// Lifecycle
	if c.Query("lifecycle") != "" || strings.Contains(c.OriginalURL(), "?lifecycle") {
		if err := h.Storage.DeleteBucketLifecycle(bucket); err != nil {
			return h.sendS3Error(c, "InternalError", err.Error(), bucket, "")
		}
		return c.SendStatus(http.StatusNoContent)
	}

	if err := h.Storage.DeleteBucket(bucket); err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}
	return c.SendStatus(http.StatusNoContent)
}

func (h *S3Handler) ListObjects(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	prefix := c.Query("prefix")
	delimiter := c.Query("delimiter")
	listType := c.Query("list-type")

	// CORS
	if c.Query("cors") != "" || strings.Contains(c.OriginalURL(), "?cors") {
		config, err := h.Storage.GetBucketCors(bucket)
		if err != nil {
			return h.sendS3Error(c, "NoSuchCORSConfiguration", "The CORS configuration does not exist", bucket, "")
		}

		result := CORSConfiguration{}
		for _, r := range config.CORSRules {
			result.CORSRules = append(result.CORSRules, CORSRule{
				AllowedOrigins: r.AllowedOrigins,
				AllowedMethods: r.AllowedMethods,
				AllowedHeaders: r.AllowedHeaders,
				MaxAgeSeconds:  r.MaxAgeSeconds,
				ExposeHeaders:  r.ExposeHeaders,
			})
		}

		c.Set(fiber.HeaderContentType, fiber.MIMEApplicationXML)
		return c.XML(result)
	}

	// Lifecycle
	if c.Query("lifecycle") != "" || strings.Contains(c.OriginalURL(), "?lifecycle") {
		config, err := h.Storage.GetBucketLifecycle(bucket)
		if err != nil {
			return h.sendS3Error(c, "NoSuchLifecycleConfiguration", "The lifecycle configuration does not exist", bucket, "")
		}

		result := LifecycleConfiguration{}
		for _, r := range config.Rules {
			result.Rules = append(result.Rules, LifecycleRule{
				ID:     r.ID,
				Status: r.Status,
				Filter: LifecycleFilter{
					Prefix: r.Filter.Prefix,
				},
				Expiration: ElementExpiration{
					Days: r.Expiration.Days,
				},
			})
		}

		c.Set(fiber.HeaderContentType, fiber.MIMEApplicationXML)
		return c.XML(result)
	}
	// Object Lock
	if c.Query("object-lock") != "" || strings.Contains(c.OriginalURL(), "?object-lock") {
		enabled, mode, days, err := h.Storage.GetBucketObjectLock(bucket)
		if err != nil {
			return h.sendS3Error(c, "InternalError", err.Error(), bucket, "")
		}
		result := ObjectLockConfiguration{
			ObjectLockEnabled: "Disabled",
		}
		if enabled {
			result.ObjectLockEnabled = "Enabled"
		}
		if mode != "" {
			result.Rule = &ObjectLockRule{
				DefaultRetention: &DefaultRetention{
					Mode: mode,
					Days: days,
				},
			}
		}
		c.Set(fiber.HeaderContentType, fiber.MIMEApplicationXML)
		return c.XML(result)
	}

	// Check if this is a ListVersions request
	if c.Query("versions") != "" || strings.Contains(c.OriginalURL(), "?versions") {
		return h.ListVersions(c)
	}

	objects, commonPrefixes, err := h.Storage.ListObjects(bucket, prefix, delimiter, "")
	if err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}

	if listType == "2" {
		result := ListBucketV2Result{
			Name:           bucket,
			Prefix:         prefix,
			Delimiter:      delimiter,
			CommonPrefixes: commonPrefixes,
			MaxKeys:        1000,
			KeyCount:       len(objects) + len(commonPrefixes),
			IsTruncated:    false,
		}
		for _, o := range objects {
			result.Contents = append(result.Contents, Content{
				Key:          o.Key,
				Size:         o.Size,
				LastModified: o.ModTime.Format(time.RFC1123),
				ETag:         fmt.Sprintf("\"%s\"", o.VersionID),
				StorageClass: "STANDARD",
			})
		}
		c.Set(fiber.HeaderContentType, fiber.MIMEApplicationXML)
		return c.XML(result)
	}

	result := ListBucketResult{
		Name:           bucket,
		Prefix:         prefix,
		Delimiter:      delimiter,
		CommonPrefixes: commonPrefixes,
	}
	for _, o := range objects {
		result.Contents = append(result.Contents, Content{
			Key:          o.Key,
			Size:         o.Size,
			LastModified: o.ModTime.Format(time.RFC1123),
			ETag:         fmt.Sprintf("\"%s\"", o.VersionID),
			StorageClass: "STANDARD",
		})
	}

	c.Set(fiber.HeaderContentType, fiber.MIMEApplicationXML)
	return c.XML(result)
}

func (h *S3Handler) ListVersions(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	prefix := c.Query("prefix")
	delimiter := c.Query("delimiter")

	objects, _, err := h.Storage.ListObjects(bucket, prefix, "", "") // Get all objects first
	if err != nil {
		return c.Status(http.StatusInternalServerError).SendString(err.Error())
	}

	result := ListVersionsResult{
		Name:      bucket,
		Prefix:    prefix,
		Delimiter: delimiter,
	}

	for _, o := range objects {
		versions, err := h.Storage.ListVersions(bucket, o.Key)
		if err != nil {
			continue
		}
		for _, v := range versions {
			result.Versions = append(result.Versions, Version{
				Key:          v.Key,
				VersionId:    v.VersionID,
				IsLatest:     v.IsLatest,
				Size:         v.Size,
				LastModified: v.ModTime.Format(time.RFC1123),
			})
		}
	}

	c.Set(fiber.HeaderContentType, fiber.MIMEApplicationXML)
	return c.XML(result)
}

// ServeWebsite serves static website content from a bucket
func (h *S3Handler) ServeWebsite(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	path := c.Params("*")

	// Get website configuration
	config, err := h.Storage.GetBucketWebsite(bucket)
	if err != nil || config == nil {
		return c.Status(http.StatusNotFound).SendString("Website configuration not found for this bucket")
	}

	// Determine the key to fetch
	key := path
	if key == "" || strings.HasSuffix(key, "/") {
		// Directory request - append index document
		if config.IndexDocument != nil && config.IndexDocument.Suffix != "" {
			key = key + config.IndexDocument.Suffix
		} else {
			key = key + "index.html" // Default
		}
	}

	// Try to get the object
	reader, obj, err := h.Storage.GetObject(bucket, key, "")
	if err != nil {
		// Object not found - serve error document if configured
		if config.ErrorDocument != nil && config.ErrorDocument.Key != "" {
			errorReader, _, errorErr := h.Storage.GetObject(bucket, config.ErrorDocument.Key, "")
			if errorErr == nil {
				contentType := mime.TypeByExtension(filepath.Ext(config.ErrorDocument.Key))
				if contentType == "" {
					contentType = "text/html"
				}
				c.Type(contentType)
				return c.Status(http.StatusNotFound).SendStream(errorReader)
			}
		}
		return c.Status(http.StatusNotFound).SendString("Not Found")
	}

	// Determine content type
	contentType := obj.ContentType
	if contentType == "" || contentType == "application/octet-stream" {
		if extType := mime.TypeByExtension(filepath.Ext(key)); extType != "" {
			contentType = extType
		}
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	// Set headers
	c.Set("x-amz-version-id", obj.VersionID)
	c.Set("ETag", fmt.Sprintf("\"%s\"", obj.VersionID))
	c.Set("Last-Modified", obj.ModTime.Format(time.RFC1123))
	c.Set("Content-Length", fmt.Sprintf("%d", obj.Size))

	c.Type(contentType)
	return c.SendStream(reader)
}
