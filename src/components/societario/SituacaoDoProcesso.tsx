"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CirclePause, CircleX, Hourglass, Play, Ban } from "lucide-react";
import { Button } from "@/components/ui/Button";
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
  aguardar_cliente: <Hourglass size={13} />,
  suspender: <CirclePause size={13} />,
  retomar: <Play size={13} />,
  indeferir: <Ban size={13} />,
  cancelar: <CircleX size={13} />,
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
      <div className="flex flex-wrap items-center gap-1.5">
        {acoes.map((a) => (
          <Button
            key={a}
            size="xs"
            variant={a === "retomar" ? "primary" : "secondary"}
            disabled={pendente}
            onClick={() => (a === "retomar" ? executar("retomar", "") : (setErro(null), setAcao(a)))}
          >
            {ICONE[a]} {ROTULO_DA_ACAO[a]}
          </Button>
        ))}
      </div>
      {erro && !acao && <span className="text-[11px] text-danger">{erro}</span>}

      <Modal open={acao !== null} onClose={() => !pendente && setAcao(null)} title={acao ? AJUDA[acao].titulo : undefined}>
        {acao && (
          <form
            className="p-5 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              executar(acao, motivo);
            }}
          >
            <h2 className="text-[15px] font-semibold text-fg">{AJUDA[acao].titulo}</h2>
            <p className="text-[13px] text-fg-secondary">{AJUDA[acao].texto}</p>
            <label htmlFor="motivo-da-situacao" className="text-[12px] font-medium text-fg">
              Motivo
            </label>
            <Textarea
              id="motivo-da-situacao"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder={AJUDA[acao].exemplo}
              autoFocus
            />
            {erro && <span className="text-[12px] text-danger">{erro}</span>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={pendente} onClick={() => setAcao(null)}>
                Voltar
              </Button>
              <Button type="submit" disabled={pendente || motivo.trim().length < 3}>
                {pendente ? "Salvando…" : "Confirmar"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
