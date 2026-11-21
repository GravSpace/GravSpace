use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Statement {
    pub effect: String,          // "Allow" or "Deny"
    pub action: Vec<String>,     // ["s3:*"], ["s3:GetObject"], etc.
    pub resource: Vec<String>,   // ["arn:aws:s3:::bucket/*"]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Policy {
    pub name: String,
    pub version: Option<String>,
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
}
