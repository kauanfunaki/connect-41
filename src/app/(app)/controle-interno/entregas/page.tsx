import Link from "next/link";
import { ChartColumn, PackageCheck } from "lucide-react";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { CartoesNoCelular, Cartao, InfoDoCartao, TabelaNoDesktop, TopoDoCartao } from "@/components/shared/ListaResponsiva";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { EmptyState } from "@/components/ui/EmptyState";
import { VisoesDoControle, AcoesDoControle, enderecoDaVisao } from "@/components/tech-interno/NavegacaoTech";
import { LembrarDaLista } from "@/components/tech-interno/VoltaDaLista";
import { entregasDoPeriodo, PERIODOS_DAS_ENTREGAS, type ItemEntregue } from "@/lib/tech-interno/entregas";
import { lerPeriodo } from "@/lib/tech-interno/produtividade";
import { LINK_DO_ITEM, MODULO_TECH_INTERNO, PESO_DO_TAMANHO, ROTA_TECH_INTERNO, TAMANHOS } from "@/lib/tech-interno/regras";
import { GITHUB_MODULE } from "@/lib/github/types";
import { ROTA_PRODUTIVIDADE } from "@/lib/tech-interno/rotasDaProdutividade";
import { formatarNumero, formatInstantDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const tamanho = (e: ItemEntregue) => (e.size ? `${TAMANHOS[e.size]} (${e.size})` : "Sem tamanho");
const pontos = (e: ItemEntregue) => (e.validado ? (e.size ? `${e.pontos}` : "0") : "—");
const ciclo = (e: ItemEntregue) => (e.cicloDias === null ? "—" : `${formatarNumero(e.cicloDias, 1)} dias`);

function VeioDe({ e }: { e: ItemEntregue }) {
  if (!e.originEndereco) return <span className="text-fg-muted">—</span>;
  return (
    <Link href={e.originEndereco} className="relative z-10 rounded-sm text-fg-secondary underline-offset-2 hover:text-brand hover:underline break-words">
      {e.originTitle ?? "Item de origem"}
    </Link>
  );
}

/**
 * Entregas, a quarta visão do Controle interno (16/11/2026, melhoria-706). O
 * que foi entregue no período, item a item, com o tamanho, os pontos e de onde
 * veio. Era a tela "Entregas da Tech" (04/11/2026; lista desde 05/11/2026), um
 * módulo à parte no menu do Tech — redundante com o Controle interno, de onde
 * os itens vêm. Agora tem o cabeçalho e as abas dele, abre para quem vê o
 * Controle interno (`tech_controle_interno`), e o período e os totais ficam na
 * barra da tabela. A regra dos pontos e a consulta são as mesmas.
 *
 * As métricas por pessoa e do time foram para o Painel da Produtividade (opção
 * A da tela 7), que saiu em 09/11/2026: a Produtividade ficou com Pessoas e
 * GitHub, sem o período daqui.
 */
export default async function EntregasDoControlePage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const { ctx } = await abrirTelaDoModulo(MODULO_TECH_INTERNO);
  const periodo = lerPeriodo((await searchParams).periodo);
  const [{ inicio, fim, entregues }, podeEditar, veProdutividade] = await Promise.all([
    entregasDoPeriodo(ctx.tenantId!, periodo),
    podeNoModulo(ctx, MODULO_TECH_INTERNO, "agir"),
    podeNoModulo(ctx, GITHUB_MODULE, "ver"),
  ]);
  const totalDePontos = entregues.reduce((s, e) => s + e.pontos, 0);
  const aqui = `${ROTA_TECH_INTERNO}/entregas`;
  const hrefDoPeriodo = (chave: string) => (chave === "trimestre" ? aqui : `${aqui}?periodo=${chave}`);
  const hrefVisao = (v: string) => enderecoDaVisao(v) ?? `${ROTA_TECH_INTERNO}?visao=${v}`;

  return (
    <PageContainer>
      {/* O item aberto daqui volta para as Entregas, no mesmo período. */}
      <LembrarDaLista endereco={hrefDoPeriodo(periodo)} />
      <PageHeader
        title="Controle interno"
        action={
          <AcoesDoControle
            podeEditar={podeEditar}
            novoHref={`${ROTA_TECH_INTERNO}/novo`}
            antes={
              veProdutividade && (
                <Button href={ROTA_PRODUTIVIDADE} variant="ghost">
                  <ChartColumn size={14} aria-hidden />
                  Produtividade
                </Button>
              )
            }
          />
        }
      />
      <VisoesDoControle ativa="entregas" href={hrefVisao} />
      <CascoDaTabela
        buscaAEsquerda
        filtros={
          <SegmentedControl
            label="Período"
            active={periodo}
            items={PERIODOS_DAS_ENTREGAS.map((p) => ({ key: p.chave, label: p.rotulo, href: hrefDoPeriodo(p.chave) }))}
          />
        }
        contagem={
          <span className="tabular-nums">
            {contarItens(entregues.length, "item", "itens")} · {formatarNumero(totalDePontos, 0)} {totalDePontos === 1 ? "ponto" : "pontos"}
          </span>
        }
      >
        {entregues.length === 0 ? (
          <EmptyState icon={<PackageCheck />} title="Nenhuma entrega no período" description="Os itens concluídos no Controle interno aparecem aqui." />
        ) : (
          <>
            <CartoesNoCelular>
              {entregues.map((e) => (
                <Cartao key={e.id} className="relative">
                  <TopoDoCartao
                    nome={
                      <Link href={e.endereco} className={`text-fg hover:text-brand ${LINK_DO_ITEM}`}>
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
                        <Link href={e.endereco} className={`text-fg underline-offset-2 hover:text-brand hover:underline break-words ${LINK_DO_ITEM}`}>
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
        {/* A única explicação da regra: os pesos, que estavam no subtítulo da tela antiga, vieram para cá. */}
        <p className="mt-3 text-micro text-fg-muted">
          Pontos só na entrega que passou por “Em validação” e tem tamanho: P = {PESO_DO_TAMANHO.P}, M = {PESO_DO_TAMANHO.M}, G = {PESO_DO_TAMANHO.G}. “Retrabalho” são os itens que dizem ter vindo desta entrega.
        </p>
      </CascoDaTabela>
    </PageContainer>
  );
}
