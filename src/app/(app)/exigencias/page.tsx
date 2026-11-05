import { notFound } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CalendarDays, PauseCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/shared/Pagination";
import { getPrisma } from "@/lib/prisma";
import { STATUS_SEM_CONCLUSAO } from "@/lib/societario/processo";
import { listarProtocolosParados, diasDaLista, type ProtocoloParadoNaTela } from "@/lib/societario/protocolosParadosServidor";
import { RegistrarCobranca } from "@/components/societario/RegistrarCobranca";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Selo } from "@/components/ui/Selo";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { saoPauloParts } from "@/lib/agenda";
import { EmptyState } from "@/components/ui/EmptyState";
import { getAuthContext, canActOnSector, canViewSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { getSectorUsers } from "@/lib/sectorUsers";
import { formatInstantDate } from "@/lib/format";
import { faixaDoPrazo, textoDoPrazo, lerSituacaoDaExigencia, type SituacaoDaExigencia } from "@/lib/societario/prazos";
import { listarExigencias, type LinhaDeExigencia } from "@/lib/societario/painel-data";
import { AbasDePrazos } from "@/components/societario/AbasDePrazos";
import { ResolverExigencia } from "@/components/societario/ResolverExigencia";
import { resolverExigencia } from "@/app/(app)/processos/actions";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { CobrancaDoProtocolo } from "@/components/societario/CobrancaDoProtocolo";
import { canManageSector } from "@/lib/auth/papeis";
import { COBRAR_APOS_DIAS_PADRAO } from "@/lib/societario/protocoloParado";
import { diasParaCobrarOProtocolo } from "@/lib/societario/protocoloParadoServidor";

const MODULE = "societario_prazos";
// `SECTOR` é o setor de origem, usado só como padrão: acesso e equipe seguem o
// setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = getModuleDef(MODULE)!.sectorCode;

export const dynamic = "force-dynamic";

/** Exigências por página (04/11/2026: a lista não tinha paginação). */
const POR_PAGINA = 25;

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
  if (!ctx.tenantId || !canViewSector(ctx, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();
  // Ver é do setor; resolver é de quem age nele — o botão some para o resto.
  const podeAgir = canActOnSector(ctx, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR);
  const setor = (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR;
  const podeConfigurar = canManageSector(ctx, setor);
  // O prazo vale para todos: é a régua da aba Protocolos parados.
  const diasDaCobranca = await diasParaCobrarOProtocolo(ctx.tenantId).catch(() => COBRAR_APOS_DIAS_PADRAO);

  const params = await searchParams;
  const aba = params.aba === "parados" ? "parados" : "exigencias";
  const pagina = Math.max(1, Math.min(1000, Number.parseInt(params.pagina ?? "1", 10) || 1));
  const situacao = lerSituacaoDaExigencia(params.situacao);
  const responsaveis = await getSectorUsers(ctx.tenantId, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR);
  const responsavelFiltro =
    params.responsavel === "nenhum" || responsaveis.some((r) => r.id === params.responsavel)
      ? params.responsavel
      : undefined;

  const agora = new Date();
  const [todas, parados, abertas] = await Promise.all([
    aba === "exigencias" ? listarExigencias(ctx.tenantId, { situacao, responsavelId: responsavelFiltro }) : Promise.resolve([]),
    listarProtocolosParados(ctx.tenantId, diasDaCobranca, agora),
    // O contador da aba: as abertas de todo o setor, com ou sem filtro na lista.
    getPrisma().processRequirement.count({
      where: { tenantId: ctx.tenantId, resolvedAt: null, protocol: { process: { tenantId: ctx.tenantId, status: { notIn: STATUS_SEM_CONCLUSAO } } } },
    }),
  ]);
  const totalDePaginas = Math.max(1, Math.ceil(todas.length / POR_PAGINA));
  const paginaVista = Math.min(pagina, totalDePaginas);
  const linhas = todas.slice((paginaVista - 1) * POR_PAGINA, paginaVista * POR_PAGINA);
  const hrefDaPagina = (p: number) => {
    const q = new URLSearchParams();
    for (const chave of ["situacao", "responsavel"] as const) if (params[chave]) q.set(chave, params[chave]!);
    if (p > 1) q.set("pagina", String(p));
    const t = q.toString();
    return t ? `/exigencias?${t}` : "/exigencias";
  };

  // As peças que a tabela e os cartões do celular dividem (07/10/2026: a fila
  // rolava de lado no celular, `min-w-[860px]`, e era a única do escopo, com a
  // de licenças, sem cartões).
  const prazoEmFaixa = (e: LinhaDeExigencia) => {
    const faixa = e.dueAt && !e.resolvedAt ? faixaDoPrazo(e.dueAt, agora) : null;
    if (!faixa || !e.dueAt) return null;
    const cor =
      faixa === "vencido" || faixa === "hoje" ? "text-danger font-medium" : faixa === "semana" ? "text-warning-fg" : "text-fg-muted";
    return <span className={`block text-micro ${cor}`}>{textoDoPrazo(e.dueAt, agora)}</span>;
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
    e.tentativa > 1 ? <span className="block text-micro text-danger">{e.tentativa}ª apresentação</span> : null;
  const acao = (e: LinhaDeExigencia) =>
    podeAgir && !e.resolvedAt && e.processoAberto ? <ResolverExigencia exigenciaId={e.id} resolver={resolverExigencia} /> : null;

  return (
    <PageContainer>
      <PageHeader
        title="Exigências e prazos"
        subtitle="O que os órgãos devolveram e os protocolos que estão parados no órgão."
        action={
          // A agenda própria do Societário saiu (04/11/2026): repetia a Agenda
          // geral, que já tem os prazos do setor. Abre filtrada nele.
          <Button href={`/agenda?view=semana&setor=${encodeURIComponent(Array.isArray(setor) ? setor[0] : setor)}`} variant="secondary">
            <CalendarDays size={14} aria-hidden /> Ver prazos na Agenda
          </Button>
        }
      />
      <AbasDePrazos ativa={aba} contagens={{ exigencias: abertas, parados: parados.length }} />

      {aba === "parados" ? (
        <ProtocolosParados
          parados={parados}
          prazo={diasDaLista(diasDaCobranca)}
          avisoDesligado={diasDaCobranca <= 0}
          podeAgir={podeAgir}
          seletor={podeConfigurar ? <CobrancaDoProtocolo dias={diasDaCobranca} padrao={COBRAR_APOS_DIAS_PADRAO} naLinha /> : null}
        />
      ) : (
      <>

      {/* Situação e responsável no botão "Filtros" — eram pílulas e um
          formulário com "Filtrar" (conferência de 30/09). */}
      <CascoDaTabela
        contagem={contarItens(todas.length, "exigência", "exigências")}
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
                <p className={`mt-1 text-ui break-words ${e.resolvedAt ? "text-fg-muted" : "text-fg"}`}>{e.descricao}</p>
                <InfoDoCartao className="mt-1">
                  {linkDoProcesso(e)} · {e.orgaoNome}
                </InfoDoCartao>
                {apresentacao(e)}
                <PeDoCartao>
                  {seloDaSituacao(e)}
                  <span className="text-micro text-fg-muted">{e.responsavelNome ?? "Sem responsável"}</span>
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
                <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border">
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
                      <span className="block text-micro text-fg-muted">Aberta em {formatInstantDate(e.raisedAt)}</span>
                    </td>
                    <td className="py-2.5 pr-3">
                      {linkDoProcesso(e)}
                      <Link
                        href={`/processos/empresas/${e.empresaId}`}
                        className="block text-fs-2 text-fg-muted hover:underline"
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
                        <span className="block mt-1 text-micro text-fg-muted">{formatInstantDate(e.resolvedAt)}</span>
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
      <Pagination page={paginaVista} totalPages={totalDePaginas} buildHref={hrefDaPagina} total={todas.length} rotulo="exigências" />
      </>
      )}
    </PageContainer>
  );
}

/**
 * A aba Protocolos parados (Exigências A, 04/11/2026): o que espera o órgão há
 * mais tempo que o prazo do aviso, com a última cobrança e o "Registrar
 * cobrança" por linha. O prazo do aviso fica no alto da aba — era um cartão
 * solto no pé das Exigências.
 */
function ProtocolosParados({
  parados,
  prazo,
  avisoDesligado,
  podeAgir,
  seletor,
}: {
  parados: ProtocoloParadoNaTela[];
  prazo: number;
  avisoDesligado: boolean;
  podeAgir: boolean;
  seletor: React.ReactNode;
}) {
  // Parado há o dobro do prazo: já passou por dois avisos sem resposta.
  const tomDoParado = (dias: number) => (dias >= prazo * 2 ? "perigo" : "atencao");
  const ultima = (p: ProtocoloParadoNaTela) =>
    p.ultimaCobranca ? (
      <>
        <span className="tabular-nums">{formatInstantDate(p.ultimaCobranca.quando)}</span>
        <span className="block text-micro text-fg-muted">{p.ultimaCobranca.quem}</span>
      </>
    ) : (
      <span className="text-fg-muted">Nunca</span>
    );
  const linkDoProcesso = (p: ProtocoloParadoNaTela) => (
    <Link href={`/processos/${p.processoId}`} className="font-semibold text-fg hover:text-brand transition-colors">
      {p.processo}
    </Link>
  );
  const orgao = (p: ProtocoloParadoNaTela) => (
    <>
      {p.orgao}
      <span className="block text-micro text-fg-muted tabular-nums">
        {[p.numero && `nº ${p.numero}`, p.tentativa > 1 && `${p.tentativa}ª apresentação`].filter(Boolean).join(" · ") || "sem número"}
      </span>
    </>
  );

  return (
    <CascoDaTabela
      contagem={contarItens(parados.length, "protocolo parado", "protocolos parados")}
      acoes={
        seletor ?? (
          <span className="text-ui text-fg-muted">
            {avisoDesligado ? `Aviso desligado · a lista usa ${prazo} dias` : `Avisa o responsável depois de ${prazo} dias sem resposta`}
          </span>
        )
      }
    >
      {parados.length === 0 ? (
        <EmptyState
          title="Nenhum protocolo parado"
          description={`Aparece aqui o protocolo que espera o órgão há ${prazo} dias ou mais, sem resposta.`}
          icon={<PauseCircle />}
        />
      ) : (
        <>
          <CartoesNoCelular>
            {parados.map((p) => (
              <Cartao key={p.id}>
                <TopoDoCartao nome={linkDoProcesso(p)} valor={<Selo tom={tomDoParado(p.diasParado)}>{p.diasParado} dias</Selo>} />
                <InfoDoCartao>{p.empresa}</InfoDoCartao>
                <InfoDoCartao className="mt-1">{orgao(p)}</InfoDoCartao>
                <PeDoCartao>
                  <span className="text-micro text-fg-muted">
                    Última cobrança:{" "}
                    {p.ultimaCobranca ? `${formatInstantDate(p.ultimaCobranca.quando)} · ${p.ultimaCobranca.quem}` : "nunca"}
                  </span>
                  {podeAgir && (
                    <div className="ml-auto">
                      <RegistrarCobranca protocoloId={p.id} />
                    </div>
                  )}
                </PeDoCartao>
              </Cartao>
            ))}
          </CartoesNoCelular>
          <TabelaNoDesktop padrao>
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border">
                  <th className="py-2 pr-3 font-medium">Processo</th>
                  <th className="py-2 pr-3 font-medium">Órgão</th>
                  <th className="py-2 pr-3 font-medium">Protocolado em</th>
                  <th className="py-2 pr-3 font-medium">Parado há</th>
                  <th className="py-2 pr-3 font-medium">Última cobrança</th>
                  <th className="py-2 pr-3 font-medium">Responsável</th>
                  <th className="py-2 font-medium">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {parados.map((p) => (
                  <tr key={p.id} className="border-b border-border-soft align-top">
                    <td className="py-2.5 pr-3">
                      {linkDoProcesso(p)}
                      <span className="block text-fs-2 text-fg-muted">{p.empresa}</span>
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">{orgao(p)}</td>
                    <td className="py-2.5 pr-3 whitespace-nowrap tabular-nums">{formatInstantDate(p.protocoladoEm)}</td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      <Selo tom={tomDoParado(p.diasParado)}>{p.diasParado} dias</Selo>
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">{ultima(p)}</td>
                    <td className="py-2.5 pr-3 whitespace-nowrap text-fg-secondary">
                      {p.responsavel ?? <span className="text-fg-muted">Sem responsável</span>}
                    </td>
                    <td className="py-2.5 text-right">{podeAgir && <RegistrarCobranca protocoloId={p.id} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabelaNoDesktop>
        </>
      )}
    </CascoDaTabela>
  );
}
