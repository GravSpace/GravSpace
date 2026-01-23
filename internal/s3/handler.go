package s3

import (
	"encoding/xml"
	"fmt"
	"mime"
	"net/http"
	"path/filepath"

	"github.com/GravSpace/GravSpace/internal/storage"
	"github.com/labstack/echo/v4"
)

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

func (h *S3Handler) PostBucket(c echo.Context) error {
	bucket := c.Param("bucket")

	// Batch Delete
	if c.Request().URL.Query().Has("delete") {
		var req DeleteRequest
		if err := xml.NewDecoder(c.Request().Body).Decode(&req); err != nil {
			return c.String(http.StatusBadRequest, err.Error())
		}

		result := DeleteResult{}
		for _, obj := range req.Objects {
			if err := h.Storage.DeleteObject(bucket, obj.Key, obj.VersionId); err != nil {
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

		c.Response().Header().Set(echo.HeaderContentType, echo.MIMEApplicationXML)
		return c.XML(http.StatusOK, result)
	}

	return c.NoContent(http.StatusNotFound)
}

func (h *S3Handler) PutBucket(c echo.Context) error {
	bucket := c.Param("bucket")

	// CORS
	if c.Request().URL.Query().Has("cors") {
		var req CORSConfiguration
		if err := xml.NewDecoder(c.Request().Body).Decode(&req); err != nil {
			return c.String(http.StatusBadRequest, err.Error())
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
		return c.NoContent(http.StatusOK)
	}

	// Lifecycle
	if c.Request().URL.Query().Has("lifecycle") {
		var req LifecycleConfiguration
		if err := xml.NewDecoder(c.Request().Body).Decode(&req); err != nil {
			return c.String(http.StatusBadRequest, err.Error())
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
		return c.NoContent(http.StatusOK)
	}

	exists, err := h.Storage.BucketExists(bucket)
	if err != nil {
		return h.sendS3Error(c, "InternalError", err.Error(), bucket, "")
	}
	if exists {
		return c.NoContent(http.StatusOK)
	}
	if err := h.Storage.CreateBucket(bucket); err != nil {
		return h.sendS3Error(c, "InternalError", err.Error(), bucket, "")
	}
	return c.NoContent(http.StatusOK)
}

func (h *S3Handler) sendS3Error(c echo.Context, code, message, bucket, key string) error {
	// Simple helper to match existing error patterns if any, or just return status
	return c.String(http.StatusInternalServerError, message)
}

func (h *S3Handler) ListBuckets(c echo.Context) error {
	buckets, err := h.Storage.ListBuckets()
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}

	result := ListAllMyBucketsResult{
		Owner: Owner{ID: "admin", DisplayName: "admin"},
	}
	for _, b := range buckets {
		result.Buckets = append(result.Buckets, Bucket{Name: b, CreationDate: "2026-01-01T00:00:00Z"})
	}

	c.Response().Header().Set(echo.HeaderContentType, echo.MIMEApplicationXML)
	return c.XML(http.StatusOK, result)
}

func (h *S3Handler) CreateBucket(c echo.Context) error {
	bucket := c.Param("bucket")
	exists, err := h.Storage.BucketExists(bucket)
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	if exists {
		// S3 returns 200 if you already own it, but for simplicity/clarity
		// we can keep it as is or return 200. Let's return 200 to be compatible
		// with "idempotent" create bucket behavior often expected.
		return c.NoContent(http.StatusOK)
	}
	if err := h.Storage.CreateBucket(bucket); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusOK)
}

func (h *S3Handler) HeadBucket(c echo.Context) error {
	bucket := c.Param("bucket")
	exists, err := h.Storage.BucketExists(bucket)
	if err != nil {
		return c.NoContent(http.StatusInternalServerError)
	}
	if !exists {
		return c.NoContent(http.StatusNotFound)
	}
	return c.NoContent(http.StatusOK)
}

func (h *S3Handler) GetObject(c echo.Context) error {
	bucket := c.Param("bucket")
	key := c.Param("*")
	versionID := c.QueryParam("versionId")

	if c.Request().URL.Query().Has("tagging") {
		tags, err := h.Storage.GetObjectTagging(bucket, key, versionID)
		if err != nil {
			return c.String(http.StatusInternalServerError, err.Error())
		}
		result := Tagging{}
		for k, v := range tags {
			result.TagSet = append(result.TagSet, Tag{Key: k, Value: v})
		}
		c.Response().Header().Set(echo.HeaderContentType, echo.MIMEApplicationXML)
		return c.XML(http.StatusOK, result)
	}

	reader, vid, err := h.Storage.GetObject(bucket, key, versionID)
	if err != nil {
		return c.NoContent(http.StatusNotFound)
	}
	defer reader.Close()

	contentType := mime.TypeByExtension(filepath.Ext(key))
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	c.Response().Header().Set("x-amz-version-id", vid)
	return c.Stream(http.StatusOK, contentType, reader)
}

func (h *S3Handler) HeadObject(c echo.Context) error {
	bucket := c.Param("bucket")
	key := c.Param("*")
	versionID := c.QueryParam("versionId")

	obj, err := h.Storage.StatObject(bucket, key, versionID)
	if err != nil {
		return c.NoContent(http.StatusNotFound)
	}

	contentType := mime.TypeByExtension(filepath.Ext(key))
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	c.Response().Header().Set(echo.HeaderContentType, contentType)
	c.Response().Header().Set(echo.HeaderContentLength, fmt.Sprintf("%d", obj.Size))
	c.Response().Header().Set(echo.HeaderLastModified, obj.ModTime.Format(http.TimeFormat))
	c.Response().Header().Set("x-amz-version-id", obj.VersionID)

	return c.NoContent(http.StatusOK)
}

func (h *S3Handler) PutObject(c echo.Context) error {
	bucket := c.Param("bucket")
	key := c.Param("*")
	uploadID := c.QueryParam("uploadId")
	partNumber := c.QueryParam("partNumber")
	versionID := c.QueryParam("versionId")

	if c.Request().URL.Query().Has("tagging") {
		var req Tagging
		if err := xml.NewDecoder(c.Request().Body).Decode(&req); err != nil {
			return c.String(http.StatusBadRequest, err.Error())
		}
		tags := make(map[string]string)
		for _, t := range req.TagSet {
			tags[t.Key] = t.Value
		}
		if err := h.Storage.PutObjectTagging(bucket, key, versionID, tags); err != nil {
			return c.String(http.StatusInternalServerError, err.Error())
		}
		return c.NoContent(http.StatusOK)
	}

	if uploadID != "" && partNumber != "" {
		var pn int
		fmt.Sscanf(partNumber, "%d", &pn)
		etag, err := h.Storage.UploadPart(bucket, key, uploadID, pn, c.Request().Body)
		if err != nil {
			return c.String(http.StatusInternalServerError, err.Error())
		}
		c.Response().Header().Set("ETag", etag)
		return c.NoContent(http.StatusOK)
	}

	vid, err := h.Storage.PutObject(bucket, key, c.Request().Body)
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	c.Response().Header().Set("x-amz-version-id", vid)
	return c.NoContent(http.StatusOK)
}

func (h *S3Handler) PostObject(c echo.Context) error {
	bucket := c.Param("bucket")
	key := c.Param("*")
	uploadID := c.QueryParam("uploadId")

	// Initiate Multipart Upload
	if c.Request().URL.Query().Has("uploads") {
		uid, err := h.Storage.InitiateMultipartUpload(bucket, key)
		if err != nil {
			return c.String(http.StatusInternalServerError, err.Error())
		}
		result := InitiateMultipartUploadResult{
			Bucket:   bucket,
			Key:      key,
			UploadId: uid,
		}
		c.Response().Header().Set(echo.HeaderContentType, echo.MIMEApplicationXML)
		return c.XML(http.StatusOK, result)
	}

	// Complete Multipart Upload
	if uploadID != "" {
		var req CompleteMultipartUpload
		if err := xml.NewDecoder(c.Request().Body).Decode(&req); err != nil {
			return c.String(http.StatusBadRequest, err.Error())
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
			return c.String(http.StatusInternalServerError, err.Error())
		}

		result := CompleteMultipartUploadResult{
			Location: fmt.Sprintf("http://%s/%s/%s", c.Request().Host, bucket, key),
			Bucket:   bucket,
			Key:      key,
			ETag:     fmt.Sprintf("\"%s\"", vid),
		}
		c.Response().Header().Set(echo.HeaderContentType, echo.MIMEApplicationXML)
		return c.XML(http.StatusOK, result)
	}

	return c.NoContent(http.StatusNotFound)
}

func (h *S3Handler) DeleteObject(c echo.Context) error {
	bucket := c.Param("bucket")
	key := c.Param("*")
	versionID := c.QueryParam("versionId")
	uploadID := c.QueryParam("uploadId")

	if uploadID != "" {
		if err := h.Storage.AbortMultipartUpload(bucket, key, uploadID); err != nil {
			return c.String(http.StatusInternalServerError, err.Error())
		}
		return c.NoContent(http.StatusNoContent)
	}

	if err := h.Storage.DeleteObject(bucket, key, versionID); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *S3Handler) DeleteBucket(c echo.Context) error {
	bucket := c.Param("bucket")

	// CORS
	if c.Request().URL.Query().Has("cors") {
		if err := h.Storage.DeleteBucketCors(bucket); err != nil {
			return h.sendS3Error(c, "InternalError", err.Error(), bucket, "")
		}
		return c.NoContent(http.StatusNoContent)
	}

	// Lifecycle
	if c.Request().URL.Query().Has("lifecycle") {
		if err := h.Storage.DeleteBucketLifecycle(bucket); err != nil {
			return h.sendS3Error(c, "InternalError", err.Error(), bucket, "")
		}
		return c.NoContent(http.StatusNoContent)
	}

	if err := h.Storage.DeleteBucket(bucket); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}

func (h *S3Handler) ListObjects(c echo.Context) error {
	bucket := c.Param("bucket")
	prefix := c.QueryParam("prefix")
	delimiter := c.QueryParam("delimiter")
	listType := c.QueryParam("list-type")

	// CORS
	if c.Request().URL.Query().Has("cors") {
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

		c.Response().Header().Set(echo.HeaderContentType, echo.MIMEApplicationXML)
		return c.XML(http.StatusOK, result)
	}

	// Lifecycle
	if c.Request().URL.Query().Has("lifecycle") {
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

		c.Response().Header().Set(echo.HeaderContentType, echo.MIMEApplicationXML)
		return c.XML(http.StatusOK, result)
	}

	// Check if this is a ListVersions request
	if c.QueryParam("versions") != "" || c.Request().URL.Query().Has("versions") {
		return h.ListVersions(c)
	}

	objects, commonPrefixes, err := h.Storage.ListObjects(bucket, prefix, delimiter)
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
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
				LastModified: o.ModTime.Format(http.TimeFormat),
				ETag:         fmt.Sprintf("\"%s\"", o.VersionID),
				StorageClass: "STANDARD",
			})
		}
		c.Response().Header().Set(echo.HeaderContentType, echo.MIMEApplicationXML)
		return c.XML(http.StatusOK, result)
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
			LastModified: o.ModTime.Format(http.TimeFormat),
			ETag:         fmt.Sprintf("\"%s\"", o.VersionID),
			StorageClass: "STANDARD",
		})
	}

	c.Response().Header().Set(echo.HeaderContentType, echo.MIMEApplicationXML)
	return c.XML(http.StatusOK, result)
}

func (h *S3Handler) ListVersions(c echo.Context) error {
	bucket := c.Param("bucket")
	prefix := c.QueryParam("prefix")
	delimiter := c.QueryParam("delimiter")

	objects, commonPrefixes, err := h.Storage.ListObjects(bucket, prefix, delimiter)
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}

	result := ListVersionsResult{
		Name:           bucket,
		Prefix:         prefix,
		Delimiter:      delimiter,
		CommonPrefixes: commonPrefixes,
	}

	for _, o := range objects {
		versions, _ := h.Storage.ListVersions(bucket, o.Key)
		for _, v := range versions {
			result.Versions = append(result.Versions, Version{
				Key:          v.Key,
				VersionId:    v.VersionID,
				IsLatest:     v.IsLatest,
				LastModified: v.ModTime.Format(http.TimeFormat),
				Size:         v.Size,
			})
		}
	}

	c.Response().Header().Set(echo.HeaderContentType, echo.MIMEApplicationXML)
	return c.XML(http.StatusOK, result)
}
