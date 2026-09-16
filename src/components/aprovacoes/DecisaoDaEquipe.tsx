"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/useConfirm";
import { aprovarPelaEquipe, reprovarPelaEquipe, enviarParaAprovacao } from "@/app/(app)/aprovacoes/actions";
import { ReprovarComMotivo } from "./ReprovarComMotivo";

/**
 * O que a equipe pode fazer com uma conta da fila.
 *
 * Os vereditos já chegam calculados do servidor (`podeDecidir` e
 * `podeEnviarParaAprovacao`): botão que sempre recusa é ruído, e o motivo da
 * recusa — "quem lançou não aprova" — aparece no lugar do botão.
 */
export function DecisaoDaEquipe({
  entryId,
  descricao,
  decidir,
  reenviar,
}: {
  entryId: string;
  descricao: string;
  /** `true` pode decidir; texto é o motivo de não poder; `null` não se aplica. */
  decidir: true | string | null;
  reenviar: boolean;
}) {
  const { dialog, requestConfirm } = useConfirm();
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {decidir === true && (
          <>
            <Button
              variant="success"
              size="xs"
              onClick={() =>
                requestConfirm({ title: "Aprovar esta conta?", description: `${descricao}. A baixa fica liberada.`, confirmLabel: "Aprovar" }, async () => {
                  const r = await aprovarPelaEquipe(entryId);
                  if ("error" in r) throw new Error(r.error);
                })
              }
            >
              <CheckCircle2 size={12} /> Aprovar
            </Button>
            <ReprovarComMotivo entryId={entryId} descricao={descricao} acao={reprovarPelaEquipe} />
          </>
        )}
        {reenviar && (
          <Button
            variant="secondary"
            size="xs"
            disabled={pendente}
            onClick={() => {
              setErro(null);
              setAviso(null);
              startTransition(async () => {
                const r = await enviarParaAprovacao(entryId);
                if ("error" in r) setErro(r.error);
                else if (r.aviso) setAviso(r.aviso);
              });
            }}
          >
            <Send size={12} /> Reenviar para aprovação
          </Button>
        )}
      </div>
      {typeof decidir === "string" && <span className="text-[11px] text-fg-muted max-w-[260px]">{decidir}</span>}
      {erro && <span className="text-[11px] text-danger max-w-[260px]">{erro}</span>}
      {aviso && <span className="text-[11px] text-warning max-w-[260px]">{aviso}</span>}
      {dialog}
    </div>
  );
}
