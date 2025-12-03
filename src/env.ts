export interface Env {
  // KV namespace for tenant configurations
  TENANT_CONFIG: KVNamespace;

  // Workers AI binding
  AI: Ai;

  // AiDoctor backend URL
  AIDOCTOR_URL: string;
}
