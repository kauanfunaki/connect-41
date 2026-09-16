"use client";

import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { aprovarVersao, reabrirVersao } from "@/app/(app)/dre/orcamento/actions";

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
