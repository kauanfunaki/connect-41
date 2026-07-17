// Roda uma vez quando o servidor Next sobe (self-hosted via `next start`, ver
// output: "standalone" em next.config.ts). Usado para iniciar o motor de
// alertas internamente (src/lib/alerts.ts) em vez de depender de um
// scheduler externo (n8n) chamando POST /api/cron/alerts.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startAlertScheduler } = await import("@/lib/alerts");
  startAlertScheduler();
}
