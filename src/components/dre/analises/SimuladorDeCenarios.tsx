"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Input } from "@/components/ui/Input";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { montarLinhas } from "@/lib/dre/calculo";
import { simularCenario, CENARIOS_PRONTOS, PREMISSAS_ZERADAS, type PremissasDoCenario } from "@/lib/dre/analises";
import { rotuloEconomico, LINHA_DE_RESULTADO, LINHA_OPERACIONAL } from "@/lib/dre/economica";
import { moeda, percentual, tomDoValor } from "@/lib/financeiro/formato";

const LINHAS_DO_SIMULADOR = ["receita_bruta", "margem_contribuicao", "total_despesas_fixas", LINHA_OPERACIONAL, LINHA_DE_RESULTADO];

const CAMPOS: { chave: keyof PremissasDoCenario; rotulo: string; dica: string }[] = [
  { chave: "receita", rotulo: "Receita", dica: "Impostos, CMV, mão de obra e comerciais acompanham." },
  { chave: "cmv", rotulo: "CMV além da receita", dica: "Custo que sobe mais (ou menos) que a venda." },
  { chave: "despesasFixas", rotulo: "Despesas fixas", dica: "Pessoal, diretoria e administrativas." },
  { chave: "financeiras", rotulo: "Despesas financeiras", dica: "Juros e tarifas." },
];

export type BaseDoCenario = { chave: string; rotulo: string; porGrupo: Record<string, number> };

/**
 * O simulador roda no navegador, sobre os totais por grupo de uma base: o mês
 * real ou, com versão de orçamento aprovada, o orçado do mês.
 *
 * Nada é gravado: o cenário é exploração, e o número que se compromete é o
 * orçamento, que tem versão e aprovação próprias em `/dre/orcamento`. As contas
 * são as mesmas funções puras que o servidor usaria — `simularCenario` e
 * `montarLinhas` —, então o número daqui é o que a DRE mostraria se o mês
 * tivesse sido assim.
 */
export function SimuladorDeCenarios({ bases }: { bases: BaseDoCenario[] }) {
  const [premissas, setPremissas] = useState<PremissasDoCenario>(PREMISSAS_ZERADAS);
  const [pronto, setPronto] = useState("base");
  const [chaveDaBase, setChaveDaBase] = useState(bases[0]?.chave ?? "");
  const baseEscolhida = bases.find((b) => b.chave === chaveDaBase) ?? bases[0]!;
  const porGrupo = baseEscolhida.porGrupo;

  const base = useMemo(() => montarLinhas(porGrupo), [porGrupo]);
  const simulado = useMemo(() => montarLinhas(simularCenario(porGrupo, premissas)), [porGrupo, premissas]);

  const valor = (linhas: ReturnType<typeof montarLinhas>, code: string) => linhas.find((l) => l.code === code)?.centavos ?? 0;
  const receitaSimulada = valor(simulado, "receita_bruta");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4 flex flex-col gap-5">
        <h3 className="text-[length:var(--fs-card-title)] font-semibold text-fg">Premissas</h3>
        {/* As duas escolhas ganharam rótulo em cima, como os campos abaixo — o
            "Partir de:" era texto solto no começo da fileira. São um
            `SegmentedControl` desde 08/10/2026: eram fileiras de `Button` que
            alternavam primário e secundário, a "pílula que parece filtro e aba"
            que a conferência de 30/09 aboliu. */}
        {bases.length > 1 && (
          <div>
            <p className="text-label font-medium text-fg mb-1.5">Partir de</p>
            <SegmentedControl
              label="Partir de"
              active={baseEscolhida.chave}
              items={bases.map((b) => ({ key: b.chave, label: b.rotulo }))}
              onChange={setChaveDaBase}
              className="max-w-full flex-wrap"
            />
          </div>
        )}
        <div>
          <p className="text-label font-medium text-fg mb-1.5">Cenário</p>
          <SegmentedControl
            label="Cenário"
            active={pronto}
            items={[...CENARIOS_PRONTOS.map((c) => ({ key: c.chave, label: c.rotulo })), { key: "personalizado", label: "Personalizado" }]}
            onChange={(chave) => {
              setPronto(chave);
              const c = CENARIOS_PRONTOS.find((x) => x.chave === chave);
              if (c) setPremissas(c.premissas);
            }}
            className="max-w-full flex-wrap"
          />
        </div>
        <FieldGrid>
          {CAMPOS.map((c) => (
            <CampoForm key={c.chave} label={c.rotulo} htmlFor={`premissa-${c.chave}`} helper={c.dica}>
              <Input
                id={`premissa-${c.chave}`}
                type="number"
                step="0.5"
                suffix="%"
                value={premissas[c.chave]}
                onChange={(e) => {
                  setPronto("personalizado");
                  setPremissas((p) => ({ ...p, [c.chave]: Number(e.target.value) || 0 }));
                }}
              />
            </CampoForm>
          ))}
        </FieldGrid>
      </Card>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
              <th className="py-2 pl-4 pr-3 font-medium">Linha</th>
              <th className="py-2 pr-3 font-medium text-right">{baseEscolhida.chave === "orcamento" ? "Orçado" : "Mês real"}</th>
              <th className="py-2 pr-4 font-medium text-right">Simulado</th>
            </tr>
          </thead>
          <tbody>
            {LINHAS_DO_SIMULADOR.map((code) => {
              const linha = base.find((l) => l.code === code)!;
              const b = valor(base, code);
              const s = valor(simulado, code);
              return (
                <tr key={code} className="border-b border-border-soft">
                  <td className="py-2 pl-4 pr-3 text-fg-secondary">{rotuloEconomico(code, linha.label)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{moeda(b)}</td>
                  <td className={`py-2 pr-4 text-right tabular-nums font-medium ${s !== b ? tomDoValor(s - b) : ""}`}>
                    {moeda(s)}
                    {s !== b && <span className="block text-[11px]">{s - b > 0 ? "+" : ""}{moeda(s - b)}</span>}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td className="py-2 pl-4 pr-3 text-[11px] text-fg-muted">Margem do período simulada</td>
              <td />
              <td className="py-2 pr-4 text-right text-[12px] tabular-nums">
                {percentual(receitaSimulada === 0 ? null : valor(simulado, LINHA_DE_RESULTADO) / receitaSimulada)}
              </td>
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}
