// Servidor persistente (standalone/EasyPanel). A fila e a lease ficam no banco;
// este relógio só acorda o mesmo motor usado pela rota de cron.
const state = globalThis as unknown as { __githubScheduler?: { timer: ReturnType<typeof setTimeout> | null; stopped: boolean } };
export function githubSchedulerEnabled() {
  return process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build" && process.env.GITHUB_SYNC_ENABLED !== "false";
}
export function startGithubScheduler() {
  if (!githubSchedulerEnabled() || state.__githubScheduler) return;
  const scheduler = { timer: null as ReturnType<typeof setTimeout> | null, stopped: false };
  state.__githubScheduler = scheduler;
  const run = async () => {
    if (scheduler.stopped) return;
    let delay = 10000;
    try {
      const { processGithubCron } = await import("./sync");
      await processGithubCron();
    } catch (error) {
      // Nunca registrar tokens, URLs do banco ou o corpo das respostas.
      console.error("[github] Falha no processamento automático", error instanceof Error ? error.name : "erro");
      delay = 60000;
    } finally {
      if (!scheduler.stopped) { scheduler.timer = setTimeout(run, delay); scheduler.timer.unref(); }
    }
  };
  scheduler.timer = setTimeout(run, 1000);
  scheduler.timer.unref();
}

export function stopGithubScheduler() {
  const scheduler = state.__githubScheduler;
  if (!scheduler) return;
  scheduler.stopped = true;
  if (scheduler.timer) clearTimeout(scheduler.timer);
  delete state.__githubScheduler;
}
