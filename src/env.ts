export interface Env {
  // KV namespace for tenant configurations
  TENANT_CONFIG: KVNamespace;

  // Workers AI binding
  AI: Ai;

  // D1 database for content queue + publish history
  DB: D1Database;

  // Downstream ingestion endpoint URL (monitoring pipeline)
  INGEST_ENDPOINT_URL: string;

  // API key for manual trigger + publish endpoints (required)
  TRIGGER_API_KEY?: string;
}
