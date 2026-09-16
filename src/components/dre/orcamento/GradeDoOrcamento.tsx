"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { GRUPOS } from "@/lib/dre/estrutura";
import { montarLinhas } from "@/lib/dre/calculo";
import { rotuloEconomico } from "@/lib/dre/economica";
import { centavosDeTexto } from "@/lib/financeiro/manual";
import { campoDaCelula, porGrupoOrcado, MESES, ROTULOS_DOS_MESES, MAIOR_VALOR_ORCADO, type Grade } from "@/lib/dre/orcamento/grade";
import { moeda, tomDoValor } from "@/lib/financeiro/formato";
import { salvarGrade } from "@/app/(app)/dre/orcamento/actions";

/** Os subtotais que a grade mostra embaixo — os mesmos da DRE, pelo mesmo motor. */
const SUBTOTAIS = ["receita_liquida", "margem_contribuicao", "total_despesas_fixas", "gerador_de_caixa", "fluxo_apos_investimentos", "fluxo_de_caixa_livre"];

const TH = "py-2 px-2 font-medium text-right whitespace-nowrap";

/**
 * A grade grupo × mês de uma versão.
 *
 * Os totais e subtotais são recalculados no navegador a cada digitação com
 * `porGrupoOrcado` + `montarLinhas` — as mesmas funções que o servidor usa no
 * orçado × realizado —, então o "resultado do período" que aparece aqui é o
 * que a DRE econômica vai comparar. Célula ilegível fica marcada e conta zero
 * no total; o servidor recusa ao salvar dizendo grupo e mês.
 */
export function GradeDoOrcamento({
  budgetId,
  lidoEm,
  grade,
  somenteLeitura,
}: {
  budgetId: string;
  /** `updatedAt` da versão quando a tela foi montada — a gravação é condicionada a ele. */
  lidoEm: string;
  grade: Record<string, string[]>;
  somenteLeitura: boolean;
}) {
  const router = useRouter();
  const [valores, setValores] = useState(grade);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [sujo, setSujo] = useState(false);
  const [pendente, startTransition] = useTransition();

  const { centavos, invalidas } = useMemo(() => {
    const g: Grade = {};
    const ruins = new Set<string>();
    for (const grupo of GRUPOS) {
      g[grupo.code] = MESES.map((m, i) => {
        const t = (valores[grupo.code]?.[i] ?? "").trim();
        if (t === "") return 0;
        const c = t.startsWith("-") ? null : centavosDeTexto(t);
        if (c === null || c > MAIOR_VALOR_ORCADO) {
          ruins.add(campoDaCelula(grupo.code, m));
          return 0;
        }
        return c;
      });
    }
    return { centavos: g, invalidas: ruins };
  }, [valores]);

  const porMes = useMemo(() => MESES.map((m) => montarLinhas(porGrupoOrcado(centavos, [m]))), [centavos]);
  const anual = useMemo(() => montarLinhas(porGrupoOrcado(centavos, MESES)), [centavos]);
  const valorDe = (linhas: ReturnType<typeof montarLinhas>, code: string) => linhas.find((l) => l.code === code)?.centavos ?? 0;

  const totalDoMes = (origem: "recebimento" | "pagamento", i: number) =>
    GRUPOS.filter((g) => g.origem === origem).reduce((n, g) => n + (centavos[g.code]?.[i] ?? 0), 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        setErro(null);
        setSalvo(false);
        startTransition(async () => {
          const r = await salvarGrade(dados);
          if ("error" in r) {
            setErro(r.error);
            return;
          }
          setSalvo(true);
          setSujo(false);
          // O `lidoEm` novo vem do servidor: sem recarregar, a próxima gravação
          // seria recusada como se outra pessoa tivesse salvo.
          router.refresh();
        });
      }}
    >
      <input type="hidden" name="budgetId" value={budgetId} />
      <input type="hidden" name="lidoEm" value={lidoEm} />

      <div className="overflow-x-auto border border-border rounded-lg bg-surface">
        <table className="w-full min-w-[1480px] text-[12px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
              <th className="py-2 pl-3 pr-2 font-medium text-left sticky left-0 bg-surface min-w-[220px]">Grupo da DRE</th>
              {ROTULOS_DOS_MESES.map((m) => (
                <th key={m} className={TH}>
                  {m}
                </th>
              ))}
              <th className={`${TH} pr-3`}>Total do ano</th>
            </tr>
          </thead>
          <tbody>
            {GRUPOS.map((grupo) => {
              const total = (centavos[grupo.code] ?? []).reduce((a, b) => a + b, 0);
              return (
                <tr key={grupo.code} className="border-b border-border-soft">
                  <td className="py-1.5 pl-3 pr-2 text-fg-secondary sticky left-0 bg-surface">
                    {grupo.label}
                    <span className="block text-[10px] text-fg-muted">{grupo.origem === "recebimento" ? "receita (+)" : "despesa (−)"}</span>
                  </td>
                  {MESES.map((m, i) => {
                    const nome = campoDaCelula(grupo.code, m);
                    return (
                      <td key={m} className="py-1 px-1">
                        {somenteLeitura ? (
                          <span className="block text-right tabular-nums px-1">{centavos[grupo.code]![i] ? moeda(centavos[grupo.code]![i]!) : "—"}</span>
                        ) : (
                          <div className="w-[96px]">
                            <Input
                              compact
                              name={nome}
                              inputMode="decimal"
                              value={valores[grupo.code]?.[i] ?? ""}
                              error={invalidas.has(nome)}
                              aria-label={`${grupo.label}, ${ROTULOS_DOS_MESES[i]}`}
                              className="text-right tabular-nums"
                              onChange={(e) => {
                                const texto = e.target.value;
                                setSujo(true);
                                setSalvo(false);
                                setValores((v) => {
                                  const linha = [...(v[grupo.code] ?? MESES.map(() => ""))];
                                  linha[i] = texto;
                                  return { ...v, [grupo.code]: linha };
                                });
                              }}
                            />
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-1.5 px-2 pr-3 text-right tabular-nums font-medium whitespace-nowrap">{moeda(total)}</td>
                </tr>
              );
            })}

            <tr className="border-b border-border bg-surface-hover">
              <td className="py-1.5 pl-3 pr-2 font-medium sticky left-0 bg-surface-hover">Total de receitas</td>
              {MESES.map((m, i) => (
                <td key={m} className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">
                  {moeda(totalDoMes("recebimento", i))}
                </td>
              ))}
              <td className="py-1.5 px-2 pr-3 text-right tabular-nums font-medium whitespace-nowrap">
                {moeda(MESES.reduce((n, _, i) => n + totalDoMes("recebimento", i), 0))}
              </td>
            </tr>
            <tr className="border-b border-border bg-surface-hover">
              <td className="py-1.5 pl-3 pr-2 font-medium sticky left-0 bg-surface-hover">Total de despesas</td>
              {MESES.map((m, i) => (
                <td key={m} className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">
                  {moeda(-totalDoMes("pagamento", i))}
                </td>
              ))}
              <td className="py-1.5 px-2 pr-3 text-right tabular-nums font-medium whitespace-nowrap">
                {moeda(-MESES.reduce((n, _, i) => n + totalDoMes("pagamento", i), 0))}
              </td>
            </tr>

            {SUBTOTAIS.map((code) => {
              const linha = anual.find((l) => l.code === code)!;
              const destaque = linha.destaque;
              return (
                <tr key={code} className={`border-b border-border-soft ${destaque ? "bg-surface-hover" : ""}`}>
                  <td className={`py-1.5 pl-3 pr-2 sticky left-0 ${destaque ? "bg-surface-hover font-semibold" : "bg-surface font-medium"}`}>
                    {rotuloEconomico(code, linha.label)}
                  </td>
                  {porMes.map((linhas, i) => {
                    const v = valorDe(linhas, code);
                    return (
                      <td key={i} className={`py-1.5 px-2 text-right tabular-nums whitespace-nowrap ${tomDoValor(v)}`}>
                        {moeda(v)}
                      </td>
                    );
                  })}
                  <td className={`py-1.5 px-2 pr-3 text-right tabular-nums whitespace-nowrap font-semibold ${tomDoValor(valorDe(anual, code))}`}>
                    {moeda(valorDe(anual, code))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!somenteLeitura && (
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <Button type="submit" size="sm" disabled={pendente || invalidas.size > 0}>
            {pendente ? "Salvando…" : "Salvar grade"}
          </Button>
          {invalidas.size > 0 && (
            <span className="text-[12px] text-danger">
              {invalidas.size} {invalidas.size === 1 ? "célula ilegível" : "células ilegíveis"} — use valor positivo, como 1.234,56.
            </span>
          )}
          {sujo && !pendente && invalidas.size === 0 && <span className="text-[12px] text-warning">Alterações não salvas.</span>}
          {salvo && (
            <span className="inline-flex items-center gap-1 text-[12px] text-success">
              <Check size={13} /> Grade salva.
            </span>
          )}
          {erro && <span className="text-[12px] text-danger">{erro}</span>}
        </div>
      )}
    </form>
  );
}
