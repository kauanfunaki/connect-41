import { notFound } from "next/navigation";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Selo } from "@/components/ui/Selo";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { saoPauloParts } from "@/lib/agenda";
import { EmptyState } from "@/components/ui/EmptyState";
import { getAuthContext, canActOnSector, canViewSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { getSectorUsers } from "@/lib/sectorUsers";
import { formatInstantDate } from "@/lib/format";
import { faixaDoPrazo, textoDoPrazo, lerSituacaoDaExigencia, type SituacaoDaExigencia } from "@/lib/societario/prazos";
import { listarExigencias, type LinhaDeExigencia } from "@/lib/societario/painel-data";
import { AbasDePrazos } from "@/components/societario/AbasDePrazos";
import { ResolverExigencia } from "@/components/societario/ResolverExigencia";
import { resolverExigencia } from "@/app/(app)/processos/actions";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";

const MODULE = "societario_prazos";
// `SECTOR` é o setor de origem, usado só como padrão: acesso e equipe seguem o
// setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = getModuleDef(MODULE)!.sectorCode;

export const dynamic = "force-dynamic";

const RECORTES: { chave: SituacaoDaExigencia; rotulo: string }[] = [
  { chave: "abertas", rotulo: "Abertas" },
  { chave: "resolvidas", rotulo: "Cumpridas" },
  { chave: "todas", rotulo: "Todas" },
];

export default async function ExigenciasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canViewSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();
  // Ver é do setor; resolver é de quem age nele — o botão some para o resto.
  const podeAgir = canActOnSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR);

  const params = await searchParams;
  const situacao = lerSituacaoDaExigencia(params.situacao);
  const responsaveis = await getSectorUsers(ctx.tenantId, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR);
  const responsavelFiltro =
    params.responsavel === "nenhum" || responsaveis.some((r) => r.id === params.responsavel)
      ? params.responsavel
      : undefined;

  const agora = new Date();
  const linhas = await listarExigencias(ctx.tenantId, { situacao, responsavelId: responsavelFiltro });

  // As peças que a tabela e os cartões do celular dividem (07/10/2026: a fila
  // rolava de lado no celular, `min-w-[860px]`, e era a única do escopo, com a
  // de licenças, sem cartões).
  const prazoEmFaixa = (e: LinhaDeExigencia) => {
    const faixa = e.dueAt && !e.resolvedAt ? faixaDoPrazo(e.dueAt, agora) : null;
    if (!faixa || !e.dueAt) return null;
    const cor =
      faixa === "vencido" || faixa === "hoje" ? "text-danger font-medium" : faixa === "semana" ? "text-warning-fg" : "text-fg-muted";
    return <span className={`block text-[length:var(--fs-micro)] ${cor}`}>{textoDoPrazo(e.dueAt, agora)}</span>;
  };
  // Selo, e não Badge: é a situação da linha (regra de 02/10 no Selo).
  const seloDaSituacao = (e: LinhaDeExigencia) =>
    e.resolvedAt ? <Selo tom="sucesso">Cumprida</Selo> : <Selo tom="atencao">Aberta</Selo>;
  // O link da célula principal no desenho da fila de processos: negrito, cor
  // do texto e azul só no hover — era azul sublinhado, um dos quatro desenhos
  // do módulo.
  const linkDoProcesso = (e: LinhaDeExigencia) => (
    <Link href={`/processos/${e.processoId}`} className="font-semibold text-fg hover:text-brand transition-colors">
      {e.tipoNome}
      {e.tituloDoProcesso && ` — ${e.tituloDoProcesso}`}
    </Link>
  );
  // "Apresentação", o termo do roteiro e das taxas — aqui dizia "tentativa".
  // A apresentação diz se esta é a primeira exigência ou mais uma volta.
  const apresentacao = (e: LinhaDeExigencia) =>
    e.tentativa > 1 ? <span className="block text-[length:var(--fs-micro)] text-danger">{e.tentativa}ª apresentação</span> : null;
  const acao = (e: LinhaDeExigencia) =>
    podeAgir && !e.resolvedAt && e.processoAberto ? <ResolverExigencia exigenciaId={e.id} resolver={resolverExigencia} /> : null;

  return (
    <PageContainer>
      <PageHeader
        title="Exigências e prazos"
        subtitle="O que os órgãos devolveram, de todos os processos — com o prazo que deram para cumprir."
      />
      <AbasDePrazos ativa="exigencias" />

      {/* Situação e responsável no botão "Filtros" — eram pílulas e um
          formulário com "Filtrar" (conferência de 30/09). */}
      <CascoDaTabela
        contagem={contarItens(linhas.length, "exigência", "exigências")}
        filtros={
          <FiltrosDaTela
            naBarra
            campos={[
              {
                chave: "situacao",
                rotulo: "Situação",
                vazioLabel: "Abertas",
                opcoes: RECORTES.filter((r) => r.chave !== "abertas").map((r) => ({ value: r.chave, label: r.rotulo })),
              },
              {
                chave: "responsavel",
                rotulo: "Responsável",
                vazioLabel: "Todos",
                opcoes: [{ value: "nenhum", label: "Sem responsável" }, ...responsaveis.map((r) => ({ value: r.id, label: r.name }))],
              },
            ]}
          />
        }
      >
        {linhas.length === 0 ? (
          <EmptyState
            title={situacao === "abertas" ? "Nenhuma exigência aberta" : "Nenhuma exigência neste filtro"}
            description="Exigência nasce quando um protocolo volta do órgão — registrada no roteiro do processo."
            icon={<AlertTriangle />}
          />
        ) : (
          <>
          <CartoesNoCelular>
            {linhas.map((e) => (
              <Cartao key={e.id}>
                <TopoDoCartao
                  nome={
                    <Link href={`/processos/empresas/${e.empresaId}`} className="font-semibold text-fg hover:text-brand transition-colors">
                      {e.empresaNome}
                    </Link>
                  }
                  valor={e.dueAt ? formatInstantDate(e.dueAt) : <span className="font-normal text-fg-muted">sem prazo</span>}
                />
                {prazoEmFaixa(e) && <div className="text-right">{prazoEmFaixa(e)}</div>}
                <p className={`mt-1 text-[length:var(--fs-ui)] break-words ${e.resolvedAt ? "text-fg-muted" : "text-fg"}`}>{e.descricao}</p>
                <InfoDoCartao className="mt-1">
                  {linkDoProcesso(e)} · {e.orgaoNome}
                </InfoDoCartao>
                {apresentacao(e)}
                <PeDoCartao>
                  {seloDaSituacao(e)}
                  <span className="text-[length:var(--fs-micro)] text-fg-muted">{e.responsavelNome ?? "Sem responsável"}</span>
                  <div className="ml-auto">{acao(e)}</div>
                </PeDoCartao>
              </Cartao>
            ))}
          </CartoesNoCelular>
          <TabelaFiltravel
            linhas={linhas.map((e) => ({
              id: e.id,
              valores: {
                processo: e.tipoNome,
                empresa: e.empresaNome,
                orgao: e.orgaoNome,
                prazo: e.dueAt ? saoPauloParts(e.dueAt).dateKey : "",
                situacao: e.resolvedAt ? "Cumprida" : "Aberta",
                responsavel: e.responsavelNome ?? "",
              },
            }))}
          >
          <TabelaNoDesktop padrao>
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="text-[length:var(--fs-micro)] uppercase tracking-wide text-fg-muted border-b border-border">
                  <th className="py-2 pr-3 font-medium">Exigência</th>
                  <th className="py-2 pr-3 font-medium">
                    <FiltroDaColuna
                      rotulo="Processo"
                      campos={[
                        { chave: "processo", rotulo: "Tipo" },
                        { chave: "empresa", rotulo: "Empresa" },
                      ]}
                    />
                  </th>
                  <th className="py-2 pr-3 font-medium"><FiltroDaColuna rotulo="Órgão" chave="orgao" /></th>
                  <th className="py-2 pr-3 font-medium"><FiltroDaColuna rotulo="Prazo do órgão" chave="prazo" tipo="data" /></th>
                  <th className="py-2 pr-3 font-medium"><FiltroDaColuna rotulo="Situação" chave="situacao" /></th>
                  <th className="py-2 pr-3 font-medium"><FiltroDaColuna rotulo="Responsável" chave="responsavel" align="right" /></th>
                  <th className="py-2 font-medium">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((e) => (
                  <LinhaFiltravel key={e.id} id={e.id} className="border-b border-border-soft align-top">
                    <td className="py-2.5 pr-3 max-w-[320px]">
                      <span className={e.resolvedAt ? "text-fg-muted" : "text-fg"}>{e.descricao}</span>
                      <span className="block text-[length:var(--fs-micro)] text-fg-muted">Aberta em {formatInstantDate(e.raisedAt)}</span>
                    </td>
                    <td className="py-2.5 pr-3">
                      {linkDoProcesso(e)}
                      <Link
                        href={`/processos/empresas/${e.empresaId}`}
                        className="block text-[length:var(--fs-2)] text-fg-muted hover:underline"
                      >
                        {e.empresaNome}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      {e.orgaoNome}
                      {apresentacao(e)}
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      {e.dueAt ? (
                        <>
                          <span className="tabular-nums">{formatInstantDate(e.dueAt)}</span>
                          {prazoEmFaixa(e)}
                        </>
                      ) : (
                        <span className="text-fg-muted">sem prazo</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      {seloDaSituacao(e)}
                      {e.resolvedAt && (
                        <span className="block mt-1 text-[length:var(--fs-micro)] text-fg-muted">{formatInstantDate(e.resolvedAt)}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap text-fg-secondary">
                      {e.responsavelNome ?? <span className="text-fg-muted">Sem responsável</span>}
                    </td>
                    <td className="py-2.5">{acao(e)}</td>
                  </LinhaFiltravel>
                ))}
              </tbody>
            </table>
          </TabelaNoDesktop>
          </TabelaFiltravel>
          </>
        )}
      </CascoDaTabela>
    </PageContainer>
  );
}
