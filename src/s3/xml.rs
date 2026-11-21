use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename = "ListAllMyBucketsResult")]
pub struct ListAllMyBucketsResult {
    #[serde(rename = "Owner")]
    pub owner: Owner,
    #[serde(rename = "Buckets")]
    pub buckets: BucketsContainer,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Owner {
    #[serde(rename = "ID")]
    pub id: String,
    #[serde(rename = "DisplayName")]
    pub display_name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BucketsContainer {
    #[serde(rename = "Bucket", default)]
    pub bucket: Vec<BucketItem>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BucketItem {
    #[serde(rename = "Name")]
    pub name: String,
    #[serde(rename = "CreationDate")]
    pub creation_date: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename = "ListBucketResult")]
pub struct ListBucketResult {
    #[serde(rename = "Name")]
    pub name: String,
    #[serde(rename = "Prefix")]
    pub prefix: String,
    #[serde(rename = "Marker")]
    pub marker: String,
    #[serde(rename = "MaxKeys")]
    pub max_keys: i64,
    #[serde(rename = "IsTruncated")]
    pub is_truncated: bool,
    #[serde(rename = "Contents", default)]
    pub contents: Vec<ObjectItem>,
    #[serde(rename = "CommonPrefixes", default)]
    pub common_prefixes: Vec<CommonPrefixItem>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ObjectItem {
    #[serde(rename = "Key")]
    pub key: String,
    #[serde(rename = "LastModified")]
    pub last_modified: String,
    #[serde(rename = "ETag")]
    pub etag: String,
    #[serde(rename = "Size")]
    pub size: i64,
    #[serde(rename = "StorageClass")]
    pub storage_class: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CommonPrefixItem {
    #[serde(rename = "Prefix")]
    pub prefix: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename = "InitiateMultipartUploadResult")]
pub struct InitiateMultipartUploadResult {
    #[serde(rename = "Bucket")]
    pub bucket: String,
    #[serde(rename = "Key")]
    pub key: String,
    #[serde(rename = "UploadId")]
    pub upload_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename = "CompleteMultipartUploadResult")]
pub struct CompleteMultipartUploadResult {
    #[serde(rename = "Location")]
    pub location: String,
    #[serde(rename = "Bucket")]
    pub bucket: String,
    #[serde(rename = "Key")]
    pub key: String,
    #[serde(rename = "ETag")]
    pub etag: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename = "CompleteMultipartUpload")]
pub struct CompleteMultipartUploadPayload {
    #[serde(rename = "Part", default)]
    pub parts: Vec<CompletePartPayload>,
}

#[derive(Debug, Deserialize)]
pub struct CompletePartPayload {
    #[serde(rename = "PartNumber")]
    pub part_number: i64,
    #[serde(rename = "ETag")]
    pub etag: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename = "Error")]
pub struct S3ErrorXml {
    #[serde(rename = "Code")]
    pub code: String,
    #[serde(rename = "Message")]
    pub message: String,
    #[serde(rename = "Resource")]
    pub resource: String,
    #[serde(rename = "RequestId")]
    pub request_id: String,
    #[serde(rename = "HostId")]
    pub host_id: String,
}

pub fn s3_xml_response<T: Serialize>(status: StatusCode, data: &T) -> Response {
    let xml = quick_xml::se::to_string(data).unwrap_or_default();
    let body = format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n{xml}");
    (
        status,
        [("Content-Type", "application/xml")],
        body,
    )
        .into_response()
}

pub fn s3_error(status: StatusCode, code: &str, message: &str, resource: &str) -> Response {
    let err = S3ErrorXml {
        code: code.to_string(),
        message: message.to_string(),
        resource: resource.to_string(),
        request_id: uuid::Uuid::new_v4().to_string().replace('-', "")[..16].to_uppercase(),
        host_id: uuid::Uuid::new_v4().to_string().replace('-', ""),
    };
    s3_xml_response(status, &err)
}
