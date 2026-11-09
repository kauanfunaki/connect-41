import Link from "next/link";
import { ChartColumn, PackageCheck } from "lucide-react";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { CartoesNoCelular, Cartao, InfoDoCartao, TabelaNoDesktop, TopoDoCartao } from "@/components/shared/ListaResponsiva";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { EmptyState } from "@/components/ui/EmptyState";
import { entregasDoPeriodo, PERIODOS_DAS_ENTREGAS, type ItemEntregue } from "@/lib/tech-interno/entregas";
import { lerPeriodo } from "@/lib/tech-interno/produtividade";
import { LINK_DO_ITEM, PESO_DO_TAMANHO, ROTA_TECH_INTERNO, TAMANHOS } from "@/lib/tech-interno/regras";
import { GITHUB_MODULE } from "@/lib/github/types";
import { ROTA_PRODUTIVIDADE } from "@/lib/tech-interno/rotasDaProdutividade";
import { formatarNumero, formatInstantDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const tamanho = (e: ItemEntregue) => (e.size ? `${TAMANHOS[e.size]} (${e.size})` : "Sem tamanho");
const pontos = (e: ItemEntregue) => (e.validado ? (e.size ? `${e.pontos}` : "0") : "—");
const ciclo = (e: ItemEntregue) => (e.cicloDias === null ? "—" : `${formatarNumero(e.cicloDias, 1)} dias`);

function VeioDe({ e }: { e: ItemEntregue }) {
  if (!e.originItemId) return <span className="text-fg-muted">—</span>;
  return (
    <Link href={`${ROTA_TECH_INTERNO}/${e.originItemId}`} className="relative z-10 rounded-sm text-fg-secondary underline-offset-2 hover:text-brand hover:underline break-words">
      {e.originTitle ?? "Item de origem"}
    </Link>
  );
}

/**
 * Entregas da Tech (04/11/2026; lista desde 05/11/2026). O que foi entregue
 * no período, item a item, com o tamanho, os pontos e de onde veio. As
 * métricas por pessoa e do time foram para o Painel da Produtividade (opção A
 * da tela 7), que saiu em 09/11/2026: a Produtividade ficou com Pessoas e
 * GitHub, sem o período daqui.
 */
export default async function EntregasDaTechPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const { ctx } = await abrirTelaDoModulo("tech_entregas");
  const periodo = lerPeriodo((await searchParams).periodo);
  const [{ inicio, fim, entregues }, veProdutividade] = await Promise.all([entregasDoPeriodo(ctx.tenantId!, periodo), podeNoModulo(ctx, GITHUB_MODULE, "ver")]);
  const totalDePontos = entregues.reduce((s, e) => s + e.pontos, 0);

  return (
    <PageContainer>
      <PageHeader
        title="Entregas da Tech"
        subtitle={`O que foi concluído de ${formatInstantDate(inicio)} a ${formatInstantDate(fim)}: ${entregues.length} ${entregues.length === 1 ? "item" : "itens"}, ${formatarNumero(totalDePontos, 0)} pontos. Só a entrega validada soma: P = ${PESO_DO_TAMANHO.P}, M = ${PESO_DO_TAMANHO.M}, G = ${PESO_DO_TAMANHO.G}.`}
        action={
          <div className="flex flex-wrap gap-2">
            {veProdutividade && (
              <Button href={ROTA_PRODUTIVIDADE} variant="secondary">
                <ChartColumn size={14} aria-hidden />
                Produtividade
              </Button>
            )}
            <Button href={ROTA_TECH_INTERNO} variant="secondary">
              Controle interno
            </Button>
          </div>
        }
      />
      <div className="mb-5">
        <SegmentedControl
          label="Período"
          active={periodo}
          items={PERIODOS_DAS_ENTREGAS.map((p) => ({ key: p.chave, label: p.rotulo, href: p.chave === "trimestre" ? "?" : `?periodo=${p.chave}` }))}
        />
      </div>

      {entregues.length === 0 ? (
        <Card>
          <EmptyState icon={<PackageCheck />} title="Nenhuma entrega no período" description="Os itens concluídos no Controle interno aparecem aqui." />
        </Card>
      ) : (
        <>
          <CartoesNoCelular>
            {entregues.map((e) => (
              <Cartao key={e.id} className="relative">
                <TopoDoCartao
                  nome={
                    <Link href={`${ROTA_TECH_INTERNO}/${e.id}`} className={`text-fg hover:text-brand ${LINK_DO_ITEM}`}>
                      {e.title}
                    </Link>
                  }
                  valor={`${pontos(e)} pts`}
                />
                <InfoDoCartao>
                  {e.assigneeName} · {formatInstantDate(e.concluidoEm)} · {tamanho(e)}
                  {!e.validado && " · sem validação"}
                </InfoDoCartao>
                {e.originItemId && (
                  <InfoDoCartao>
                    Veio de <VeioDe e={e} />
                  </InfoDoCartao>
                )}
              </Cartao>
            ))}
          </CartoesNoCelular>
          <TabelaNoDesktop padrao>
            <table className="w-full min-w-[900px]">
              <caption className="sr-only">Itens entregues de {formatInstantDate(inicio)} a {formatInstantDate(fim)}</caption>
              <thead>
                <tr>
                  {["Item", "Pessoa", "Concluído em", "Tamanho", "Pontos", "Ciclo", "Voltas", "Veio de", "Retrabalho"].map((c) => (
                    <th key={c} scope="col" className="px-3 py-2">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entregues.map((e) => (
                  <tr key={e.id} className="relative border-b border-border-soft tabular-nums hover:bg-surface-hover">
                    <th scope="row" className="px-3 py-2 text-left font-medium">
                      <Link href={`${ROTA_TECH_INTERNO}/${e.id}`} className={`text-fg underline-offset-2 hover:text-brand hover:underline break-words ${LINK_DO_ITEM}`}>
                        {e.title}
                      </Link>
                    </th>
                    <td className="px-3 py-2">{e.assigneeName}</td>
                    <td className="px-3 py-2">{formatInstantDate(e.concluidoEm)}</td>
                    <td className={`px-3 py-2 ${e.size ? "" : "text-warning-fg"}`}>{tamanho(e)}</td>
                    <td className="px-3 py-2 font-semibold">
                      {pontos(e)}
                      {!e.validado && <span className="block text-micro font-normal text-fg-muted">sem validação</span>}
                    </td>
                    <td className="px-3 py-2">{ciclo(e)}</td>
                    <td className="px-3 py-2">{e.voltasDaValidacao}</td>
                    <td className="px-3 py-2 max-w-[16rem]">
                      <VeioDe e={e} />
                    </td>
                    <td className="px-3 py-2">{e.retrabalho > 0 ? `${e.retrabalho} ${e.retrabalho === 1 ? "item" : "itens"}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabelaNoDesktop>
        </>
      )}
      <p className="mt-4 text-micro text-fg-muted">
        Pontos só na entrega que passou por “Em validação” e tem tamanho. “Retrabalho” são os itens que dizem ter vindo desta entrega.
      </p>
    </PageContainer>
  );
}
