import { notFound } from "next/navigation";
import { presaAoOmie } from "@/lib/integracoes/omie/virada";
import { rotuloDaSerie, temProximasNaSerie } from "@/lib/financeiro/repeticao";
import { FileSpreadsheet, NotebookPen, Plus, Upload } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canViewSector, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { saoPauloParts } from "@/lib/agenda";
import { formatInstantDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { Badge, type VarianteDoBadge } from "@/components/ui/Badge";
import { Selo, tomDaVariante } from "@/components/ui/Selo";
import { TOM_DA_SITUACAO, tomDoFechamento } from "@/components/financeiro/tomDaSituacao";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { FiltroDaColunaNaUrl, FiltrosDasColunasNaUrl } from "@/components/shared/FiltroDeColunas";
import { Pagination } from "@/components/shared/Pagination";
import { FiltroDePeriodo } from "@/components/financeiro/FiltroDePeriodo";
import { FiltroDaEmpresa, EscolhaAEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import { EmpresaDaTela } from "@/components/empresas/EmpresaDaTela";
import { escolherEmpresaDaTela } from "@/lib/empresas/ultimaEmpresa";
import { FormLancamentoManual } from "@/components/financeiro/FormLancamentoManual";
import { ImportarLancamentosCsv } from "@/components/financeiro/ImportarLancamentosCsv";
import { CancelarLancamento } from "@/components/financeiro/CancelarLancamento";
import { BotaoEditarLancamento } from "@/components/financeiro/EditarLancamento";
import { BotaoMudarSerie } from "@/components/financeiro/MudarSerie";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { competenciaValida, competenciaDoInstante } from "@/lib/financeiro/periodo";
import { podeCancelarManual } from "@/lib/financeiro/manual";
import { moeda } from "@/lib/financeiro/formato";
import { centrosAtivosDaEmpresa } from "@/lib/financeiro/centroDeCustoServidor";
import { projetosAtivosDaEmpresa } from "@/lib/financeiro/projetoServidor";
import { contasBancariasDaEmpresa } from "@/lib/financeiro/contaPrevistaServidor";
import { ondeDaEmpresa } from "@/lib/financeiro/planoDeContas";
import { estadoDosAgentes } from "@/lib/ia/data";
import { AGENTE_DO_BOLETO } from "@/lib/financeiro/leituraDoBoleto";
import { paginaDaUrl } from "@/lib/financeiro/paginaDeContas";
import {
  funisDoLancamentoNaConsulta,
  funisDosLancamentosDaUrl,
  temFunilNoLancamento,
  type ChaveDoFunilDoLancamento,
  type FunisDosLancamentos,
} from "@/lib/financeiro/paginaDeLancamentos";
import { opcoesDosFunisDosLancamentos, paginaDeLancamentos } from "@/lib/financeiro/paginaDeLancamentosServidor";

export const dynamic = "force-dynamic";

const MODULE = "bpo_lancamentos";
// Setor que opera o módulo neste tenant (ver `setorDoModulo`); o do catálogo
// é só o padrão.
const SECTOR = getModuleDef(MODULE)!.sectorCode;

/** Os funis das colunas, na ordem do cabeçalho — a faixa "Filtro nas colunas" os nomeia assim. */
const COLUNAS_COM_FUNIL = [
  { chave: "tipo", rotulo: "Tipo" },
  { chave: "contraparte", rotulo: "Contraparte" },
  { chave: "categoria", rotulo: "Categoria" },
  { chave: "centro", rotulo: "Centro de custo" },
  { chave: "vencimento", rotulo: "Vencimento" },
  { chave: "situacao", rotulo: "Situação" },
] satisfies { chave: ChaveDoFunilDoLancamento; rotulo: string }[];

/**
 * As três telas da rota, pelo `?aba=`: a lista, o lançamento à mão e a
 * importação. Até 08/10/2026 eram três abas ("Lançados à mão", "Novo
 * lançamento", "Importar CSV"); pela escolha 5A do Kauan, criar mora no
 * cabeçalho — "+ Novo lançamento" e "Importar CSV" abrem a tela própria de
 * cada um, com a trilha de volta para a lista.
 */
const TELAS = [
  { chave: "lista", titulo: "Lançamentos" },
  { chave: "novo", titulo: "Novo lançamento" },
  { chave: "importar", titulo: "Importar lançamentos" },
] as const;

// As cores do mapa único do BPO (08/10/2026): o cancelado era `danger`, a
// mesma cor de "Vencida" — e é histórico, não pede ação.
const STATUS: Record<string, { rotulo: string; variante: VarianteDoBadge }> = {
  PROVISORIO: { rotulo: "A conferir", variante: TOM_DA_SITUACAO.A_CONFERIR },
  CONFERIDO: { rotulo: "Em aberto", variante: TOM_DA_SITUACAO.EM_ABERTO },
  PAGO: { rotulo: "Pago", variante: TOM_DA_SITUACAO.PAGA },
  CANCELADO: { rotulo: "Cancelado", variante: TOM_DA_SITUACAO.CANCELADA },
};

/**
 * Lançamentos que não nascem de nota: aluguel, folha, pró-labore, tarifa,
 * contrato sem nota. A outra porta de entrada do financeiro.
 *
 * A lista mostra só o que entrou por aqui (`fiscalDocumentId` nulo). O que veio
 * de nota continua em `/pagar` e `/receber`, que são as donas das contas —
 * inclusive destes, que aparecem lá também.
 */
export default async function LancamentosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canViewSector(ctx, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  // Os funis das colunas vêm repetidos na URL (`?tipo=PAGAR&tipo=RECEBER`);
  // os outros parâmetros são de um valor só.
  const brutos = await searchParams;
  const params = Object.fromEntries(Object.entries(brutos).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])) as Record<string, string | undefined>;
  const podeLancar = canActOnSector(ctx, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR);
  // Sem permissão para lançar, a tela de criar não existe: cai na lista.
  const pedida = TELAS.find((t) => t.chave === params.aba) ?? TELAS[0];
  const tela = pedida.chave === "lista" || podeLancar ? pedida : TELAS[0];
  const aba = tela.chave;
  const agora = new Date();
  const hojeKey = saoPauloParts(agora).dateKey;
  const mes = competenciaValida(params.mes) ?? competenciaDoInstante(agora);

  // A empresa da URL, a última aberta pela pessoa — ou nenhuma, e a tela pede.
  // Até 13/10/2026 caía na primeira em ordem alfabética, e quem lançava sem
  // olhar o seletor gravava na empresa errada.
  const empresas = await empresasDoSeletor(ctx.tenantId);
  // Com uma empresa em foco (21/10/2026), só ela, a matriz e as filiais.
  const { escolha, empresa, foco } = await escolherEmpresaDaTela(ctx, params.empresa, empresas, { comFoco: true });
  const companyId = empresa?.id ?? null;

  const cabecalho = (action?: React.ReactNode) => (
    <PageHeader
      title="Lançamentos"
      action={action}
    />
  );

  // A empresa primeiro, na fileira de cima; o mês, na lista, ao lado dela.
  const filtroDaEmpresa = (
    <FiltroDaEmpresa foco={foco}>
      {aba === "lista" && companyId && (
        <FiltroDePeriodo acao="/lancamentos" mes={mes} extras={{ empresa: companyId }} naFileira />
      )}
    </FiltroDaEmpresa>
  );

  if (!empresa || !companyId) {
    return (
      <PageContainer>
        {cabecalho()}
        {empresas.length === 0 ? (
          <EmptyState title="Nenhuma empresa ativa" icon={<NotebookPen />} />
        ) : (
          <>
            {filtroDaEmpresa}
            <EscolhaAEmpresa escolha={escolha} porQue="Os lançamentos são de uma empresa por vez." />
          </>
        )}
      </PageContainer>
    );
  }

  // Todo formulário desta tela grava na empresa escolhida — o rodapé diz qual.
  const comEmpresa = (tela: React.ReactNode) => (
    <EmpresaDaTela empresa={{ nome: empresa.nome, cnpj: empresa.cnpj }}>{tela}</EmpresaDaTela>
  );

  const href = (chave: string) => `/lancamentos?empresa=${companyId}&mes=${mes}${chave === "lista" ? "" : `&aba=${chave}`}`;

  return comEmpresa(
    <PageContainer>
      {aba === "lista" ? (
        cabecalho(
          podeLancar ? (
            <div className="flex flex-wrap items-center gap-2">
              {/* A planilha das baixas do mês para o Contábil (fila do BPO, 21/10). */}
              <Button href={`/lancamentos/dominio?empresa=${companyId}&mes=${mes}`} variant="secondary">
                <FileSpreadsheet size={14} /> Exportar
              </Button>
              <Button href={href("importar")} variant="secondary">
                <Upload size={14} /> Importar CSV
              </Button>
              <Button href={href("novo")}>
                <Plus size={14} /> Novo lançamento
              </Button>
            </div>
          ) : undefined
        )
      ) : (
        <>
          <Breadcrumb items={[{ label: "Lançamentos", href: href("lista") }, { label: tela.titulo }]} />
          <PageHeader title={tela.titulo} />
        </>
      )}
      {aba === "novo" ? (
        // A empresa num selo (Lançamentos B, página de opções de 04/11/2026): a
        // barra de troca de empresa repetia a da lista. Trocar volta à lista,
        // que tem o seletor — e o formulário ainda vazio não perde nada.
        <p className="mb-4 flex flex-wrap items-center gap-2">
          <Selo tom="marca">Lançando em: {empresa.nome}</Selo>
          <Button href={href("lista")} variant="ghost" size="xs">
            Trocar a empresa
          </Button>
        </p>
      ) : (
        filtroDaEmpresa
      )}

      {aba === "novo" && <FormularioDaEmpresa companyId={companyId} tenantId={ctx.tenantId} hojeKey={hojeKey} mes={mes} />}

      {aba === "importar" && <ImportarLancamentosCsv companyId={companyId} />}

      {aba === "lista" && (
        <ListaDeManuais
          tenantId={ctx.tenantId}
          companyId={companyId}
          mes={mes}
          podeCancelar={podeLancar}
          funis={funisDosLancamentosDaUrl(brutos)}
          pedida={paginaDaUrl(brutos.pagina)}
        />
      )}
    </PageContainer>
  );
}

async function FormularioDaEmpresa({
  companyId,
  tenantId,
  hojeKey,
  mes,
}: {
  companyId: string;
  tenantId: string;
  hojeKey: string;
  mes: string;
}) {
  const prisma = getPrisma();
  const [contrapartes, categorias, centros, projetos, agentes, contasBancarias] = await Promise.all([
    prisma.financeCounterparty.findMany({
      where: { tenantId, companyId, active: true },
      select: { id: true, name: true, document: true, defaultCategoryId: true, defaultCostCenterId: true },
      orderBy: { name: "asc" },
    }),
    prisma.financeCategory.findMany({
      where: ondeDaEmpresa(tenantId, companyId),
      select: { id: true, name: true, kind: true },
      orderBy: { name: "asc" },
    }),
    centrosAtivosDaEmpresa(tenantId, companyId),
    projetosAtivosDaEmpresa(tenantId, companyId),
    estadoDosAgentes(tenantId, [AGENTE_DO_BOLETO]),
    // Com os cartões de crédito: o formulário só os mostra na conta a pagar.
    contasBancariasDaEmpresa(tenantId, companyId, null, { comCartoes: true }),
  ]);
  // A leitura de boleto (lote H2) nasce desligada: aparece só ligada e com chave de IA.
  const leitor = agentes.get(AGENTE_DO_BOLETO);
  return (
    <FormLancamentoManual
      companyId={companyId}
      hojeISO={hojeKey}
      competenciaPadrao={mes}
      leitorDeBoleto={!!leitor && leitor.ligado && leitor.temChave}
      contrapartes={contrapartes.map((c) => ({
        id: c.id,
        nome: c.name,
        documento: c.document,
        defaultCategoryId: c.defaultCategoryId,
        defaultCostCenterId: c.defaultCostCenterId,
      }))}
      centros={centros}
      projetos={projetos}
      contasBancarias={contasBancarias}
      categorias={categorias.map((c) => ({ id: c.id, nome: c.name, kind: c.kind }))}
    />
  );
}

/**
 * A lista paginada no servidor (27/11/2026, melhoria-571): a página aberta, e
 * a contagem e os totais da barra do filtro inteiro. Era até 500 de uma vez,
 * com o aviso "Mostrando os 500 primeiros". Os funis das colunas filtram pela
 * URL — ver `paginaDeLancamentos.ts`.
 */
async function ListaDeManuais({
  tenantId,
  companyId,
  mes,
  podeCancelar,
  funis,
  pedida,
}: {
  tenantId: string;
  companyId: string;
  mes: string;
  podeCancelar: boolean;
  funis: FunisDosLancamentos;
  pedida: number;
}) {
  const recorte = { tenantId, companyId, mes, funis };
  const [{ linhas, total, pagina, totalDePaginas, aPagarCentavos, aReceberCentavos }, opcoes] = await Promise.all([
    paginaDeLancamentos(recorte, pedida),
    opcoesDosFunisDosLancamentos(recorte),
  ]);
  const filtrando = temFunilNoLancamento(funis);

  // A página conserva a empresa, o mês e os funis.
  const hrefDaPagina = (p: number) => {
    const q = new URLSearchParams({ empresa: companyId, mes });
    funisDoLancamentoNaConsulta(funis, q);
    if (p > 1) q.set("pagina", String(p));
    return `/lancamentos?${q}`;
  };

  // Renegociado e perda são cancelamentos com nome: a dívida seguiu num acordo,
  // ou alguém decidiu dar por perdida — "cancelado" diria outra coisa.
  const statusDe = (l: (typeof linhas)[number]) =>
    l.closeReason === "RENEGOCIADO" || l.closeReason === "PERDA"
      ? { rotulo: l.closeReason === "PERDA" ? "Perda" : "Renegociado", variante: tomDoFechamento(l.closeReason) }
      : STATUS[l.status]!;
  // "Daqui em diante" (22/10/2026) na conta em aberto que tem próximas na
  // série; a do Omie antes da virada é dele, e a janela diria só isso.
  const mudaASerie = (l: (typeof linhas)[number]) =>
    temProximasNaSerie(l) && (l.status === "PROVISORIO" || l.status === "CONFERIDO") && !l.paidAt && !presaAoOmie(l, l.company);

  // O total da barra por lado, sem os cancelados: somar a pagar com a receber
  // não diz nada, e o cancelado já saiu dos totais (ver a nota de rodapé).
  // Do filtro inteiro, no banco — não só da página.

  // No casco das listas irmãs (contas, pendências, cobrança), com a contagem
  // e o total na barra — e o vazio dentro dele (08/10/2026). Era a tabela
  // solta, sem contagem, e o vazio flutuando no fundo da tela. "Situação" e
  // "pago em", como em contas a pagar e a receber (era "Status" e
  // "liquidado em").
  return (
    <>
      <CascoDaTabela
        contagem={contarItens(total, "lançamento", "lançamentos")}
        total={total > 0 ? `a pagar ${moeda(aPagarCentavos)} · a receber ${moeda(aReceberCentavos)}` : undefined}
      >
        {/* Acima da tabela e do vazio: quando o funil esvazia a lista, é daqui que se desfaz. */}
        {filtrando && <FiltrosDasColunasNaUrl colunas={COLUNAS_COM_FUNIL} />}
        {linhas.length === 0 ? (
          filtrando ? (
            <EmptyState title="Nenhum lançamento neste filtro" description="Tire um filtro das colunas para ver os outros." icon={<NotebookPen />} />
          ) : (
            <EmptyState
              title="Nenhum lançamento manual nesta competência"
              description="Use “Novo lançamento”, no topo da tela, para registrar uma conta sem nota, ou importe uma planilha."
              icon={<NotebookPen />}
            />
          )
        ) : (
          <>
            <CartoesNoCelular>
              {linhas.map((l) => {
                const status = statusDe(l);
                return (
                  <Cartao key={l.id}>
                    <TopoDoCartao nome={l.counterparty.name} valor={moeda(centavosDeDecimal(l.amount))} />
                    {(rotuloDaSerie(l) || l.description) && (
                      <InfoDoCartao>{[rotuloDaSerie(l), l.description].filter(Boolean).join(" · ")}</InfoDoCartao>
                    )}
                    <InfoDoCartao className="mt-1 tabular-nums">
                      vence {formatInstantDate(l.dueDate)}
                      {l.paidAt && ` · pago em ${formatInstantDate(l.paidAt)}`}
                    </InfoDoCartao>
                    <InfoDoCartao>
                      {l.category?.name ?? "sem categoria"}
                      {l.costCenter?.name ? ` · ${l.costCenter.name}` : ""}
                      {l.project?.name ? ` · projeto ${l.project.name}` : ""}
                    </InfoDoCartao>
                    <PeDoCartao>
                      {/* Tipo é categoria: Badge neutro, sem vermelho/verde (D1, 15/10/2026). */}
                      <Badge variant="neutral">{l.kind === "PAGAR" ? "A pagar" : "A receber"}</Badge>
                      <Selo tom={tomDaVariante(status.variante)}>{status.rotulo}</Selo>
                      {podeCancelar && (
                        <span className="ml-auto flex gap-1.5">
                          {l.status !== "CANCELADO" && <BotaoEditarLancamento entryId={l.id} />}
                          {/* Mudar a série daqui em diante (22/10/2026): o aluguel reajustado. */}
                          {mudaASerie(l) && <BotaoMudarSerie entryId={l.id} />}
                          {podeCancelarManual({ ...l, presoAoOmie: presaAoOmie(l, l.company) }).pode && (
                            <CancelarLancamento entryId={l.id} naSerie={temProximasNaSerie(l)} />
                          )}
                        </span>
                      )}
                    </PeDoCartao>
                  </Cartao>
                );
              })}
            </CartoesNoCelular>

              <TabelaNoDesktop padrao>
                <table className="w-full min-w-[880px]">
                  <thead>
                    <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border">
                      <th className="py-2 pr-3 font-medium"><FiltroDaColunaNaUrl rotulo="Tipo" chave="tipo" opcoes={opcoes.tipo} /></th>
                      <th className="py-2 pr-3 font-medium"><FiltroDaColunaNaUrl rotulo="Contraparte" chave="contraparte" opcoes={opcoes.contraparte} /></th>
                      <th className="py-2 pr-3 font-medium"><FiltroDaColunaNaUrl rotulo="Categoria" chave="categoria" opcoes={opcoes.categoria} /></th>
                      <th className="py-2 pr-3 font-medium"><FiltroDaColunaNaUrl rotulo="Centro de custo" chave="centro" opcoes={opcoes.centro} /></th>
                      <th className="py-2 pr-3 font-medium"><FiltroDaColunaNaUrl rotulo="Vencimento" chave="vencimento" opcoes={opcoes.vencimento} /></th>
                      <th className="py-2 pr-3 font-medium">Valor</th>
                      <th className="py-2 pr-3 font-medium"><FiltroDaColunaNaUrl rotulo="Situação" chave="situacao" opcoes={opcoes.situacao} align="right" /></th>
                      <th className="py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l) => {
                      const status = statusDe(l);
                      return (
                        <tr key={l.id} className="border-b border-border-soft hover:bg-surface-hover transition-colors">
                          {/* Tipo é categoria: Badge neutro, sem cor de alerta em toda linha (D1, 15/10/2026). */}
                          <td className="py-2.5 pr-3">
                            <Badge variant="neutral">{l.kind === "PAGAR" ? "A pagar" : "A receber"}</Badge>
                          </td>
                          <td className="py-2.5 pr-3">
                            <span className="font-medium">{l.counterparty.name}</span>
                            {(rotuloDaSerie(l) || l.documentNumber || l.description) && (
                              <span className="block text-micro text-fg-muted truncate max-w-[260px]">
                                {[rotuloDaSerie(l), l.documentNumber && `nº ${l.documentNumber}`, l.description].filter(Boolean).join(" · ")}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 pr-3 text-fg-secondary">{l.category?.name ?? "—"}</td>
                          <td className="py-2.5 pr-3 text-fg-secondary">
                            {l.costCenter?.name ?? "—"}
                            {l.project?.name && <span className="block text-micro text-fg-muted">projeto {l.project.name}</span>}
                          </td>
                          <td className="py-2.5 pr-3 tabular-nums whitespace-nowrap">
                            {formatInstantDate(l.dueDate)}
                            {l.paidAt && <span className="block text-micro text-fg-muted">pago em {formatInstantDate(l.paidAt)}</span>}
                          </td>
                          <td className="py-2.5 pr-3 text-right tabular-nums font-medium">{moeda(centavosDeDecimal(l.amount))}</td>
                          <td className="py-2.5 pr-3">
                            <Selo tom={tomDaVariante(status.variante)}>{status.rotulo}</Selo>
                          </td>
                          <td className="py-2.5">
                            {podeCancelar && (
                              <div className="flex flex-wrap justify-end gap-1.5">
                                {l.status !== "CANCELADO" && <BotaoEditarLancamento entryId={l.id} />}
                                {/* Mudar a série daqui em diante (22/10/2026): o aluguel reajustado.
                                    Uma vez só — saía duas vezes por linha (lote A de 03/11/2026). */}
                                {mudaASerie(l) && <BotaoMudarSerie entryId={l.id} />}
                                {podeCancelarManual({ ...l, presoAoOmie: presaAoOmie(l, l.company) }).pode && (
                                  <CancelarLancamento entryId={l.id} naSerie={temProximasNaSerie(l)} />
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TabelaNoDesktop>
          </>
        )}
      </CascoDaTabela>
      {/* Fora do casco, como nas outras listas paginadas (Contas a pagar e a receber). */}
      <Pagination page={pagina} totalPages={totalDePaginas} total={total} rotulo="lançamentos" buildHref={hrefDaPagina} />
    </>
  );
}
