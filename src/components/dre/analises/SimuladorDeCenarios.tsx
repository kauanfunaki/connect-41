"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
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
      <Card className="p-4 flex flex-col gap-4">
        <h3 className="text-[14px] font-semibold text-fg">Premissas</h3>
        {bases.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] text-fg-secondary">Partir de:</span>
            {bases.map((b) => (
              <Button key={b.chave} size="sm" variant={b.chave === baseEscolhida.chave ? "primary" : "secondary"} onClick={() => setChaveDaBase(b.chave)}>
                {b.rotulo}
              </Button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {CENARIOS_PRONTOS.map((c) => (
            <Button
              key={c.chave}
              size="sm"
              variant={pronto === c.chave ? "primary" : "secondary"}
              onClick={() => {
                setPronto(c.chave);
                setPremissas(c.premissas);
              }}
            >
              {c.rotulo}
            </Button>
          ))}
          <Button size="sm" variant={pronto === "personalizado" ? "primary" : "secondary"} onClick={() => setPronto("personalizado")}>
            Personalizado
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CAMPOS.map((c) => (
            <label key={c.chave} className="flex flex-col gap-1 text-[12px] text-fg-secondary">
              <span className="font-medium">{c.rotulo}</span>
              <Input
                type="number"
                step="0.5"
                suffix="%"
                value={premissas[c.chave]}
                onChange={(e) => {
                  setPronto("personalizado");
                  setPremissas((p) => ({ ...p, [c.chave]: Number(e.target.value) || 0 }));
                }}
              />
              <span className="text-[11px] text-fg-muted">{c.dica}</span>
            </label>
          ))}
        </div>
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
