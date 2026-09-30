// Roda uma vez quando o servidor Next sobe (self-hosted via `next start`, ver
// output: "standalone" em next.config.ts). Usado para iniciar o motor de
// alertas internamente (src/lib/alerts.ts) em vez de depender de um
// scheduler externo (n8n) chamando POST /api/cron/alerts.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Só o servidor de produção roda as rotinas. O `.env` local aponta para o
  // banco de produção, então um `next dev` na máquina de alguém dispararia
  // alertas e obrigações em cima dos dados reais, em paralelo com o servidor
  // de verdade (visto em 30/09, antes de abrir as telas para o redesign).
  if (process.env.NODE_ENV !== "production") return;

  const { startAlertScheduler } = await import("@/lib/alerts");
  startAlertScheduler();
}
