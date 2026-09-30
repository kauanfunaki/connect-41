import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { FiltroDeSetor } from "@/components/gestao/FiltroDeSetor";
import { SelosDoItem, ORIGEM } from "@/components/gestao/ItemDaGestao";
import { getPrisma } from "@/lib/prisma";
import { contextoDaGestao, recorteComFiltro } from "@/lib/gestao/acesso";
import { itensDaGestao } from "@/lib/gestao/itens";
import { cargaPorPessoa, ordemDeAtencao, type CargaDaPessoa } from "@/lib/gestao/regras";

export const dynamic = "force-dynamic";

// A carga de cada pessoa, em todos os setores que quem vê enxerga: processos,
// cards, pendências e transferências em aberto, o que está parado e o que
// está com prazo. Coordenador sem nada em aberto também aparece — é o que
// mostra quem tem espaço.
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

  const vazia = (userId: string): CargaDaPessoa => ({
    userId,
    abertos: 0,
    porOrigem: { PROCESSO: 0, CARD: 0, PENDENCIA: 0, TRANSFERENCIA: 0 },
    parados: 0,
    vencidos: 0,
    vencendo: 0,
    itens: [],
  });
  const linhas = pessoas
    .map((p) => ({ pessoa: p, carga: carga.get(p.id) ?? vazia(p.id) }))
    .sort((a, b) => b.carga.vencidos - a.carga.vencidos || b.carga.parados - a.carga.parados || b.carga.abertos - a.carga.abertos || a.pessoa.name.localeCompare(b.pessoa.name));

  const semDono = itens.filter((x) => x.c.coluna !== "CONCLUIDO" && x.item.responsaveis.length === 0).sort(ordemDeAtencao);
  const TD = "px-3 tabular-nums";
  const setoresDe = (p: (typeof pessoas)[number]) => p.sectors.map((s) => g.rotuloDoSetor(s.sectorCode)).join(", ");
  // A lista que abre embaixo do nome — alinhada à esquerda num bloco
  // centralizado: a célula é centralizada (`.c41-tabela`), a leitura não.
  const itensDa = (c: CargaDaPessoa) =>
    c.itens.length === 0 ? (
      <p className="mt-2 text-[12px] text-fg-muted">Nada em aberto.</p>
    ) : (
      <ul className="mt-2 mx-auto w-fit max-w-full flex flex-col gap-1.5 text-left">
        {c.itens.sort(ordemDeAtencao).map((x) => (
          <li key={`${x.item.origem}:${x.item.id}`} className="flex flex-col">
            <Link href={x.item.href} className="text-[12px] text-fg hover:underline">
              {x.item.titulo}
            </Link>
            <span className="flex flex-wrap items-center gap-1 text-[11px] text-fg-muted">
              {ORIGEM[x.item.origem]} · {g.rotuloDoSetor(x.item.setor)} <SelosDoItem c={x.c} />
            </span>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="flex flex-col gap-6">
      <FiltroDeSetor setores={g.setores} />

      {linhas.length === 0 ? (
        <Card>
          <EmptyState title="Ninguém com trabalho em aberto" description="Nenhuma pessoa responde por item em aberto nestes setores." />
        </Card>
      ) : (
        <>
          {/* No celular, um cartão por pessoa com a carga em uma linha — a
              tabela de nove colunas pedia rolagem lateral para chegar nos
              parados e vencidos, que são o motivo da visita. */}
          <CartoesNoCelular>
            {linhas.map(({ pessoa, carga: c }) => (
              <Cartao key={pessoa.id}>
                <TopoDoCartao nome={pessoa.name} valor={`${c.abertos} em aberto`} />
                <InfoDoCartao>{setoresDe(pessoa)}</InfoDoCartao>
                <PeDoCartao>
                  {pessoa.role === "SECTOR_ADMIN" && <Badge variant="info">Coordenação</Badge>}
                  <span className={`text-[11.5px] ${c.parados ? "text-warning font-medium" : "text-fg-muted"}`}>{c.parados} parados</span>
                  <span className={`text-[11.5px] ${c.vencidos ? "text-danger font-medium" : "text-fg-muted"}`}>{c.vencidos} vencidos</span>
                  <span className="text-[11.5px] text-fg-muted">{c.vencendo} vencendo</span>
                </PeDoCartao>
                {c.itens.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[12px] text-fg-secondary">Ver os itens</summary>
                    {itensDa(c)}
                  </details>
                )}
              </Cartao>
            ))}
          </CartoesNoCelular>

          {/* Casco padrão, centralizado (30/09). Sem funil: a pessoa é única
              por linha e o resto é número; o setor se escolhe no "Filtros". */}
          <TabelaNoDesktop padrao>
            <table className="w-full min-w-[760px] text-[length:var(--fs-ui)]">
              <thead>
                <tr className="border-b border-border text-[length:var(--fs-micro)] font-semibold uppercase tracking-wide text-fg-muted">
                  <th className="px-3">Pessoa</th>
                  <th className="px-3">Em aberto</th>
                  <th className="px-3">Processos</th>
                  <th className="px-3">Cards</th>
                  <th className="px-3">Pendências</th>
                  <th className="px-3">Transferências</th>
                  <th className="px-3">Parados</th>
                  <th className="px-3">Prazo vencido</th>
                  <th className="px-3">Vencendo</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ pessoa, carga: c }) => (
                  <tr key={pessoa.id} className="border-b border-border align-top">
                    <td className="px-3">
                      <details>
                        <summary className="cursor-pointer font-medium text-fg">
                          {pessoa.name}{" "}
                          {pessoa.role === "SECTOR_ADMIN" && (
                            <Badge variant="info" className="ml-1">
                              Coordenação
                            </Badge>
                          )}
                          <span className="block text-[11px] font-normal text-fg-muted">{setoresDe(pessoa)}</span>
                        </summary>
                        {itensDa(c)}
                      </details>
                    </td>
                    <td className={`${TD} font-semibold text-fg`}>{c.abertos}</td>
                    <td className={TD}>{c.porOrigem.PROCESSO}</td>
                    <td className={TD}>{c.porOrigem.CARD}</td>
                    <td className={TD}>{c.porOrigem.PENDENCIA}</td>
                    <td className={TD}>{c.porOrigem.TRANSFERENCIA}</td>
                    <td className={`${TD} ${c.parados ? "text-warning font-medium" : ""}`}>{c.parados}</td>
                    <td className={`${TD} ${c.vencidos ? "text-danger font-medium" : ""}`}>{c.vencidos}</td>
                    <td className={TD}>{c.vencendo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabelaNoDesktop>
        </>
      )}

      {semDono.length > 0 && (
        <section aria-labelledby="sem-dono" className="flex flex-col gap-2">
          <h2 id="sem-dono" className="text-[14px] font-semibold text-fg">
            Sem responsável ({semDono.length})
          </h2>
          <p className="text-[12px] text-fg-muted">
            Em aberto e sem ninguém designado. Os alertas destes vão para a coordenação do setor. Troque o responsável no painel ou nos alertas.
          </p>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
            {semDono.slice(0, 50).map((x) => (
              <li key={`${x.item.origem}:${x.item.id}`} className="px-4 py-2 flex flex-col">
                <Link href={x.item.href} className="text-[13px] text-fg hover:underline">
                  {x.item.titulo}
                </Link>
                <span className="flex flex-wrap items-center gap-1 text-[11px] text-fg-muted">
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
