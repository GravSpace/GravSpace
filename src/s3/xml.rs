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

#[derive(Debug, Deserialize)]
#[serde(rename = "Delete")]
pub struct DeleteObjectsRequest {
    #[serde(rename = "Quiet", default)]
    pub quiet: bool,
    #[serde(rename = "Object", default)]
    pub objects: Vec<DeleteObjectIdentifier>,
}

#[derive(Debug, Deserialize)]
pub struct DeleteObjectIdentifier {
    #[serde(rename = "Key")]
    pub key: String,
    #[serde(rename = "VersionId", default)]
    pub version_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename = "DeleteResult")]
pub struct DeleteResultXml {
    #[serde(rename = "Deleted", default, skip_serializing_if = "Vec::is_empty")]
    pub deleted: Vec<DeletedObjectXml>,
    #[serde(rename = "Error", default, skip_serializing_if = "Vec::is_empty")]
    pub errors: Vec<DeleteErrorXml>,
}

#[derive(Debug, Serialize)]
pub struct DeletedObjectXml {
    #[serde(rename = "Key")]
    pub key: String,
    #[serde(rename = "VersionId", skip_serializing_if = "Option::is_none")]
    pub version_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DeleteErrorXml {
    #[serde(rename = "Key")]
    pub key: String,
    #[serde(rename = "Code")]
    pub code: String,
    #[serde(rename = "Message")]
    pub message: String,
}

pub fn escape_xml(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(ch),
        }
    }
    out
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

#[cfg(test)]
mod tests {
    use super::{escape_xml, DeleteObjectsRequest};

    #[test]
    fn escapes_xml_special_characters() {
        assert_eq!(escape_xml("a&b<c>\"'"), "a&amp;b&lt;c&gt;&quot;&apos;");
    }

    #[test]
    fn parses_s3_delete_objects_xml() {
        let xml = r#"<Delete><Quiet>false</Quiet><Object><Key>a.txt</Key></Object><Object><Key>b/c.png</Key><VersionId>v1</VersionId></Object></Delete>"#;
        let parsed: DeleteObjectsRequest = quick_xml::de::from_str(xml).unwrap();
        assert!(!parsed.quiet);
        assert_eq!(parsed.objects.len(), 2);
        assert_eq!(parsed.objects[0].key, "a.txt");
        assert_eq!(parsed.objects[1].version_id.as_deref(), Some("v1"));
    }
}
