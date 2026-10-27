import { formatInstantDateTime } from "@/lib/format";
import type { SyncProgress } from "@/lib/github/types";

const STATES: Record<SyncProgress["state"], string> = {
  disconnected: "Reconexão necessária", paused: "Sincronização pausada", processing: "Consultando GitHub",
  waiting: "Aguardando nova tentativa", queued: "Aguardando o próximo lote automático", error: "Há tarefas que precisam de nova tentativa", idle: "Fila concluída",
};
export function SyncStatus({ progress, timezone }: { progress: SyncProgress | null; timezone: string }) {
  if (!progress) return null;
  // Sem `role="status"`: o painel é refeito a cada 30 s e o leitor de tela
  // repetia a fila inteira a cada leitura (26/10/2026).
  return <div className="space-y-1 rounded-lg border border-border bg-surface-2 p-3 text-helper text-fg-secondary">
    <p className="font-medium text-fg">{STATES[progress.state]}</p>
    <p>{progress.done} de {progress.total} tarefas concluídas · {progress.pending} pendentes · {progress.failed} com falha</p>
    {progress.pending > 0 && <p className="text-fg-muted">Novas tarefas podem surgir ao encontrar pull requests. {progress.automatic ? "A coleta continua no servidor; você pode fechar esta página." : "O executor interno está desativado nesta instância. Confira o agendador do servidor."}</p>}
    {progress.lastActivityAt && <p className="text-fg-muted">Última atividade: {formatInstantDateTime(new Date(progress.lastActivityAt), { timeZone: timezone })}</p>}
    {progress.nextAttemptAt && <p className="text-fg-muted">Nova tentativa a partir de {formatInstantDateTime(new Date(progress.nextAttemptAt), { timeZone: timezone })}</p>}
  </div>;
}
