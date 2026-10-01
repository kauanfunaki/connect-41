"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FileDropzoneField } from "@/components/ui/FileDropzoneField";
import type { LeituraState } from "@/app/(app)/societario/ia/actions";

/**
 * "Ler contrato social": a coordenação do Societário manda o PDF, a IA lê os
 * sócios e a tela de revisão abre em seguida. Nada é gravado sem aprovação.
 */
export function LerContratoSocial({
  companyId,
  acao,
  desligada,
}: {
  companyId: string;
  acao: (prev: LeituraState, form: FormData) => Promise<LeituraState>;
  desligada: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction, pendente] = useActionState(acao, null);

  if (!aberto) {
    return (
      <Button variant="secondary" onClick={() => setAberto(true)} disabled={desligada} title={desligada ? "Ligue a Leitura de contrato social em Administração › Inteligência Artificial" : undefined}>
        Ler contrato social (IA)
      </Button>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 w-full">
      <input type="hidden" name="companyId" value={companyId} />
      <div className="flex flex-col gap-0.5">
        <p className="text-[14px] font-semibold text-fg">Ler contrato social com a IA</p>
        <p className="text-[12px] text-fg-muted">
          Contrato social, alteração ou consolidação, em PDF. A IA lê participação, quotas, capital e quem administra; você revisa antes
          de gravar. O arquivo não fica guardado.
        </p>
      </div>
      {/* Só a extensão no `accept`: o campo escreve o que recebe aqui na faixa
          ("PDF, APPLICATION/PDF · até 10 MB"), e confere pela extensão. */}
      <FileDropzoneField name="arquivo" accept=".pdf" maxSizeMb={10} required />
      {state?.error && <p className="text-[13px] text-danger">{state.error}</p>}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
        <Button variant="secondary" type="button" onClick={() => setAberto(false)} disabled={pendente}>
          Cancelar
        </Button>
        <Button variant="primary" type="submit" disabled={pendente}>
          {pendente ? "Lendo o contrato…" : "Ler contrato"}
        </Button>
      </div>
    </form>
  );
}
