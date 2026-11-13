import { notFound } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FiltroDeSetor } from "@/components/gestao/FiltroDeSetor";
import { SelosDoItem, ORIGEM } from "@/components/gestao/ItemDaGestao";
import { LinhaDaCarga, type CargaDaLinha } from "@/components/gestao/LinhaDaCarga";
import { getPrisma } from "@/lib/prisma";
import { contextoDaGestao, recorteComFiltro } from "@/lib/gestao/acesso";
import { comTitulos, itensDaGestao } from "@/lib/gestao/itens";
import { cargaPorPessoa, ordemDeAtencao } from "@/lib/gestao/regras";
import { itensDaPessoaNaGestao } from "../actions";

export const dynamic = "force-dynamic";

// A carga de cada pessoa, em todos os setores que quem vê enxerga: processos,
// cards, pendências e transferências em aberto, o que está parado e o que
// está com prazo. Coordenador sem nada em aberto também aparece — é o que
// mostra quem tem espaço.
//
// Desde 13/11/2026 (melhoria-662) a página leva só os números: a lista de
// cada pessoa vem quando a linha dela abre, e a tabela é uma só — no celular
// ela esconde as colunas por tipo (o total por tipo aparece na linha aberta).
// Eram a tabela e os cartões, cada um com a lista de todo mundo.
export default async function CoordenadoresPage({ searchParams }: { searchParams: Promise<{ setor?: string }> }) {
  const g = await contextoDaGestao();
  if (!g) notFound();
  const { ctx } = g;
  const { recorte, setor } = recorteComFiltro(g.recorte, g.setores, (await searchParams).setor);
  const itens = await itensDaGestao(ctx.tenantId, recorte);
  const carga = cargaPorPessoa(itens);
  const setoresVisiveis = setor ? [setor] : g.setores.map((s) => s.value);

  const pessoas = await getPrisma().user.findMany({
    where: {
      tenantId: ctx.tenantId,
      active: true,
      OR: [{ id: { in: [...carga.keys()] } }, { role: "SECTOR_ADMIN", sectors: { some: { sectorCode: { in: setoresVisiveis } } } }],
    },
    select: { id: true, name: true, role: true, sectors: { select: { sectorCode: true } } },
  });

  const vazia: CargaDaLinha = {
    abertos: 0,
    porOrigem: { PROCESSO: 0, CARD: 0, PENDENCIA: 0, TRANSFERENCIA: 0, SOLICITACAO: 0 },
    parados: 0,
    vencidos: 0,
    vencendo: 0,
  };
  const linhas = pessoas
    .map((p) => ({ pessoa: p, carga: carga.get(p.id) ?? vazia }))
    .sort((a, b) => b.carga.vencidos - a.carga.vencidos || b.carga.parados - a.carga.parados || b.carga.abertos - a.carga.abertos || a.pessoa.name.localeCompare(b.pessoa.name));

  const semDono = itens.filter((x) => x.c.coluna !== "CONCLUIDO" && x.item.responsaveis.length === 0).sort(ordemDeAtencao);
  // Título só dos 50 que a lista mostra.
  const semDonoNaTela = await comTitulos(ctx.tenantId, semDono.slice(0, 50));
  const setoresDe = (p: (typeof pessoas)[number]) => p.sectors.map((s) => g.rotuloDoSetor(s.sectorCode)).join(", ");
  const TH_POR_TIPO = "px-3 hidden md:table-cell";

  return (
    <div className="flex flex-col gap-6">
      <FiltroDeSetor setores={g.setores} />

      {linhas.length === 0 ? (
        <Card>
          <EmptyState title="Ninguém com trabalho em aberto" description="Nenhuma pessoa responde por item em aberto nestes setores." />
        </Card>
      ) : (
        // Casco padrão, centralizado (30/09). Sem funil: a pessoa é única por
        // linha e o resto é número; o setor se escolhe no "Filtros". No celular
        // ficam a pessoa, o total, os parados e os prazos — o motivo da visita.
        <div className="c41-tabela bg-surface border border-border rounded-lg overflow-x-auto">
          <table className="w-full md:min-w-[760px]">
            <thead>
              <tr className="border-b border-border text-micro font-semibold uppercase tracking-wide text-fg-muted">
                <th className="px-3">Pessoa</th>
                <th className="px-3">Em aberto</th>
                <th className={TH_POR_TIPO}>Processos</th>
                <th className={TH_POR_TIPO}>Atividades</th>
                <th className={TH_POR_TIPO}>Pendências</th>
                <th className={TH_POR_TIPO}>Transferências</th>
                <th className={TH_POR_TIPO}>Solicitações</th>
                <th className="px-3">Parados</th>
                <th className="px-3">Prazo vencido</th>
                <th className="px-3">Vencendo</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ pessoa, carga: c }) => (
                <LinhaDaCarga
                  // Pelo recorte: trocar o setor no filtro não remonta a página,
                  // e a lista já lida era a do setor anterior.
                  key={`${pessoa.id}:${setor ?? ""}`}
                  pessoa={{ id: pessoa.id, nome: pessoa.name, coordenacao: pessoa.role === "SECTOR_ADMIN", setores: setoresDe(pessoa) }}
                  carga={{ abertos: c.abertos, porOrigem: c.porOrigem, parados: c.parados, vencidos: c.vencidos, vencendo: c.vencendo }}
                  setor={setor}
                  carregar={itensDaPessoaNaGestao}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {semDono.length > 0 && (
        <section aria-labelledby="sem-dono" className="flex flex-col gap-2">
          <h2 id="sem-dono" className="text-section font-semibold text-fg">
            Sem responsável ({semDono.length})
          </h2>
          <p className="text-fs-2 text-fg-muted">
            Em aberto e sem ninguém designado. Os alertas destes vão para a coordenação do setor. Troque o responsável no painel ou nos alertas.
          </p>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface shadow-xs">
            {semDonoNaTela.map((x) => (
              <li key={`${x.item.origem}:${x.item.id}`} className="px-4 py-2 flex flex-col">
                <Link href={x.item.href} className="text-fs-3 text-fg hover:underline">
                  {x.item.titulo}
                </Link>
                <span className="flex flex-wrap items-center gap-1 text-fs-1 text-fg-muted">
                  {ORIGEM[x.item.origem]} · {g.rotuloDoSetor(x.item.setor)} <SelosDoItem c={x.c} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
