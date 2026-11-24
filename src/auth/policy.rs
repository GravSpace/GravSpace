use serde::{Deserialize, Serialize};

fn deserialize_string_or_vec<'de, D>(deserializer: D) -> Result<Vec<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    struct StringOrVec;

    impl<'de> serde::de::Visitor<'de> for StringOrVec {
        type Value = Vec<String>;

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("string or array of strings")
        }

        fn visit_str<E>(self, value: &str) -> Result<Vec<String>, E>
        where
            E: serde::de::Error,
        {
            Ok(vec![value.to_string()])
        }

        fn visit_seq<S>(self, mut visitor: S) -> Result<Vec<String>, S::Error>
        where
            S: serde::de::SeqAccess<'de>,
        {
            let mut vec = Vec::new();
            while let Some(elem) = visitor.next_element()? {
                vec.push(elem);
            }
            Ok(vec)
        }
    }

    deserializer.deserialize_any(StringOrVec)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Statement {
    #[serde(alias = "Effect")]
    pub effect: String,
    #[serde(alias = "Action", deserialize_with = "deserialize_string_or_vec")]
    pub action: Vec<String>,
    #[serde(alias = "Resource", deserialize_with = "deserialize_string_or_vec")]
    pub resource: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Policy {
    #[serde(default)]
    pub name: String,
    #[serde(alias = "Version", default)]
    pub version: Option<String>,
    #[serde(alias = "Statement", default)]
    pub statement: Vec<Statement>,
}

pub fn match_wildcard(pattern: &str, value: &str) -> bool {
    if pattern == "*" || pattern == value {
        return true;
    }
    if let Some(prefix) = pattern.strip_suffix('*') {
        value.starts_with(prefix)
    } else if let Some(suffix) = pattern.strip_prefix('*') {
        value.ends_with(suffix)
    } else {
        false
    }
}

pub fn evaluate_policies(policies: &[Policy], action: &str, resource: &str) -> bool {
    let mut allowed = false;

    for policy in policies {
        for stmt in &policy.statement {
            let action_match = stmt
                .action
                .iter()
                .any(|a| match_wildcard(a, action));
            let resource_match = stmt
                .resource
                .iter()
                .any(|r| match_wildcard(r, resource));

            if action_match && resource_match {
                if stmt.effect.eq_ignore_ascii_case("Deny") {
                    return false; // Explicit Deny always wins
                }
                if stmt.effect.eq_ignore_ascii_case("Allow") {
                    allowed = true;
                }
            }
        }
    }

    allowed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_policy_allow_and_deny() {
        let policy = Policy {
            name: "TestPolicy".to_string(),
            version: Some("2012-10-17".to_string()),
            statement: vec![
                Statement {
                    effect: "Allow".to_string(),
                    action: vec!["s3:GetObject".to_string(), "s3:ListBucket".to_string()],
                    resource: vec!["arn:aws:s3:::mybucket/*".to_string()],
                },
                Statement {
                    effect: "Deny".to_string(),
                    action: vec!["s3:GetObject".to_string()],
                    resource: vec!["arn:aws:s3:::mybucket/secret/*".to_string()],
                },
            ],
        };

        assert!(evaluate_policies(
            &[policy.clone()],
            "s3:GetObject",
            "arn:aws:s3:::mybucket/public/file.txt"
        ));
        assert!(!evaluate_policies(
            &[policy],
            "s3:GetObject",
            "arn:aws:s3:::mybucket/secret/password.txt"
        ));
    }

    #[test]
    fn test_aws_iam_json_deserialization() {
        let iam_json = r#"{
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Action": "s3:GetObject",
                    "Resource": "arn:aws:s3:::mybucket/*"
                }
            ]
        }"#;

        let parsed: Result<Policy, _> = serde_json::from_str(iam_json);
        assert!(parsed.is_ok());
        let policy = parsed.unwrap();
        assert_eq!(policy.statement.len(), 1);
        assert_eq!(policy.statement[0].effect, "Allow");
        assert_eq!(policy.statement[0].action, vec!["s3:GetObject"]);
        assert_eq!(policy.statement[0].resource, vec!["arn:aws:s3:::mybucket/*"]);
        assert!(evaluate_policies(
            &[policy],
            "s3:GetObject",
            "arn:aws:s3:::mybucket/any.png"
        ));
    }
}
