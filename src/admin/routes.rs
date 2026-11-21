use super::{
    analytics_handlers, auth_handlers, bucket_handlers, object_handlers, policy_handlers,
    presign_handlers, settings_handlers, trash_handlers, user_handlers, webhook_handlers,
};
use crate::audit::SharedAuditLogger;
use crate::auth::middleware::{admin_jwt_middleware, admin_only_middleware};
use crate::config::Config;
use crate::storage::FileStorage;
use axum::{
    middleware,
    routing::{delete, get, post, put},
    Router,
};
use std::sync::Arc;

pub fn admin_router(
    storage: FileStorage,
    config: Arc<Config>,
    audit_logger: SharedAuditLogger,
) -> Router {
    let auth_routes = Router::new()
        .route("/login", post(auth_handlers::login_handler))
        .route("/api/login", post(auth_handlers::login_handler))
        .with_state(storage.clone());

    let bucket_and_object_routes = Router::new()
        .route("/auth/verify", post(auth_handlers::verify_admin_password))
        .route("/buckets", get(bucket_handlers::list_buckets))
        .route("/buckets/sync", post(bucket_handlers::sync_all_buckets))
        .route(
            "/buckets/{bucket}",
            put(bucket_handlers::create_bucket).delete(bucket_handlers::delete_bucket),
        )
        .route("/buckets/{bucket}/info", get(bucket_handlers::get_bucket_info))
        .route("/buckets/{bucket}/sync", post(bucket_handlers::sync_bucket))
        .route(
            "/buckets/{bucket}/versioning",
            put(bucket_handlers::set_bucket_versioning),
        )
        .route(
            "/buckets/{bucket}/object-lock",
            put(bucket_handlers::set_bucket_object_lock),
        )
        .route(
            "/buckets/{bucket}/quota",
            put(bucket_handlers::set_bucket_quota),
        )
        .route(
            "/buckets/{bucket}/retention/default",
            put(bucket_handlers::set_bucket_default_retention),
        )
        .route(
            "/buckets/{bucket}/soft-delete",
            put(bucket_handlers::set_bucket_soft_delete),
        )
        .route(
            "/buckets/{bucket}/cors",
            get(bucket_handlers::get_bucket_cors)
                .put(bucket_handlers::set_bucket_cors)
                .delete(bucket_handlers::delete_bucket_cors),
        )
        .route(
            "/buckets/{bucket}/website",
            get(bucket_handlers::get_bucket_website)
                .put(bucket_handlers::set_bucket_website)
                .delete(bucket_handlers::delete_bucket_website),
        )
        .route(
            "/buckets/{bucket}/replication",
            get(bucket_handlers::list_replication_rules).post(bucket_handlers::create_replication_rule),
        )
        .route(
            "/buckets/{bucket}/replication/{id}",
            delete(bucket_handlers::delete_replication_rule),
        )
        .route(
            "/buckets/{bucket}/retention",
            put(object_handlers::set_object_retention),
        )
        .route(
            "/buckets/{bucket}/legal-hold",
            put(object_handlers::set_object_legal_hold),
        )
        .route(
            "/buckets/{bucket}/tags/{*key}",
            get(object_handlers::get_object_tagging).put(object_handlers::put_object_tagging),
        )
        .route("/buckets/{bucket}/objects", get(object_handlers::list_objects))
        .route(
            "/buckets/{bucket}/objects/{*key}",
            get(object_handlers::get_object)
                .put(object_handlers::put_object)
                .delete(object_handlers::delete_object),
        )
        .route(
            "/buckets/{bucket}/download/{*key}",
            get(object_handlers::download_object),
        )
        .route("/buckets/{bucket}/objects/share", post(object_handlers::share_object))
        .route(
            "/buckets/{bucket}/objects/delete-bulk",
            post(object_handlers::bulk_delete_objects),
        )
        .route("/buckets/{bucket}/copy", post(object_handlers::copy_objects))
        .route(
            "/buckets/{bucket}/webhooks",
            get(webhook_handlers::list_webhooks).post(webhook_handlers::create_webhook),
        )
        .route(
            "/buckets/{bucket}/webhooks/{id}",
            delete(webhook_handlers::delete_webhook),
        )
        .route(
            "/buckets/{bucket}/webhooks/dlq",
            get(webhook_handlers::list_webhook_dlq),
        )
        .route(
            "/buckets/{bucket}/webhooks/dlq/{id}",
            delete(webhook_handlers::delete_webhook_dlq),
        )
        .route(
            "/buckets/{bucket}/webhooks/dlq/{id}/retry",
            post(webhook_handlers::retry_webhook_dlq),
        )
        .route(
            "/presigns",
            get(presign_handlers::list_presigned_urls).delete(presign_handlers::revoke_presigned_url),
        )
        .route(
            "/presigns/{id}",
            delete(presign_handlers::revoke_presigned_url_by_path),
        )
        .route("/trash", get(trash_handlers::list_trash).delete(trash_handlers::delete_trash_object))
        .route("/trash/restore", post(trash_handlers::restore_object))
        .route("/trash/restore-bulk", post(trash_handlers::bulk_restore_objects))
        .route("/trash-bulk", delete(trash_handlers::bulk_delete_trash_objects))
        .route("/trash/empty", delete(trash_handlers::empty_trash))
        .route("/search", get(analytics_handlers::global_search));

    let iam_routes = Router::new()
        .route("/stats", get(analytics_handlers::get_system_stats))
        .route("/audit-logs", get(analytics_handlers::get_audit_logs))
        .route("/analytics/storage", get(analytics_handlers::get_storage_analytics))
        .route("/analytics/requests", get(analytics_handlers::get_action_analytics))
        .route(
            "/analytics/content-types",
            get(analytics_handlers::get_content_type_breakdown),
        )
        .route(
            "/settings",
            get(settings_handlers::get_system_settings).post(settings_handlers::update_system_settings),
        )
        .route(
            "/users",
            get(user_handlers::list_users).post(user_handlers::create_user),
        )
        .route("/users/{username}", delete(user_handlers::delete_user))
        .route(
            "/users/{username}/password",
            post(user_handlers::update_password).put(user_handlers::update_password),
        )
        .route("/users/{username}/keys", post(user_handlers::generate_key))
        .route("/users/{username}/keys/{id}", delete(user_handlers::delete_key))
        .route("/users/{username}/policies", post(user_handlers::add_policy))
        .route(
            "/users/{username}/policies/attach",
            post(user_handlers::attach_policy),
        )
        .route(
            "/users/{username}/policies/{name}",
            delete(user_handlers::remove_policy),
        )
        .route("/presign", get(presign_handlers::generate_presign_url))
        .route(
            "/policies",
            get(policy_handlers::list_policies).post(policy_handlers::create_policy),
        )
        .route("/policies/{name}", delete(policy_handlers::delete_policy))
        .layer(middleware::from_fn(admin_only_middleware));

    let protected = bucket_and_object_routes
        .layer(axum::extract::DefaultBodyLimit::disable())
        .merge(iam_routes)
        .layer(middleware::from_fn_with_state(
            config.clone(),
            admin_jwt_middleware,
        ));

    let admin_prefixed = Router::new()
        .nest("/admin", protected.clone())
        .nest("/api/admin", protected)
        .with_state(storage);

    let audit_stream_state = analytics_handlers::AuditStreamState {
        logger: audit_logger,
        config: config.clone(),
    };

    let ws_routes = Router::new()
        .route("/admin/audit/stream", get(analytics_handlers::stream_audit_logs))
        .route("/api/admin/audit/stream", get(analytics_handlers::stream_audit_logs))
        .with_state(audit_stream_state);

    Router::new()
        .merge(auth_routes)
        .merge(admin_prefixed)
        .merge(ws_routes)
}
