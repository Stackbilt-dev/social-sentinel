export interface Env {
  // KV namespace for tenant configurations
  TENANT_CONFIG: KVNamespace;

  // Workers AI binding
  AI: Ai;

  // Downstream ingestion endpoint URL
  INGEST_ENDPOINT_URL: string;

  // API key for manual trigger endpoint (optional - if not set, /trigger is disabled)
  TRIGGER_API_KEY?: string;
}
