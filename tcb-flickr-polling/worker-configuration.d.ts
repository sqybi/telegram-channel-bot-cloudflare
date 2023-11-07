interface Env {
  TCB_KV: KVNamespace;
  TCB_DB: D1Database;
  WORKER_RUNNING_STATUS: DurableObjectNamespace;
  DOMAIN: string;
}
