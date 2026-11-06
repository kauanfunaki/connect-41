import { notFound } from "next/navigation";
import { CheckCheck, Clock, ListChecks, Timer } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao } from "@/components/shared/ListaResponsiva";
import { FiltrosDaTela, type CampoDeFiltro } from "@/components/shared/FiltrosDaTela";
import { campoDeSetor } from "@/components/gestao/FiltroDeSetor";
import { formatarHoras } from "@/lib/format";
import { contextoDaGestao, recorteComFiltro } from "@/lib/gestao/acesso";
import { itensDaGestao } from "@/lib/gestao/itens";
import { horasDoPeriodo, periodoDaUrl } from "@/lib/gestao/horas";
import { nomesDasPessoas } from "@/lib/gestao/telas";
import { porcentagem, produtividadePorPessoa, type ProdutividadeDaPessoa } from "@/lib/gestao/produtividade";
import type { Origem } from "@/lib/gestao/regras";

export const dynamic = "force-dynamic";

const ROTULO_DA_ORIGEM: Record<Origem, [string, string]> = {
  PROCESSO: ["processo", "processos"],
  CARD: ["tarefa", "tarefas"],
  PENDENCIA: ["pendência", "pendências"],
  TRANSFERENCIA: ["transferência", "transferências"],
  SOLICITACAO: ["solicitação", "solicitações"],
};
const h = (min: number) => formatarHoras(min / 60);
const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
const CABECALHO = "border-b border-border text-micro font-semibold uppercase tracking-wide text-fg-muted";

/** "3 processos · 12 tarefas". */
function composicao(l: ProdutividadeDaPessoa): string {
  return (Object.keys(ROTULO_DA_ORIGEM) as Origem[])
    .filter((o) => l.porOrigem[o] > 0)
    .map((o) => `${l.porOrigem[o]} ${ROTULO_DA_ORIGEM[o][l.porOrigem[o] === 1 ? 0 : 1]}`)
    .join(" · ");
}

/**
 * A produtividade por pessoa (05/11/2026, decisão do Kauan: Gestão C, a
 * produtividade primeiro). O que cada pessoa entregou no período, no prazo, o
 * que carrega agora e as horas — com quanto veio do cronômetro. Um bloco por
 * setor: cada setor entrega coisas diferentes, e comparar entre eles engana.
 * O mapa dos processos de cada setor (o tempo-padrão das etapas) vem depois.
 */
export default async function ProdutividadeDaGestaoPage({ searchParams }: { searchParams: Promise<{ setor?: string; periodo?: string }> }) {
  const g = await contextoDaGestao();
  if (!g) notFound();
  const { ctx } = g;
  const params = await searchParams;
  const { recorte } = recorteComFiltro(g.recorte, g.setores, params.setor);
  const periodo = periodoDaUrl(params.periodo);
  const agora = new Date();

  const [itens, horas] = await Promise.all([
    itensDaGestao(ctx.tenantId, recorte, agora, { concluidosDesde: periodo.de }),
    horasDoPeriodo(ctx.tenantId, recorte, periodo.de, periodo.ate),
  ]);
  const linhas = produtividadePorPessoa(
    itens,
    horas.map((l) => ({ userId: l.userId, setor: l.setor, minutos: l.minutos, origem: l.origem })),
    periodo,
  );
  const nomeDe = await nomesDasPessoas(ctx.tenantId, linhas.map((l) => l.userId));
  const rotuloDoSetor = new Map(g.setores.map((s) => [s.value, s.label]));
  const porSetor = new Map<string, ProdutividadeDaPessoa[]>();
  for (const l of linhas) porSetor.set(l.setor, [...(porSetor.get(l.setor) ?? []), l]);
  const blocos = [...porSetor.entries()]
    .map(([codigo, ls]) => ({
      codigo,
      rotulo: rotuloDoSetor.get(codigo) ?? codigo,
      linhas: ls.sort((a, b) => b.entregues - a.entregues || b.emAberto - a.emAberto || (nomeDe.get(a.userId) ?? "").localeCompare(nomeDe.get(b.userId) ?? "", "pt-BR")),
    }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));

  const soma = (f: (l: ProdutividadeDaPessoa) => number) => linhas.reduce((s, l) => s + f(l), 0);
  const entregues = soma((l) => l.entregues);
  const minutos = soma((l) => l.minutos);
  const campos: CampoDeFiltro[] = [
    ...(campoDeSetor(g.setores) ? [campoDeSetor(g.setores)!] : []),
    { chave: "periodo", rotulo: "Período", vazioLabel: periodoDaUrl("mes").rotulo, opcoes: (["anterior", "90d"] as const).map((k) => ({ value: k, label: periodoDaUrl(k).rotulo })) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body text-fg-secondary">
          {periodo.rotulo}: o que cada pessoa entregou, no prazo, o que carrega agora e as horas apontadas.
        </p>
        <FiltrosDaTela naBarra campos={campos} />
      </div>

      <FaixaDeTotais
        itens={[
          { rotulo: "Entregues", valor: String(entregues), icone: <CheckCheck />, detalhe: periodo.rotulo.toLowerCase() },
          { rotulo: "No prazo", valor: pct(porcentagem(soma((l) => l.noPrazo), soma((l) => l.comPrazo))), icone: <ListChecks />, detalhe: `dos ${soma((l) => l.comPrazo)} com prazo` },
          { rotulo: "Em aberto agora", valor: String(soma((l) => l.emAberto)), icone: <Clock />, detalhe: `${soma((l) => l.parados)} parados · ${soma((l) => l.vencidos)} vencidos` },
          { rotulo: "Horas apontadas", valor: h(minutos), icone: <Timer />, detalhe: `${pct(porcentagem(soma((l) => l.minutosDoCronometro), minutos))} pelo cronômetro` },
        ]}
      />

      {blocos.length === 0 ? (
        <EmptyState icon={<CheckCheck />} title="Nada entregue nem em aberto no período" description="Quando houver processos, tarefas, pendências, transferências ou solicitações com responsável, eles aparecem aqui." />
      ) : (
        blocos.map((b) => (
          <Card as="section" key={b.codigo} aria-labelledby={`produtividade-${b.codigo}`} className="p-5 min-w-0">
            <h2 id={`produtividade-${b.codigo}`} className="text-card-title font-semibold text-fg mb-3">
              {b.rotulo}
            </h2>
            <CartoesNoCelular>
              {b.linhas.map((l) => (
                <Cartao key={l.userId}>
                  <TopoDoCartao nome={nomeDe.get(l.userId) ?? "—"} valor={`${l.entregues} entregues`} />
                  {l.entregues > 0 && <InfoDoCartao>{composicao(l)}</InfoDoCartao>}
                  <InfoDoCartao>
                    no prazo {pct(porcentagem(l.noPrazo, l.comPrazo))} · {l.emAberto} em aberto · {l.vencidos} vencidos
                  </InfoDoCartao>
                  <InfoDoCartao>
                    {h(l.minutos)} · {pct(porcentagem(l.minutosDoCronometro, l.minutos))} pelo cronômetro
                  </InfoDoCartao>
                </Cartao>
              ))}
            </CartoesNoCelular>
            <TabelaNoDesktop padrao>
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr className={CABECALHO}>
                    <th className="py-2 pr-3 text-left">Pessoa</th>
                    <th className="py-2 pr-3 text-right">Entregues</th>
                    <th className="py-2 pr-3 text-right">No prazo</th>
                    <th className="py-2 pr-3 text-right">Em aberto</th>
                    <th className="py-2 pr-3 text-right">Parados</th>
                    <th className="py-2 pr-3 text-right">Vencidos</th>
                    <th className="py-2 text-right">Horas</th>
                  </tr>
                </thead>
                <tbody>
                  {b.linhas.map((l) => (
                    <tr key={l.userId} className="border-b border-border-soft align-top">
                      <td className="py-2.5 pr-3">
                        <span className="font-medium text-fg">{nomeDe.get(l.userId) ?? "—"}</span>
                        {l.entregues > 0 && <span className="block text-micro text-fg-muted">{composicao(l)}</span>}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums font-semibold">{l.entregues}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        {pct(porcentagem(l.noPrazo, l.comPrazo))}
                        {l.comPrazo > 0 && <span className="block text-micro text-fg-muted">{l.noPrazo} de {l.comPrazo}</span>}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{l.emAberto}</td>
                      <td className={`py-2.5 pr-3 text-right tabular-nums ${l.parados > 0 ? "text-warning-fg font-medium" : ""}`}>{l.parados}</td>
                      <td className={`py-2.5 pr-3 text-right tabular-nums ${l.vencidos > 0 ? "text-danger font-medium" : ""}`}>{l.vencidos}</td>
                      <td className="py-2.5 text-right tabular-nums">
                        {h(l.minutos)}
                        {l.minutos > 0 && <span className="block text-micro text-fg-muted">{pct(porcentagem(l.minutosDoCronometro, l.minutos))} cronômetro</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TabelaNoDesktop>
          </Card>
        ))
      )}

      <p className="text-micro text-fg-muted">
        Entregue é o item concluído no período em que a pessoa responde (com dois responsáveis, conta para os dois). No prazo:
        terminou até o dia do prazo, entre os que tinham prazo. Parado e vencido seguem os limites de cada setor, como no
        Painel. As horas pelo cronômetro são as marcadas no relógio do Connect; o resto foi lançado à mão. Setores não se
        comparam: cada um entrega coisas diferentes.
      </p>
    </div>
  );
}
