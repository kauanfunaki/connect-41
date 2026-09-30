"use client";

import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { aprovarVersao, reabrirVersao } from "@/app/(app)/dre/orcamento/actions";

// O gatilho do `ConfirmActionButton` vem com borda clara e texto cinza; aqui
// ele divide a linha com o "Ver orçado × realizado" (`Button` secundário sm) e
// ganha o mesmo desenho, para os dois lerem como o mesmo tipo de ação.
const COMO_BOTAO_SECUNDARIO =
  "inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md border border-border-strong text-[length:var(--fs-button-sm)] font-semibold text-fg hover:bg-surface-hover transition-colors";

/** Aprovar e reabrir — só aparece para a coordenação; a action confere de novo. */
export function AcoesDaVersao({
  budgetId,
  nome,
  ano,
  status,
  outraAprovada,
}: {
  budgetId: string;
  nome: string;
  ano: number;
  status: "RASCUNHO" | "APROVADO";
  /** Nome da aprovada atual do ano, quando é outra — ela volta a rascunho. */
  outraAprovada: string | null;
}) {
  if (status === "RASCUNHO") {
    return (
      <ConfirmActionButton
        label="Aprovar versão"
        className={COMO_BOTAO_SECUNDARIO}
        title={`Aprovar "${nome}" como orçamento de ${ano}?`}
        description={
          outraAprovada
            ? `"${outraAprovada}" deixa de ser a aprovada e volta a rascunho. A DRE econômica e as análises passam a comparar o realizado com "${nome}", e esta versão fica somente leitura.`
            : `A DRE econômica e as análises passam a comparar o realizado de ${ano} com esta versão, que fica somente leitura.`
        }
        confirmLabel="Aprovar"
        successMessage="Versão aprovada."
        action={async () => {
          const r = await aprovarVersao(budgetId);
          return "error" in r ? r : null;
        }}
      />
    );
  }
  return (
    <ConfirmActionButton
      label="Reabrir"
      className={COMO_BOTAO_SECUNDARIO}
      title={`Reabrir "${nome}"?`}
      description={`A versão volta a rascunho e ${ano} fica sem orçamento aprovado até alguém aprovar de novo — o orçado × realizado some das telas de DRE nesse meio-tempo.`}
      confirmLabel="Reabrir"
      successMessage="Versão reaberta."
      action={async () => {
        const r = await reabrirVersao(budgetId);
        return "error" in r ? r : null;
      }}
    />
  );
}
