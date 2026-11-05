"use client";

// Um valor da avaliação (o `input()` do workspace do Connect Tributário):
// reais, dias ou percentual; vazio é "não informado". Sem documentos na Fase 1,
// a origem é sempre "Informado por você"; vazio oferece "Sem movimento: R$ 0".

import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { fieldLabels } from "@/lib/tributario/avaliacao/model";
import type { Resolved } from "@/lib/tributario/avaliacao/consolidation";
import { CampoValor } from "../CampoValor";

type Props = {
  chave: string;
  /** O valor em `study.values` (undefined/null = não informado). */
  informado: number | null | undefined;
  resolvido: Resolved;
  onChange: (valor: number | null) => void;
  mostrarOrigem?: boolean;
  className?: string;
};

export function CampoDaAvaliacao({ chave, informado, resolvido, onChange, mostrarOrigem = true, className }: Props) {
  const manual = informado !== undefined && informado !== null;
  const percentual = chave === "clientes_empresas";
  const dias = chave.startsWith("prazo_");
  const id = `avaliacao-${chave}`;
  const origem = !mostrarOrigem ? undefined : resolvido.value !== null ? (
    <span className="text-micro text-fg-muted">{manual ? "Informado por você" : resolvido.source}</span>
  ) : (
    <Button variant="link" size="xs" onClick={() => onChange(0)}>
      Sem movimento: R$ 0
    </Button>
  );
  return (
    <CampoForm label={fieldLabels[chave] ?? chave} htmlFor={id} error={resolvido.issue ?? undefined} acao={origem} className={className}>
      <CampoValor
        id={id}
        value={manual ? informado : resolvido.value}
        onChange={onChange}
        prefix={percentual || dias ? undefined : "R$"}
        suffix={dias ? "dias" : percentual ? "%" : undefined}
        error={Boolean(resolvido.issue)}
      />
    </CampoForm>
  );
}
