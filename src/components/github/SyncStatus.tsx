import { formatInstantTime } from "@/lib/format";
import type { SyncProgress } from "@/lib/github/types";

const STATES: Record<SyncProgress["state"], string> = {
  disconnected: "Reconexão necessária", paused: "Pausada", processing: "Coletando agora",
  waiting: "Aguardando nova tentativa", queued: "Na fila do próximo lote", error: "Coleta com falhas", idle: "Em dia",
};

/**
 * A fila da coleta numa linha (04/11/2026). Com a fila vazia e sem falhas não
 * aparece: a "última coleta" do cabeçalho já diz tudo. As falhas só entram
 * quando houver.
 */
export function SyncStatus({ progress, timezone }: { progress: SyncProgress | null; timezone: string }) {
  if (!progress || progress.state !== "processing" && !progress.pending && !progress.failed) return null;
  const partes: React.ReactNode[] = [<span key="estado" className="font-medium text-fg-secondary">{STATES[progress.state]}</span>];
  if (progress.total) partes.push(`${progress.done} de ${progress.total} tarefas`);
  if (progress.failed) partes.push(<span key="falhas" className="text-warning-fg">{progress.failed === 1 ? "1 com falha" : `${progress.failed} com falha`}</span>);
  if (progress.nextAttemptAt) partes.push(`nova tentativa às ${formatInstantTime(new Date(progress.nextAttemptAt), { hour: "2-digit", minute: "2-digit", timeZone: timezone })}`);
  if (progress.pending && !progress.automatic) partes.push(<span key="executor" className="text-warning-fg">executor interno desligado nesta instância</span>);
  // Sem `role="status"`: a tela relê a cada 15 s e o leitor de tela repetiria a linha (26/10/2026).
  return <p className="text-fs-2 text-fg-muted">
    {partes.map((parte, i) => <span key={i}>{i > 0 && " · "}{parte}</span>)}
  </p>;
}
