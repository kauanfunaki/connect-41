"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { pedirVarredura } from "@/app/(app)/honorarios/actions";
import { dataHora, tempoRelativo } from "@/lib/honorarios/rotulos";
import type { StatusAuditoria } from "@/lib/honorarios/servidor/auditSyncService";

/**
 * A faixa da varredura do robô, no topo das quatro telas: o que está
 * acontecendo agora, a última varredura que deu certo e se o robô da rede
 * está respondendo. Enquanto há varredura em andamento, a tela se recarrega
 * sozinha a cada 5 s — é assim que o número de pastas anda.
 */
export function SituacaoDaVarredura({ status, podeAgir }: { status: StatusAuditoria; podeAgir: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [enviando, iniciar] = useTransition();
  const { ativo, ultimoConcluido, ultimoErro, robo } = status;

  // Recarrega enquanto há varredura; avisa quando ela termina.
  const ativoAntes = useRef(ativo?.id ?? null);
  useEffect(() => {
    const antes = ativoAntes.current;
    ativoAntes.current = ativo?.id ?? null;
    if (antes && !ativo) {
      if (ultimoConcluido?.id === antes) toast.success("Varredura concluída.");
      else if (ultimoErro?.id === antes) toast.error(`A varredura falhou: ${ultimoErro.erro ?? "erro desconhecido"}`);
    }
    if (!ativo) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [ativo, ultimoConcluido, ultimoErro, router, toast]);

  function pedir() {
    iniciar(async () => {
      const r = await pedirVarredura();
      if (!r.ok) toast.error(r.erro);
      else toast.show(r.mensagem ?? "Varredura pedida.", "info");
    });
  }

  let principal: React.ReactNode;
  let progresso: number | null = null;
  if (ativo?.status === "pendente") {
    principal = "Aguardando o robô começar a varredura…";
  } else if (ativo?.status === "executando") {
    principal = `Varrendo as pastas da rede: ${ativo.pastasRecebidas.toLocaleString("pt-BR")} de ${
      ativo.pastasTotal?.toLocaleString("pt-BR") ?? "…"
    } · ${ativo.arquivosRecebidos.toLocaleString("pt-BR")} arquivos até agora`;
    if (ativo.pastasTotal) progresso = Math.min(100, Math.round((ativo.pastasRecebidas / ativo.pastasTotal) * 100));
  } else if (ultimoConcluido) {
    principal = `Última varredura ${tempoRelativo(ultimoConcluido.concluidoEm ?? ultimoConcluido.solicitadoEm)}${
      ultimoConcluido.origem === "agendado" ? " (automática)" : ""
    } · ${ultimoConcluido.pastasRecebidas.toLocaleString("pt-BR")} pastas · ${ultimoConcluido.arquivosRecebidos.toLocaleString("pt-BR")} arquivos`;
  } else {
    principal = "Nenhuma varredura ainda. O robô da rede lê as pastas de contrato e manda o que achou.";
  }

  return (
    <section
      aria-label="Varredura das pastas"
      className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-surface px-4 py-3"
    >
      <div className="min-w-0 flex-1">
        <p className="text-ui text-fg" aria-live="polite">
          {principal}
        </p>
        {progresso !== null && (
          <div className="mt-2 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={progresso} aria-valuemin={0} aria-valuemax={100} aria-label="Pastas recebidas">
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${progresso}%` }} />
          </div>
        )}
        {!ativo && ultimoErro && (
          <p className="mt-1 text-label text-danger">
            A tentativa de {dataHora(ultimoErro.solicitadoEm)} falhou: {ultimoErro.erro ?? "erro desconhecido"}.
            {ultimoConcluido && " O relatório mostra a última varredura que deu certo."}
          </p>
        )}
        <p className="mt-1 flex items-center gap-1.5 text-label text-fg-muted">
          <Bot size={14} aria-hidden />
          {robo ? (
            robo.online ? (
              <span>Robô {robo.host} respondendo</span>
            ) : (
              <span className={ativo ? "text-warning-fg" : undefined}>
                Robô sem resposta desde {dataHora(robo.vistoEm)}
                {ativo && " — a varredura começa quando ele voltar"}
              </span>
            )
          ) : (
            <span>O robô da rede ainda não se conectou ao Connect.</span>
          )}
        </p>
      </div>
      {podeAgir && (
        <Button
          variant="secondary"
          size="sm"
          onClick={pedir}
          disabled={!!ativo || enviando}
          title="Pede ao robô uma nova varredura das pastas dos clientes"
        >
          <RefreshCw size={14} className={ativo || enviando ? "animate-spin motion-reduce:animate-none" : undefined} aria-hidden />
          {ativo ? "Varrendo…" : "Varrer as pastas"}
        </Button>
      )}
    </section>
  );
}
