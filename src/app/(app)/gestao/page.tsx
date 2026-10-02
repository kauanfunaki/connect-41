import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Loader, PauseCircle, PlayCircle, UserX } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/financeiro/FiltroDePeriodo";
import { FiltroDeSetor } from "@/components/gestao/FiltroDeSetor";
import { ItemDaGestao, SelosDoItem, ORIGEM } from "@/components/gestao/ItemDaGestao";
import { getPrisma } from "@/lib/prisma";
import { setorDoModulo } from "@/lib/modules";
import { contextoDaGestao, recorteComFiltro } from "@/lib/gestao/acesso";
import { itensDaGestao } from "@/lib/gestao/itens";
import { ordemDeAtencao, precisaDeAtencao, podeVerSetor, type Coluna } from "@/lib/gestao/regras";
import { inicioDoMes, nomesDasPessoas, pessoasPorSetor } from "@/lib/gestao/telas";
import { reatribuirItem } from "./actions";

export const dynamic = "force-dynamic";

const COLUNAS: { key: Coluna; titulo: string; vazio: string; icone: React.ReactNode }[] = [
  { key: "INICIADO", titulo: "Iniciados", vazio: "Nada esperando começar.", icone: <PlayCircle /> },
  { key: "ANDAMENTO", titulo: "Em andamento", vazio: "Nada em andamento.", icone: <Loader /> },
  { key: "PARADO", titulo: "Paralisados", vazio: "Nada parado.", icone: <PauseCircle /> },
  { key: "CONCLUIDO", titulo: "Concluídos (30 dias)", vazio: "Nada concluído nos últimos 30 dias.", icone: <CheckCircle2 /> },
];
const POR_COLUNA = 8;
const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default async function PainelDeGestaoPage({ searchParams }: { searchParams: Promise<{ setor?: string }> }) {
  const g = await contextoDaGestao();
  if (!g) notFound();
  const { ctx } = g;
  const { recorte, setor } = recorteComFiltro(g.recorte, g.setores, (await searchParams).setor);
  const agora = new Date();
  const itens = await itensDaGestao(ctx.tenantId, recorte, agora);

  const porColuna = new Map<Coluna, typeof itens>(COLUNAS.map((c) => [c.key, []]));
  for (const x of itens) porColuna.get(x.c.coluna)!.push(x);
  const semResponsavel = itens.filter((x) => x.c.coluna !== "CONCLUIDO" && x.item.responsaveis.length === 0).length;
  const atencao = itens.filter((x) => precisaDeAtencao(x.c)).sort(ordemDeAtencao);

  const [nomeDe, pessoas] = await Promise.all([
    nomesDasPessoas(ctx.tenantId, itens.flatMap((x) => x.item.responsaveis)),
    pessoasPorSetor(ctx, atencao.slice(0, 12)),
  ]);

  // Custos operacionais: as taxas de órgão do Societário no mês — o dinheiro
  // que o escritório adianta para os processos.
  const setorSocietario = (await setorDoModulo(ctx.tenantId, "societario_processos")) ?? "societario";
  const inicio = inicioDoMes(agora);
  const verTaxas = podeVerSetor(recorte, setorSocietario);
  const [lancadas, pagas] = verTaxas
    ? await Promise.all([
        getPrisma().processFee.aggregate({ where: { tenantId: ctx.tenantId, createdAt: { gte: inicio } }, _sum: { amountCents: true }, _count: true }),
        getPrisma().processFee.aggregate({ where: { tenantId: ctx.tenantId, paidAt: { gte: inicio } }, _sum: { amountCents: true }, _count: true }),
      ])
    : [null, null];

  const ordenarColuna = (a: (typeof itens)[number], b: (typeof itens)[number]) =>
    ordemDeAtencao(a, b) || b.item.ultimaMovimentacao.getTime() - a.item.ultimaMovimentacao.getTime();

  return (
    <div className="flex flex-col gap-6">
      <FiltroDeSetor setores={g.setores} />

      {/* As contagens por situação no cartão padrão das telas (30/09), com
          ícone. Sem o respiro da faixa: aqui quem espaça é o `gap` da coluna. */}
        <FaixaDeTotais
          className=""
          itens={[
            ...COLUNAS.map((c) => {
              const n = porColuna.get(c.key)!.length;
              return {
                rotulo: c.titulo,
                valor: String(n),
                icone: c.icone,
                tom: c.key === "PARADO" && n > 0 ? "text-warning" : c.key === "CONCLUIDO" ? "text-success" : undefined,
              };
            }),
            {
              rotulo: "Sem responsável",
              valor: String(semResponsavel),
              icone: <UserX />,
              tom: semResponsavel > 0 ? "text-warning" : undefined,
              detalhe: "em aberto",
            },
          ]}
        />

      <section aria-labelledby="atencao" className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 id="atencao" className="text-[length:var(--fs-card-title)] font-semibold text-fg">
            Precisam de atenção ({atencao.length})
          </h2>
          {atencao.length > 12 && (
            <Button href={setor ? `/gestao/alertas?setor=${setor}` : "/gestao/alertas"} variant="secondary" size="xs">
              Ver todos <ArrowRight size={12} />
            </Button>
          )}
        </div>
        {atencao.length === 0 ? (
          <Card>
            <EmptyState title="Nada parado nem atrasado" description="Nenhum processo, card, pendência ou transferência passou do limite do setor." />
          </Card>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
            {atencao.slice(0, 12).map((x) => (
              <ItemDaGestao
                key={`${x.item.origem}:${x.item.id}`}
                item={x.item}
                c={x.c}
                rotuloDoSetor={g.rotuloDoSetor(x.item.setor)}
                nomeDe={nomeDe}
                pessoasDoSetor={pessoas.get(x.item.setor)}
                reatribuir={reatribuirItem}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ciclo" className="flex flex-col gap-2">
        <h2 id="ciclo" className="text-[length:var(--fs-card-title)] font-semibold text-fg">
          O ciclo do trabalho
        </h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {COLUNAS.map((col) => {
            const lista = porColuna.get(col.key)!.sort(ordenarColuna);
            return (
              <Card key={col.key} className="p-4 flex flex-col gap-2 min-w-0">
                <p className="text-[13px] font-semibold text-fg">
                  {col.titulo} <span className="text-fg-muted font-normal tabular-nums">({lista.length})</span>
                </p>
                {lista.length === 0 ? (
                  <p className="text-[12px] text-fg-muted">{col.vazio}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {lista.slice(0, POR_COLUNA).map((x) => (
                      <li key={`${x.item.origem}:${x.item.id}`} className="flex flex-col gap-0.5 min-w-0">
                        <Link href={x.item.href} className="text-[12px] text-fg hover:underline break-words">
                          {x.item.titulo}
                        </Link>
                        <div className="flex flex-wrap items-center gap-1 text-[11px] text-fg-muted">
                          <span>
                            {ORIGEM[x.item.origem]} · {g.rotuloDoSetor(x.item.setor)} ·{" "}
                            {x.item.responsaveis.length ? x.item.responsaveis.map((u) => nomeDe.get(u) ?? "—").join(", ") : "sem responsável"}
                          </span>
                          <SelosDoItem c={x.c} />
                        </div>
                      </li>
                    ))}
                    {lista.length > POR_COLUNA && <li className="text-[11px] text-fg-muted">e mais {lista.length - POR_COLUNA}</li>}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      {verTaxas && lancadas && pagas && (
        <section aria-labelledby="custos" className="flex flex-col gap-2">
          <h2 id="custos" className="text-[length:var(--fs-card-title)] font-semibold text-fg">
            Custos do mês
          </h2>
          <Card className="p-4 text-[13px] text-fg-secondary flex flex-wrap gap-x-6 gap-y-1">
            <span>
              Taxas de órgão lançadas no Societário:{" "}
              <strong className="text-fg tabular-nums">{MOEDA.format((lancadas._sum.amountCents ?? 0) / 100)}</strong> ({lancadas._count})
            </span>
            <span>
              Pagas no mês: <strong className="text-fg tabular-nums">{MOEDA.format((pagas._sum.amountCents ?? 0) / 100)}</strong> ({pagas._count})
            </span>
          </Card>
        </section>
      )}
    </div>
  );
}
