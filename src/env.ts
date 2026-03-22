export interface Env {
  // KV namespace for tenant configurations
  TENANT_CONFIG: KVNamespace;

  // Workers AI binding
  AI: Ai;

  // AiDoctor backend URL
  AIDOCTOR_URL: string;

  // API key for manual trigger endpoint (optional - if not set, /trigger is disabled)
  TRIGGER_API_KEY?: string;
}
