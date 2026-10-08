"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Forward, Hand, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { CampoForm } from "@/components/ui/CampoForm";
import { useConfirm } from "@/components/ui/useConfirm";
import {
  assumirSolicitacao,
  cancelarSolicitacao,
  concluirSolicitacao,
  encaminharSolicitacao,
  reabrirSolicitacao,
  type Resultado,
} from "@/app/(app)/solicitacoes/actions";
import { emAberto, type StatusDaSolicitacao } from "@/lib/solicitacoes/regras";

/** Os botões que o status permite: assumir, encaminhar, concluir, cancelar — ou reabrir. */
export function AcoesDaSolicitacao({
  id,
  status,
  souResponsavel,
  setorAtual,
  setores,
}: {
  id: string;
  status: StatusDaSolicitacao;
  souResponsavel: boolean;
  setorAtual: string;
  setores: { code: string; label: string }[];
}) {
  const { dialog, requestConfirm } = useConfirm();
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [encaminhando, setEncaminhando] = useState(false);
  const [pendente, startTransition] = useTransition();

  function executar(acao: (id: string) => Promise<Resultado>) {
    return async () => {
      const r = await acao(id);
      // O useConfirm mostra o erro lançado dentro do próprio diálogo.
      if ("error" in r) {
        setErro(r.error);
        throw new Error(r.error);
      }
      setErro(null);
      setAviso(r.aviso ?? null);
    };
  }

  const outros = setores.filter((s) => s.code !== setorAtual);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {emAberto(status) ? (
          <>
            {!souResponsavel && (
              <Button
                size="sm"
                variant="secondary"
                disabled={pendente}
                onClick={() =>
                  startTransition(async () => {
                    const r = await assumirSolicitacao(id);
                    setErro("error" in r ? r.error : null);
                  })
                }
              >
                <Hand size={13} /> Assumir
              </Button>
            )}
            {outros.length > 0 && (
              <Button size="sm" variant="secondary" onClick={() => setEncaminhando(true)}>
                <Forward size={13} /> Encaminhar
              </Button>
            )}
            <Button
              size="sm"
              variant="success"
              onClick={() =>
                requestConfirm(
                  {
                    title: "Concluir a solicitação?",
                    description: "O cliente é avisado por e-mail. Se ainda faltar algo, ele responde e a solicitação volta para a fila.",
                    confirmLabel: "Concluir",
                  },
                  executar(concluirSolicitacao)
                )
              }
            >
              <CheckCircle2 size={13} /> Concluir
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() =>
                requestConfirm(
                  {
                    title: "Cancelar a solicitação?",
                    description: "Use para pedido repetido ou aberto por engano. O cliente vê como cancelada — explique o motivo numa resposta antes.",
                    confirmLabel: "Cancelar solicitação",
                    destructive: true,
                  },
                  executar(cancelarSolicitacao)
                )
              }
            >
              <XCircle size={13} /> Cancelar
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              requestConfirm(
                { title: "Reabrir a solicitação?", description: "Volta para a fila, em andamento.", confirmLabel: "Reabrir" },
                executar(reabrirSolicitacao)
              )
            }
          >
            <RotateCcw size={13} /> Reabrir
          </Button>
        )}
      </div>
      {erro && <span className="text-[12px] text-danger">{erro}</span>}
      {aviso && <span className="text-[12px] text-warning-fg">{aviso}</span>}
      {dialog}

      <Modal open={encaminhando} onClose={() => !pendente && setEncaminhando(false)} title="Encaminhar para outro setor">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const dados = new FormData(e.currentTarget);
            startTransition(async () => {
              const r = await encaminharSolicitacao(id, String(dados.get("setor") ?? ""), String(dados.get("motivo") ?? ""));
              if ("error" in r) {
                setErro(r.error);
                return;
              }
              setErro(null);
              setEncaminhando(false);
            });
          }}
        >
          <CampoForm label="Setor" htmlFor={`encaminhar-${id}`} required>
            <Select id={`encaminhar-${id}`} name="setor" required defaultValue="">
              <option value="" disabled>
                Escolha o setor
              </option>
              {outros.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </Select>
          </CampoForm>
          <CampoForm label="Motivo" htmlFor={`encaminhar-motivo-${id}`} helper="Fica numa nota interna. O cliente não vê.">
            <Textarea id={`encaminhar-motivo-${id}`} name="motivo" rows={3} maxLength={500} />
          </CampoForm>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEncaminhando(false)} disabled={pendente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente}>
              <Forward size={14} /> {pendente ? "Encaminhando…" : "Encaminhar"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
