import { notFound } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { FiltroDeSetor } from "@/components/gestao/FiltroDeSetor";
import { formatInstantDate } from "@/lib/format";
import { contextoDaGestao, recorteComFiltro } from "@/lib/gestao/acesso";
import { custosDoTenant, horasDoPeriodo, periodoDaUrl } from "@/lib/gestao/horas";
import { resumirHoras } from "@/lib/gestao/custo";
import { nomesDasPessoas } from "@/lib/gestao/telas";

export const dynamic = "force-dynamic";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const HORAS = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const h = (min: number) => `${HORAS.format(min / 60)} h`;

// As horas de operação: o que cada setor e cada pessoa apontou, em card e em
// processo, e quanto isso custou pelo custo da hora do Valora. Custo de equipe
// é confidencial: só aparece para quem vê todos os setores (diretoria e
// administradores).
export default async function HorasDeOperacaoPage({ searchParams }: { searchParams: Promise<{ setor?: string; periodo?: string; pessoa?: string }> }) {
  const g = await contextoDaGestao();
  if (!g) notFound();
  const { ctx } = g;
  const params = await searchParams;
  const { recorte, setor } = recorteComFiltro(g.recorte, g.setores, params.setor);
  const periodo = periodoDaUrl(params.periodo);
  const podeVerCusto = g.recorte === "todos";

  const todas = await horasDoPeriodo(ctx.tenantId, recorte, periodo.de, periodo.ate);
  const pessoa = params.pessoa && todas.some((l) => l.userId === params.pessoa) ? params.pessoa : null;
  const linhas = pessoa ? todas.filter((l) => l.userId === pessoa) : todas;
  const { custoDe, configurado } = await custosDoTenant(ctx.tenantId);
  const resumo = resumirHoras(linhas, podeVerCusto ? custoDe : () => null);
  const nomeDe = await nomesDasPessoas(ctx.tenantId, todas.map((l) => l.userId));

  const q = (extra: Record<string, string | null>) => {
    const u = new URLSearchParams();
    const base = { setor, periodo: periodo.chave === "mes" ? null : periodo.chave, pessoa, ...extra };
    for (const [k, v] of Object.entries(base)) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `?${s}` : "";
  };
  const chip = (ligado: boolean) =>
    `inline-flex items-center h-8 px-3 rounded-md text-[12px] font-medium ${ligado ? "bg-surface-2 text-fg border border-border-strong" : "text-fg-muted hover:text-fg hover:bg-surface-2"}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <FiltroDeSetor base="/gestao/horas" setores={g.setores} ativo={setor} />
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Período">
          {(["mes", "anterior", "90d"] as const).map((k) => (
            <Link key={k} href={`/gestao/horas${q({ periodo: k === "mes" ? null : k })}`} className={chip(periodo.chave === k)}>
              {periodoDaUrl(k).rotulo}
            </Link>
          ))}
          <a href={`/gestao/horas/exportar${q({})}`} className="ml-auto text-[12px] text-brand hover:underline">
            Exportar CSV
          </a>
        </div>
        {pessoa && (
          <p className="text-[12px] text-fg-muted">
            Só as horas de {nomeDe.get(pessoa) ?? "—"}.{" "}
            <Link href={`/gestao/horas${q({ pessoa: null })}`} className="text-brand hover:underline">
              Ver todos
            </Link>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label={`Horas — ${periodo.rotulo.toLowerCase()}`} value={h(resumo.total.minutos)} />
        {podeVerCusto && <MetricCard label="Custo das horas" value={resumo.total.custo === null ? "—" : MOEDA.format(resumo.total.custo)} />}
        <MetricCard label="Pessoas" value={resumo.porPessoa.length} />
        <MetricCard label="Apontamentos" value={linhas.length} />
      </div>

      {podeVerCusto && (resumo.minutosSemCusto > 0 || !configurado) && (
        <p className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-[12px] text-fg-secondary">
          {!configurado
            ? "O custo das equipes ainda não foi preenchido no Valora, então as horas aparecem sem custo."
            : `${h(resumo.minutosSemCusto)} estão em setores sem custo de equipe no Valora (só Fiscal, DP, Societário e Contábil têm) e ficaram fora do custo.`}{" "}
          <Link href="/valora/parametros" className="text-brand hover:underline">
            Custos no Valora
          </Link>
        </p>
      )}

      {linhas.length === 0 ? (
        <Card>
          <EmptyState title="Nenhuma hora apontada no período" description="As horas entram pelo cronômetro ou pelo lançamento manual, no card e no processo." />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            <Card className="p-4 flex flex-col gap-2">
              <h2 className="text-[14px] font-semibold text-fg">Por setor</h2>
              <table className="w-full text-[13px]">
                <tbody>
                  {resumo.porSetor.map((s) => (
                    <tr key={s.setor} className="border-t border-border first:border-t-0">
                      <td className="py-1.5 pr-3">{g.rotuloDoSetor(s.setor)}</td>
                      <td className="py-1.5 pr-3 tabular-nums text-right">{h(s.minutos)}</td>
                      {podeVerCusto && <td className="py-1.5 tabular-nums text-right text-fg-secondary">{s.custo === null ? "sem custo" : MOEDA.format(s.custo)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card className="p-4 flex flex-col gap-2">
              <h2 className="text-[14px] font-semibold text-fg">Por pessoa</h2>
              <table className="w-full text-[13px]">
                <tbody>
                  {resumo.porPessoa.map((p) => (
                    <tr key={p.userId} className="border-t border-border first:border-t-0">
                      <td className="py-1.5 pr-3">
                        <Link href={`/gestao/horas${q({ pessoa: p.userId })}`} className="hover:underline">
                          {nomeDe.get(p.userId) ?? "—"}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-3 tabular-nums text-right">{h(p.minutos)}</td>
                      {podeVerCusto && <td className="py-1.5 tabular-nums text-right text-fg-secondary">{p.custo === null ? "sem custo" : MOEDA.format(p.custo)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

          <Card className="p-4 overflow-x-auto">
            <h2 className="mb-2 text-[14px] font-semibold text-fg">Apontamentos</h2>
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-fg-muted">
                  <th className="pb-2 pr-3 font-medium">Dia</th>
                  <th className="pb-2 pr-3 font-medium">Pessoa</th>
                  <th className="pb-2 pr-3 font-medium">Onde</th>
                  <th className="pb-2 pr-3 font-medium">Setor</th>
                  <th className="pb-2 font-medium text-right">Tempo</th>
                </tr>
              </thead>
              <tbody>
                {linhas.slice(0, 200).map((l) => (
                  <tr key={l.id} className="border-t border-border align-top">
                    <td className="py-1.5 pr-3 tabular-nums whitespace-nowrap">{formatInstantDate(l.dia)}</td>
                    <td className="py-1.5 pr-3">{nomeDe.get(l.userId) ?? "—"}</td>
                    <td className="py-1.5 pr-3">
                      <Link href={l.href} className="hover:underline">
                        {l.titulo}
                      </Link>
                      {l.nota && <span className="block text-[11px] text-fg-muted">{l.nota}</span>}
                    </td>
                    <td className="py-1.5 pr-3">{g.rotuloDoSetor(l.setor)}</td>
                    <td className="py-1.5 tabular-nums text-right">{h(l.minutos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {linhas.length > 200 && <p className="mt-2 text-[12px] text-fg-muted">Mostrando 200 de {linhas.length}. O CSV traz todos.</p>}
          </Card>
        </>
      )}
    </div>
  );
}
