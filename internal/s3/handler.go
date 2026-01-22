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

type Content struct {
	Key  string `xml:"Key"`
	Size int64  `xml:"Size"`
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
	vid, err := h.Storage.PutObject(bucket, key, c.Request().Body)
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	c.Response().Header().Set("x-amz-version-id", vid)
	return c.NoContent(http.StatusOK)
}

func (h *S3Handler) ListObjects(c echo.Context) error {
	bucket := c.Param("bucket")
	prefix := c.QueryParam("prefix")
	delimiter := c.QueryParam("delimiter")

	// Check if this is a ListVersions request
	if c.QueryParam("versions") != "" || c.Request().URL.Query().Has("versions") {
		return h.ListVersions(c)
	}

	objects, commonPrefixes, err := h.Storage.ListObjects(bucket, prefix, delimiter)
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}

	result := ListBucketResult{
		Name:           bucket,
		Prefix:         prefix,
		Delimiter:      delimiter,
		CommonPrefixes: commonPrefixes,
	}
	for _, o := range objects {
		result.Contents = append(result.Contents, Content{Key: o.Key, Size: o.Size})
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
