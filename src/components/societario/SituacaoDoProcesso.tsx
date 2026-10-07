"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CirclePause, CircleX, Hourglass, Play, Ban } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { ROTULO_DA_ACAO, type AcaoDeSituacao, type StatusDoProcesso } from "@/lib/societario/processo";
import type { ProcessoState } from "@/app/(app)/processos/actions";

const AJUDA: Record<Exclude<AcaoDeSituacao, "retomar">, { titulo: string; texto: string; exemplo: string }> = {
  aguardar_cliente: {
    titulo: "Aguardando o cliente",
    texto: "O processo sai da frente da fila até alguém retomar. O cliente vê o motivo no portal.",
    exemplo: "Ex.: contrato social assinado pelos três sócios",
  },
  suspender: {
    titulo: "Suspender o processo",
    texto: "Parado sem previsão de volta. O cliente vê o motivo no portal.",
    exemplo: "Ex.: cliente pediu para esperar a venda do imóvel",
  },
  indeferir: {
    titulo: "Indeferido pelo órgão",
    texto: "Encerra o processo: o órgão negou em definitivo. Dá para retomar se foi engano.",
    exemplo: "Ex.: viabilidade negada — atividade não permitida no zoneamento",
  },
  cancelar: {
    titulo: "Cancelar o processo",
    texto: "Encerra o processo sem conclusão. Dá para retomar se foi engano.",
    exemplo: "Ex.: cliente desistiu da abertura",
  },
};

const ICONE: Record<AcaoDeSituacao, React.ReactNode> = {
  aguardar_cliente: <Hourglass size={14} />,
  suspender: <CirclePause size={14} />,
  retomar: <Play size={14} />,
  indeferir: <Ban size={14} />,
  cancelar: <CircleX size={14} />,
};

/** As ações que fazem sentido a partir do status atual — as mesmas que `transicaoDeSituacao` aceita. */
function acoesPara(status: StatusDoProcesso): AcaoDeSituacao[] {
  if (status === "CONCLUIDO") return [];
  if (status === "CANCELADO" || status === "INDEFERIDO") return ["retomar"];
  const pausado = status === "AGUARDANDO_CLIENTE" || status === "SUSPENSO";
  return [
    ...(pausado ? (["retomar"] as const) : []),
    ...(status !== "AGUARDANDO_CLIENTE" ? (["aguardar_cliente"] as const) : []),
    ...(status !== "SUSPENSO" ? (["suspender"] as const) : []),
    "indeferir",
    "cancelar",
  ];
}

/**
 * Pausar, encerrar sem conclusão ou retomar o processo. Toda ação menos
 * "retomar" pede motivo, que o cliente também lê no portal — por isso o
 * exemplo em cada janela é escrito para ele entender.
 */
export function SituacaoDoProcesso({
  processoId,
  status,
  mudar,
}: {
  processoId: string;
  status: StatusDoProcesso;
  mudar: (processId: string, acao: AcaoDeSituacao, motivo: string) => Promise<ProcessoState>;
}) {
  const router = useRouter();
  const [acao, setAcao] = useState<Exclude<AcaoDeSituacao, "retomar"> | null>(null);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const acoes = acoesPara(status);
  if (acoes.length === 0) return null;

  function executar(a: AcaoDeSituacao, texto: string) {
    setErro(null);
    startTransition(async () => {
      const r = await mudar(processoId, a, texto);
      if (r?.error) setErro(r.error);
      else {
        setAcao(null);
        setMotivo("");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      {/* `sm` (h-8): é a barra de ações do cabeçalho do processo, no tamanho
          das barras de ferramenta do resto do app. */}
      <div className="flex flex-wrap items-center gap-2">
        {acoes.map((a) => (
          <Button
            key={a}
            size="sm"
            variant={a === "retomar" ? "primary" : "secondary"}
            disabled={pendente}
            loading={a === "retomar" && pendente}
            loadingLabel="Retomando…"
            onClick={() => (a === "retomar" ? executar("retomar", "") : (setErro(null), setAcao(a)))}
          >
            {ICONE[a]} {ROTULO_DA_ACAO[a]}
          </Button>
        ))}
      </div>
      {/* Na caixa de erro do resto da página (07/10/2026) — era texto solto de 12px. */}
      {erro && !acao && (
        <p role="alert" className="text-[length:var(--fs-ui)] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {erro}
        </p>
      )}

      <Modal open={acao !== null} onClose={() => !pendente && setAcao(null)} title={acao ? AJUDA[acao].titulo : undefined}>
        {acao && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              executar(acao, motivo);
            }}
          >
            <p className="text-[length:var(--fs-ui)] text-fg-secondary">{AJUDA[acao].texto}</p>
            <CampoForm label="Motivo" htmlFor="motivo-da-situacao" required>
              <Textarea
                id="motivo-da-situacao"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={300}
                rows={3}
                placeholder={AJUDA[acao].exemplo}
                autoFocus
              />
            </CampoForm>
            {erro && (
              <p role="alert" className="text-[length:var(--fs-ui)] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">{erro}</p>
            )}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <Button type="button" variant="secondary" disabled={pendente} onClick={() => setAcao(null)}>
                Voltar
              </Button>
              <Button type="submit" disabled={motivo.trim().length < 3} loading={pendente}>
                Confirmar
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
