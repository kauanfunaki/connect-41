import { notFound } from "next/navigation";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Badge } from "@/components/ui/Badge";
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
import { listarExigencias } from "@/lib/societario/painel-data";
import { AbasDePrazos } from "@/components/societario/AbasDePrazos";
import { ResolverExigencia } from "@/components/societario/ResolverExigencia";
import { resolverExigencia } from "@/app/(app)/processos/actions";

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


  return (
    <PageContainer>
      <PageHeader
        title="Exigências e prazos"
        subtitle="O que os órgãos devolveram, de todos os processos — com o prazo que deram para cumprir."
      />
      <AbasDePrazos ativa="exigencias" />

      {/* Situação e responsável no botão "Filtros" — eram pílulas e um
          formulário com "Filtrar" (conferência de 30/09). */}
      <FiltrosDaTela
        className="mb-4"
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

      {linhas.length === 0 ? (
        <EmptyState
          title={situacao === "abertas" ? "Nenhuma exigência aberta" : "Nenhuma exigência neste filtro"}
          description="Exigência nasce quando um protocolo volta do órgão — registrada no roteiro do processo."
          icon={<AlertTriangle />}
        />
      ) : (
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
        <div className="c41-tabela overflow-x-auto bg-surface border border-border rounded-lg">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
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
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {linhas.map((e) => {
                const faixa = e.dueAt && !e.resolvedAt ? faixaDoPrazo(e.dueAt, agora) : null;
                return (
                  <LinhaFiltravel key={e.id} id={e.id} className="border-b border-border-soft align-top">
                    <td className="py-2.5 pr-3 max-w-[320px]">
                      <span className={e.resolvedAt ? "text-fg-muted" : "text-fg"}>{e.descricao}</span>
                      <span className="block text-[11px] text-fg-muted">Aberta em {formatInstantDate(e.raisedAt)}</span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <Link href={`/processos/${e.processoId}`} className="text-brand hover:underline">
                        {e.tipoNome}
                        {e.tituloDoProcesso && ` — ${e.tituloDoProcesso}`}
                      </Link>
                      <Link
                        href={`/processos/empresas/${e.empresaId}`}
                        className="block text-[12px] text-fg-muted hover:underline"
                      >
                        {e.empresaNome}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      {e.orgaoNome}
                      {/* A tentativa diz se esta é a primeira exigência ou mais uma volta. */}
                      {e.tentativa > 1 && <span className="block text-[11px] text-danger">{e.tentativa}ª tentativa</span>}
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      {e.dueAt ? (
                        <>
                          <span className="tabular-nums">{formatInstantDate(e.dueAt)}</span>
                          {faixa && (
                            <span
                              className={`block text-[11px] ${
                                faixa === "vencido" || faixa === "hoje"
                                  ? "text-danger font-medium"
                                  : faixa === "semana"
                                    ? "text-warning"
                                    : "text-fg-muted"
                              }`}
                            >
                              {textoDoPrazo(e.dueAt, agora)}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-fg-muted">sem prazo</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      {e.resolvedAt ? (
                        <>
                          <Badge variant="success">Cumprida</Badge>
                          <span className="block mt-1 text-[11px] text-fg-muted">{formatInstantDate(e.resolvedAt)}</span>
                        </>
                      ) : (
                        <Badge variant="warning">Aberta</Badge>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap text-fg-secondary">
                      {e.responsavelNome ?? "sem responsável"}
                    </td>
                    <td className="py-2.5">
                      {podeAgir && !e.resolvedAt && e.processoAberto && (
                        <ResolverExigencia exigenciaId={e.id} resolver={resolverExigencia} />
                      )}
                    </td>
                  </LinhaFiltravel>
                );
              })}
            </tbody>
          </table>
        </div>
        </TabelaFiltravel>
      )}
    </PageContainer>
  );
}
