"use client";

import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { formatarReaisDeCentavos } from "@/lib/format";
import { centavosDeTexto } from "@/lib/financeiro/manual";
import { campoDaRetencao, TRIBUTO, TRIBUTOS_RETIDOS, type TributoRetido } from "@/lib/financeiro/retencoes";

export type ValoresDasRetencoes = Partial<Record<TributoRetido, string>>;

/** Quanto foi retido, somando os seis campos como estão na tela. */
export function totalRetido(valores: ValoresDasRetencoes): number {
  return TRIBUTOS_RETIDOS.reduce((s, t) => s + Math.max(0, centavosDeTexto(valores[t] ?? "") ?? 0), 0);
}

/**
 * "Retenções na fonte" (lote D, 20/10 — as retenções do Omie): o imposto que o
 * tomador segura do fornecedor e recolhe ele mesmo, tributo a tributo. Cada
 * valor vira uma conta a pagar do imposto; a conta do fornecedor fica no
 * líquido. Um bloco que começa fechado (a regra do Kauan, 08/10), com o total
 * retido na linha.
 *
 * Os campos vão no formulário (`retencao:IRRF`…); quem valida e gera as contas
 * é o servidor (`lib/financeiro/retencoes.ts`). O campo de um imposto que já
 * foi recolhido fica só leitura — e não desabilitado, que não iria no envio e
 * o servidor leria como "tirar a retenção".
 */
export function CamposDasRetencoes({
  valores,
  onChange,
  situacao,
  className = "",
  children,
}: {
  valores: ValoresDasRetencoes;
  onChange: (tributo: TributoRetido, valor: string) => void;
  /** Na edição: a conta de cada imposto, e o porquê do campo travado. */
  situacao?: Partial<Record<TributoRetido, { texto: string; travado?: boolean }>>;
  className?: string;
  /** O que vem embaixo dos campos: o líquido, o bruto, o que a nota diz. */
  children?: React.ReactNode;
}) {
  const retido = totalRetido(valores);
  return (
    <BlocoRecolhivel
      titulo="Retenções na fonte"
      resumo={retido > 0 ? `${formatarReaisDeCentavos(retido)} retidos` : "Sem retenção"}
      className={`bg-surface ${className}`.trim()}
    >
      <div className="flex flex-col gap-3 pt-1">
        <p className="text-helper text-fg-muted">
          O imposto que fica com você e é recolhido por você. Cada valor vira uma conta a pagar do imposto — à Receita, ou à prefeitura no
          ISS —, vencendo no dia 20 do mês seguinte à competência (o ISS, no dia 10).
        </p>
        <FieldGrid columns="sm:grid-cols-3">
          {TRIBUTOS_RETIDOS.map((t) => {
            const s = situacao?.[t];
            return (
              <CampoForm key={t} label={TRIBUTO[t].rotulo} htmlFor={`retencao-${t}`} helper={s?.texto}>
                <Input
                  id={`retencao-${t}`}
                  name={campoDaRetencao(t)}
                  prefix="R$"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={valores[t] ?? ""}
                  onChange={(e) => onChange(t, e.target.value)}
                  readOnly={s?.travado}
                />
              </CampoForm>
            );
          })}
        </FieldGrid>
        {children}
      </div>
    </BlocoRecolhivel>
  );
}
