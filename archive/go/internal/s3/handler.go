package s3

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/GravSpace/GravSpace/internal/storage"
	"github.com/gin-gonic/gin"
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

type LocationConstraintResult struct {
	XMLName xml.Name `xml:"http://s3.amazonaws.com/doc/2006-03-01/ LocationConstraint"`
	Region  string   `xml:",chardata"`
}

type AccessControlPolicy struct {
	XMLName           xml.Name          `xml:"http://s3.amazonaws.com/doc/2006-03-01/ AccessControlPolicy"`
	Owner             Owner             `xml:"Owner"`
	AccessControlList AccessControlList `xml:"AccessControlList"`
}

type AccessControlList struct {
	Grants []Grant `xml:"Grant"`
}

type Grant struct {
	Grantee    Grantee `xml:"Grantee"`
	Permission string  `xml:"Permission"`
}

type Grantee struct {
	XMLNSXSI    string `xml:"xmlns:xsi,attr"`
	XSIType     string `xml:"xsi:type,attr"`
	ID          string `xml:"ID"`
	DisplayName string `xml:"DisplayName"`
}

type S3Error struct {
	XMLName    xml.Name `xml:"Error"`
	Code       string   `xml:"Code"`
	Message    string   `xml:"Message"`
	Key        string   `xml:"Key,omitempty"`
	BucketName string   `xml:"BucketName,omitempty"`
	Resource   string   `xml:"Resource,omitempty"`
	RequestId  string   `xml:"RequestId,omitempty"`
	HostId     string   `xml:"HostId,omitempty"`
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

func (h *S3Handler) getBucketAndKey(c *gin.Context) (bucket, key string) {
	bucket = c.Param("bucket")
	key = c.Param("key")

	if bucket == "" {
		p := strings.TrimPrefix(c.Request.URL.Path, "/")
		parts := strings.SplitN(p, "/", 2)
		if len(parts) > 0 {
			bucket = parts[0]
			if len(parts) > 1 {
				key = parts[1]
			}
		}
	}
	key = strings.TrimPrefix(key, "/")
	return bucket, key
}

func (h *S3Handler) PostBucket(c *gin.Context) {
	bucket, _ := h.getBucketAndKey(c)

	// Batch Delete
	if c.Query("delete") != "" || strings.Contains(c.Request.URL.RawQuery, "delete") {
		var req DeleteRequest
		if err := xml.NewDecoder(c.Request.Body).Decode(&req); err != nil {
			c.String(http.StatusBadRequest, err.Error())
			return
		}

		bypass := c.GetHeader("x-amz-bypass-governance-retention") == "true"
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

		c.Header("Content-Type", "application/xml")
		c.XML(http.StatusOK, result)
		return
	}

	c.Status(http.StatusNotFound)
}

func (h *S3Handler) PutBucket(c *gin.Context) {
	bucket, _ := h.getBucketAndKey(c)

	// CORS
	if c.Query("cors") != "" || strings.Contains(c.Request.URL.RawQuery, "cors") {
		var req CORSConfiguration
		if err := xml.NewDecoder(c.Request.Body).Decode(&req); err != nil {
			c.String(http.StatusBadRequest, err.Error())
			return
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
			h.sendS3Error(c, "InternalError", err.Error(), bucket, "")
			return
		}
		c.Status(http.StatusOK)
		return
	}

	// Lifecycle
	if c.Query("lifecycle") != "" || strings.Contains(c.Request.URL.RawQuery, "lifecycle") {
		var req LifecycleConfiguration
		if err := xml.NewDecoder(c.Request.Body).Decode(&req); err != nil {
			c.String(http.StatusBadRequest, err.Error())
			return
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
			h.sendS3Error(c, "InternalError", err.Error(), bucket, "")
			return
		}
		c.Status(http.StatusOK)
		return
	}

	// Object Lock
	if c.Query("object-lock") != "" || strings.Contains(c.Request.URL.RawQuery, "object-lock") {
		var req ObjectLockConfiguration
		if err := xml.NewDecoder(c.Request.Body).Decode(&req); err != nil {
			c.String(http.StatusBadRequest, err.Error())
			return
		}
		enabled := req.ObjectLockEnabled == "Enabled"
		if err := h.Storage.SetBucketObjectLock(bucket, enabled); err != nil {
			h.sendS3Error(c, "InternalError", err.Error(), bucket, "")
			return
		}
		if req.Rule != nil && req.Rule.DefaultRetention != nil {
			if err := h.Storage.SetBucketDefaultRetention(bucket, req.Rule.DefaultRetention.Mode, req.Rule.DefaultRetention.Days); err != nil {
				h.sendS3Error(c, "InternalError", err.Error(), bucket, "")
				return
			}
		}
		c.Status(http.StatusOK)
		return
	}

	exists, err := h.Storage.BucketExists(bucket)
	if err != nil {
		h.sendS3Error(c, "InternalError", err.Error(), bucket, "")
		return
	}
	if exists {
		c.Status(http.StatusOK)
		return
	}
	if err := h.Storage.CreateBucket(bucket); err != nil {
		h.sendS3Error(c, "InternalError", err.Error(), bucket, "")
		return
	}
	c.Status(http.StatusOK)
}

func (h *S3Handler) sendS3Error(c *gin.Context, code, message, bucket, key string) {
	status := http.StatusInternalServerError
	switch code {
	case "NoSuchBucket", "NoSuchKey", "NotFound":
		status = http.StatusNotFound
	case "AccessDenied", "InvalidAccessKeyId", "SignatureDoesNotMatch":
		status = http.StatusForbidden
	case "NoSuchCORSConfiguration", "NoSuchLifecycleConfiguration":
		status = http.StatusNotFound
	case "BucketAlreadyExists", "BucketAlreadyOwnedByYou":
		status = http.StatusConflict
	case "InvalidArgument", "InvalidBucketName", "MalformedXML":
		status = http.StatusBadRequest
	}

	reqID := make([]byte, 8)
	rand.Read(reqID)
	hostID := make([]byte, 32)
	rand.Read(hostID)

	resource := "/" + bucket
	if key != "" {
		resource += "/" + strings.TrimPrefix(key, "/")
	}

	errRes := S3Error{
		Code:       code,
		Message:    message,
		Key:        key,
		BucketName: bucket,
		Resource:   resource,
		RequestId:  strings.ToUpper(hex.EncodeToString(reqID)),
		HostId:     hex.EncodeToString(hostID),
	}

	c.Header("Content-Type", "application/xml")
	c.XML(status, errRes)
}

func (h *S3Handler) ListBuckets(c *gin.Context) {
	buckets, err := h.Storage.ListBuckets()
	if err != nil {
		h.sendS3Error(c, "InternalError", err.Error(), "", "")
		return
	}

	result := ListAllMyBucketsResult{
		Owner: Owner{ID: "admin", DisplayName: "admin"},
	}
	for _, b := range buckets {
		result.Buckets = append(result.Buckets, Bucket{Name: b, CreationDate: "2026-01-01T00:00:00Z"})
	}

	c.Header("Content-Type", "application/xml")
	c.XML(http.StatusOK, result)
}

func (h *S3Handler) CreateBucket(c *gin.Context) {
	bucket, _ := h.getBucketAndKey(c)
	exists, err := h.Storage.BucketExists(bucket)
	if err != nil {
		h.sendS3Error(c, "InternalError", err.Error(), bucket, "")
		return
	}
	if exists {
		// S3 returns 200 if you already own it
		c.Status(http.StatusOK)
		return
	}
	if err := h.Storage.CreateBucket(bucket); err != nil {
		h.sendS3Error(c, "InternalError", err.Error(), bucket, "")
		return
	}
	c.Status(http.StatusOK)
}

func (h *S3Handler) HeadBucket(c *gin.Context) {
	bucket, _ := h.getBucketAndKey(c)
	if bucket == "" {
		c.Status(http.StatusOK)
		return
	}
	exists, err := h.Storage.BucketExists(bucket)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	if !exists {
		c.Status(http.StatusNotFound)
		return
	}
	c.Status(http.StatusOK)
}

func (h *S3Handler) GetObject(c *gin.Context) {
	bucket, key := h.getBucketAndKey(c)
	if key == "" {
		h.ListObjects(c)
		return
	}
	versionID := c.Query("versionId")

	if c.Query("tagging") != "" || strings.Contains(c.Request.URL.RawQuery, "tagging") {
		tags, err := h.Storage.GetObjectTagging(bucket, key, versionID)
		if err != nil {
			c.String(http.StatusInternalServerError, err.Error())
			return
		}
		result := Tagging{}
		for k, v := range tags {
			result.TagSet = append(result.TagSet, Tag{Key: k, Value: v})
		}
		c.Header("Content-Type", "application/xml")
		c.XML(http.StatusOK, result)
		return
	}

	reader, obj, err := h.Storage.GetObject(bucket, key, versionID)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}

	// Use metadata directly from Object
	if obj.EncryptionType != "" {
		c.Header("x-amz-server-side-encryption", obj.EncryptionType)
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
	c.Header("x-amz-version-id", obj.VersionID)
	c.Header("ETag", fmt.Sprintf("\"%s\"", obj.VersionID))
	c.Header("Last-Modified", obj.ModTime.UTC().Format(http.TimeFormat))

	// Handle Range Request
	rangeHeader := c.GetHeader("Range")
	if rangeHeader != "" && strings.HasPrefix(rangeHeader, "bytes=") {
		var start, end int64
		fmt.Sscanf(rangeHeader, "bytes=%d-%d", &start, &end)
		if end == 0 || end >= obj.Size {
			end = obj.Size - 1
		}

		contentLength := end - start + 1
		c.Header("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, obj.Size))
		c.Header("Content-Length", fmt.Sprintf("%d", contentLength))

		// Skip 'start' bytes
		io.CopyN(io.Discard, reader, start)
		c.DataFromReader(http.StatusPartialContent, contentLength, contentType, io.LimitReader(reader, contentLength), nil)
		return
	}

	// Support response-content-disposition query param
	if disp := c.Query("response-content-disposition"); disp != "" {
		c.Header("Content-Disposition", disp)
	} else if c.Query("download") == "true" {
		filename := filepath.Base(key)
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	}

	c.Header("Content-Length", fmt.Sprintf("%d", obj.Size))
	c.DataFromReader(http.StatusOK, obj.Size, contentType, reader, nil)
}

func (h *S3Handler) HeadObject(c *gin.Context) {
	bucket, key := h.getBucketAndKey(c)
	if key == "" {
		h.HeadBucket(c)
		return
	}
	versionID := c.Query("versionId")

	obj, err := h.Storage.StatObject(bucket, key, versionID)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
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

	c.Header("Content-Type", contentType)
	c.Header("Content-Length", fmt.Sprintf("%d", obj.Size))
	c.Header("Last-Modified", obj.ModTime.UTC().Format(http.TimeFormat))
	c.Header("x-amz-version-id", obj.VersionID)
	c.Header("ETag", fmt.Sprintf("\"%s\"", obj.VersionID))
	if obj.EncryptionType != "" {
		c.Header("x-amz-server-side-encryption", obj.EncryptionType)
	}

	c.Status(http.StatusOK)
}

func (h *S3Handler) PutObject(c *gin.Context) {
	bucket, key := h.getBucketAndKey(c)
	if key == "" {
		h.PutBucket(c)
		return
	}
	uploadID := c.Query("uploadId")
	partNumber := c.Query("partNumber")
	versionID := c.Query("versionId")

	if c.Query("tagging") != "" || strings.Contains(c.Request.URL.RawQuery, "tagging") {
		var req Tagging
		if err := xml.NewDecoder(c.Request.Body).Decode(&req); err != nil {
			c.String(http.StatusBadRequest, err.Error())
			return
		}
		tags := make(map[string]string)
		for _, t := range req.TagSet {
			tags[t.Key] = t.Value
		}
		if err := h.Storage.PutObjectTagging(bucket, key, versionID, tags); err != nil {
			c.String(http.StatusInternalServerError, err.Error())
			return
		}
		c.Status(http.StatusOK)
		return
	}

	if uploadID != "" && partNumber != "" {
		var pn int
		fmt.Sscanf(partNumber, "%d", &pn)
		etag, err := h.Storage.UploadPart(bucket, key, uploadID, pn, c.Request.Body)
		if err != nil {
			c.String(http.StatusInternalServerError, err.Error())
			return
		}
		c.Header("ETag", etag)
		c.Status(http.StatusOK)
		return
	}

	encryptionType := c.GetHeader("x-amz-server-side-encryption")

	vid, err := h.Storage.PutObject(bucket, key, c.Request.Body, encryptionType)
	if err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
	}
	if encryptionType != "" {
		c.Header("x-amz-server-side-encryption", encryptionType)
	}
	c.Header("x-amz-version-id", vid)
	c.Status(http.StatusOK)
}

func (h *S3Handler) PostObject(c *gin.Context) {
	bucket, key := h.getBucketAndKey(c)
	if key == "" {
		h.PostBucket(c)
		return
	}
	uploadID := c.Query("uploadId")

	// Initiate Multipart Upload
	if c.Query("uploads") != "" || strings.Contains(c.Request.URL.RawQuery, "uploads") {
		uid, err := h.Storage.InitiateMultipartUpload(bucket, key)
		if err != nil {
			c.String(http.StatusInternalServerError, err.Error())
			return
		}
		result := InitiateMultipartUploadResult{
			Bucket:   bucket,
			Key:      key,
			UploadId: uid,
		}
		c.Header("Content-Type", "application/xml")
		c.XML(http.StatusOK, result)
		return
	}

	// Complete Multipart Upload
	if uploadID != "" {
		var req CompleteMultipartUpload
		if err := xml.NewDecoder(c.Request.Body).Decode(&req); err != nil {
			c.String(http.StatusBadRequest, err.Error())
			return
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
			c.String(http.StatusInternalServerError, err.Error())
			return
		}

		result := CompleteMultipartUploadResult{
			Location: fmt.Sprintf("http://%s/%s/%s", c.Request.Host, bucket, key),
			Bucket:   bucket,
			Key:      key,
			ETag:     fmt.Sprintf("\"%s\"", vid),
		}
		c.Header("x-amz-version-id", vid)
		c.Header("Content-Type", "application/xml")
		c.XML(http.StatusOK, result)
		return
	}

	c.Status(http.StatusNotFound)
}

func (h *S3Handler) DeleteObject(c *gin.Context) {
	bucket, key := h.getBucketAndKey(c)
	if key == "" {
		h.DeleteBucket(c)
		return
	}
	versionID := c.Query("versionId")
	uploadID := c.Query("uploadId")

	if uploadID != "" {
		if err := h.Storage.AbortMultipartUpload(bucket, key, uploadID); err != nil {
			c.String(http.StatusInternalServerError, err.Error())
			return
		}
		c.Status(http.StatusNoContent)
		return
	}

	bypass := c.GetHeader("x-amz-bypass-governance-retention") == "true"
	if err := h.Storage.DeleteObject(bucket, key, versionID, bypass); err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *S3Handler) DeleteBucket(c *gin.Context) {
	bucket, _ := h.getBucketAndKey(c)

	// CORS
	if c.Query("cors") != "" || strings.Contains(c.Request.URL.RawQuery, "cors") {
		if err := h.Storage.DeleteBucketCors(bucket); err != nil {
			h.sendS3Error(c, "InternalError", err.Error(), bucket, "")
			return
		}
		c.Status(http.StatusNoContent)
		return
	}

	// Lifecycle
	if c.Query("lifecycle") != "" || strings.Contains(c.Request.URL.RawQuery, "lifecycle") {
		if err := h.Storage.DeleteBucketLifecycle(bucket); err != nil {
			h.sendS3Error(c, "InternalError", err.Error(), bucket, "")
			return
		}
		c.Status(http.StatusNoContent)
		return
	}

	if err := h.Storage.DeleteBucket(bucket); err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *S3Handler) ListObjects(c *gin.Context) {
	bucket, _ := h.getBucketAndKey(c)
	prefix := c.Query("prefix")
	delimiter := c.Query("delimiter")
	listType := c.Query("list-type")

	// Validate bucket exists
	exists, err := h.Storage.BucketExists(bucket)
	if err != nil {
		h.sendS3Error(c, "InternalError", err.Error(), bucket, "")
		return
	}
	if !exists {
		h.sendS3Error(c, "NoSuchBucket", "The specified bucket does not exist.", bucket, "")
		return
	}

	// Location Constraint
	if c.Query("location") != "" || strings.Contains(c.Request.URL.RawQuery, "location") {
		region := os.Getenv("AWS_REGION")
		if region == "" {
			region = "us-east-1"
		}
		result := LocationConstraintResult{
			Region: region,
		}
		c.Header("Content-Type", "application/xml")
		c.XML(http.StatusOK, result)
		return
	}

	// ACL
	if c.Query("acl") != "" || strings.Contains(c.Request.URL.RawQuery, "acl") {
		result := AccessControlPolicy{
			Owner: Owner{ID: "admin", DisplayName: "admin"},
			AccessControlList: AccessControlList{
				Grants: []Grant{
					{
						Grantee: Grantee{
							XMLNSXSI:    "http://www.w3.org/2001/XMLSchema-instance",
							XSIType:     "CanonicalUser",
							ID:          "admin",
							DisplayName: "admin",
						},
						Permission: "FULL_CONTROL",
					},
				},
			},
		}
		c.Header("Content-Type", "application/xml")
		c.XML(http.StatusOK, result)
		return
	}

	// CORS
	if c.Query("cors") != "" || strings.Contains(c.Request.URL.RawQuery, "cors") {
		config, err := h.Storage.GetBucketCors(bucket)
		if err != nil {
			h.sendS3Error(c, "NoSuchCORSConfiguration", "The CORS configuration does not exist", bucket, "")
			return
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

		c.Header("Content-Type", "application/xml")
		c.XML(http.StatusOK, result)
		return
	}

	// Lifecycle
	if c.Query("lifecycle") != "" || strings.Contains(c.Request.URL.RawQuery, "lifecycle") {
		config, err := h.Storage.GetBucketLifecycle(bucket)
		if err != nil {
			h.sendS3Error(c, "NoSuchLifecycleConfiguration", "The lifecycle configuration does not exist", bucket, "")
			return
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

		c.Header("Content-Type", "application/xml")
		c.XML(http.StatusOK, result)
		return
	}
	// Object Lock
	if c.Query("object-lock") != "" || strings.Contains(c.Request.URL.RawQuery, "object-lock") {
		enabled, mode, days, err := h.Storage.GetBucketObjectLock(bucket)
		if err != nil {
			h.sendS3Error(c, "InternalError", err.Error(), bucket, "")
			return
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
		c.Header("Content-Type", "application/xml")
		c.XML(http.StatusOK, result)
		return
	}

	// Check if this is a ListVersions request
	if c.Query("versions") != "" || strings.Contains(c.Request.URL.RawQuery, "versions") {
		h.ListVersions(c)
		return
	}

	objects, commonPrefixes, err := h.Storage.ListObjects(bucket, prefix, delimiter, "")
	if err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
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
				LastModified: o.ModTime.UTC().Format(time.RFC3339),
				ETag:         fmt.Sprintf("\"%s\"", o.VersionID),
				StorageClass: "STANDARD",
			})
		}
		c.Header("Content-Type", "application/xml")
		c.XML(http.StatusOK, result)
		return
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
			LastModified: o.ModTime.UTC().Format(time.RFC3339),
			ETag:         fmt.Sprintf("\"%s\"", o.VersionID),
			StorageClass: "STANDARD",
		})
	}

	c.Header("Content-Type", "application/xml")
	c.XML(http.StatusOK, result)
}

func (h *S3Handler) ListVersions(c *gin.Context) {
	bucket := c.Param("bucket")
	prefix := c.Query("prefix")
	delimiter := c.Query("delimiter")

	objects, _, err := h.Storage.ListObjects(bucket, prefix, "", "") // Get all objects first
	if err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
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
				LastModified: v.ModTime.UTC().Format(time.RFC3339),
			})
		}
	}

	c.Header("Content-Type", "application/xml")
	c.XML(http.StatusOK, result)
}

// ServeWebsite serves static website content from a bucket
func (h *S3Handler) ServeWebsite(c *gin.Context) {
	bucket := c.Param("bucket")
	path := c.Param("key")

	// Get website configuration
	config, err := h.Storage.GetBucketWebsite(bucket)
	if err != nil || config == nil {
		c.String(http.StatusNotFound, "Website configuration not found for this bucket")
		return
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
			errorReader, errorObj, errorErr := h.Storage.GetObject(bucket, config.ErrorDocument.Key, "")
			if errorErr == nil {
				contentType := mime.TypeByExtension(filepath.Ext(config.ErrorDocument.Key))
				if contentType == "" {
					contentType = "text/html"
				}
				c.DataFromReader(http.StatusNotFound, errorObj.Size, contentType, errorReader, nil)
				return
			}
		}
		c.String(http.StatusNotFound, "Not Found")
		return
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
	c.Header("x-amz-version-id", obj.VersionID)
	c.Header("ETag", fmt.Sprintf("\"%s\"", obj.VersionID))
	c.Header("Last-Modified", obj.ModTime.UTC().Format(http.TimeFormat))
	c.Header("Content-Length", fmt.Sprintf("%d", obj.Size))

	c.DataFromReader(http.StatusOK, obj.Size, contentType, reader, nil)
}
