import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FiltroDeSetor } from "@/components/gestao/FiltroDeSetor";
import { ItemDaGestao } from "@/components/gestao/ItemDaGestao";
import { LimitesDoSetor } from "@/components/gestao/LimitesDoSetor";
import { getPrisma } from "@/lib/prisma";
import { canManageSector, isFullWrite } from "@/lib/auth/context";
import { contextoDaGestao, recorteComFiltro } from "@/lib/gestao/acesso";
import { itensDaGestao } from "@/lib/gestao/itens";
import { LIMITES_PADRAO, ordemDeAtencao, precisaDeAtencao } from "@/lib/gestao/regras";
import { nomesDasPessoas, pessoasPorSetor } from "@/lib/gestao/telas";
import { reatribuirItem, salvarLimites } from "../actions";

export const dynamic = "force-dynamic";

// Os alertas da Gestão: tudo o que está parado ou com prazo vencendo, e os
// limites de cada setor. Os avisos no sino saem do motor de alertas (uma vez
// por parada), com esta mesma regra.
export default async function AlertasDaGestaoPage({ searchParams }: { searchParams: Promise<{ setor?: string }> }) {
  const g = await contextoDaGestao();
  if (!g) notFound();
  const { ctx } = g;
  const { recorte, setor } = recorteComFiltro(g.recorte, g.setores, (await searchParams).setor);
  const itens = await itensDaGestao(ctx.tenantId, recorte);
  const atencao = itens.filter((x) => precisaDeAtencao(x.c)).sort(ordemDeAtencao);
  const [nomeDe, pessoas, configs] = await Promise.all([
    nomesDasPessoas(ctx.tenantId, atencao.flatMap((x) => x.item.responsaveis)),
    pessoasPorSetor(ctx, atencao),
    getPrisma().sector.findMany({
      where: { tenantId: ctx.tenantId, code: { in: g.setores.map((s) => s.value) } },
      select: { code: true, alertStalledDays: true, alertDueSoonDays: true },
    }),
  ]);
  const configDe = new Map(configs.map((c) => [c.code, c]));
  const setoresDaTabela = setor ? g.setores.filter((s) => s.value === setor) : g.setores;

  return (
    <div className="flex flex-col gap-6">
      <FiltroDeSetor base="/gestao/alertas" setores={g.setores} ativo={setor} />

      <section aria-labelledby="lista" className="flex flex-col gap-2">
        <h2 id="lista" className="text-[14px] font-semibold text-fg">
          Parados e com prazo ({atencao.length})
        </h2>
        {atencao.length === 0 ? (
          <Card>
            <EmptyState title="Nenhum alerta" description="Nada passou do limite de parado nem está com prazo vencendo." />
          </Card>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
            {atencao.map((x) => (
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

      <section aria-labelledby="limites" className="flex flex-col gap-2">
        <div>
          <h2 id="limites" className="text-[14px] font-semibold text-fg">
            Limites por setor
          </h2>
          <p className="text-[12px] text-fg-muted">
            Depois de quantos dias sem movimentação um item conta como parado, e com quantos dias de antecedência o prazo avisa. Vazio usa o
            padrão ({LIMITES_PADRAO.diasParado} e {LIMITES_PADRAO.diasAvisoPrazo} dias). Processo esperando o órgão só conta como parado depois de 30
            dias; card que ainda não começou só avisa pelo prazo.
          </p>
        </div>
        <Card className="p-4 overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr className="text-left text-[12px] text-fg-muted">
                <th className="pb-2 pr-3 font-medium">Setor</th>
                <th className="pb-2 pr-3 font-medium">Dias para parado</th>
                <th className="pb-2 pr-3 font-medium">Aviso de prazo (dias)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {setoresDaTabela.map((s) => {
                const c = configDe.get(s.value);
                return (
                  <LimitesDoSetor
                    key={s.value}
                    setor={s.value}
                    rotulo={s.label}
                    diasParado={c?.alertStalledDays ?? null}
                    diasAvisoPrazo={c?.alertDueSoonDays ?? null}
                    padrao={LIMITES_PADRAO}
                    podeEditar={isFullWrite(ctx.role) || canManageSector(ctx, s.value)}
                    salvar={salvarLimites}
                  />
                );
              })}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}
