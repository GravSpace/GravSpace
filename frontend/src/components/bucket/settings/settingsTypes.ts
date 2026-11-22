export interface WebhookConfig {
  ID: string
  URL: string
  Events: string
}

export interface DLQRecord {
  id: string
  event_name: string
  url: string
  error_message: string
  payload: string
  failed_at: string
}

export interface CorsRule {
  allowed_origins: string[]
  allowed_methods: string[]
  allowed_headers: string[]
  expose_headers: string[]
  max_age_seconds: number
  originsInput: string
  headersInput: string
  exposeHeadersInput: string
}

export interface ReplicationRule {
  id: string
  destination_bucket: string
  prefix: string
}
