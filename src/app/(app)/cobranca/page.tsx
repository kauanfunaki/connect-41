import Link from "next/link";
import { notFound } from "next/navigation";
import { AlarmClock, Handshake, Mail, FileWarning, Wallet, PhoneOff, MailX, ListChecks, Settings2, ArrowRight } from "lucide-react";
import { getAuthContext, canViewSector, canActOnSector, canManageSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { getSectorUsers } from "@/lib/sectorUsers";
import { formatInstantDate, formatInstantDateTime, formatarCompetencia } from "@/lib/format";
import { saoPauloParts } from "@/lib/agenda";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Selo, tomDaVariante, type TomDoSelo } from "@/components/ui/Selo";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { TOM_DA_SITUACAO } from "@/components/financeiro/tomDaSituacao";
import { Button } from "@/components/ui/Button";
import { AbasDeLink, FaixaDeTotais } from "@/components/financeiro/FiltroDePeriodo";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { SeloDoAcordo } from "@/components/cobranca/SeloDaCobranca";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { DecisoesNoMenu } from "@/components/cobranca/AcaoComMotivo";
import { EmpresaNaRegua } from "@/components/cobranca/ConfigDaRegua";
import { RegistrarContatoNaLinha } from "@/components/cobranca/RegistrarContatoNaLinha";
import { LinhaDoAcordo } from "@/components/cobranca/LinhaDoAcordo";
import { ReguaEmTrilho } from "@/components/cobranca/ReguaEmTrilho";
import { GRUPOS_DA_FILA, grupoDaFila, andamentoDoAcordo, type GrupoDaFila, type AndamentoDoAcordo } from "@/lib/financeiro/cobranca/organizacao";
import { empresasDoSeletor, type EmpresaDoSeletor } from "@/lib/financeiro/consultas";
import { moeda } from "@/lib/financeiro/formato";
import { FAIXAS_DE_ATRASO, type ChaveDaFaixa } from "@/lib/financeiro/analise";
import {
  ROTULO_DA_SITUACAO,
  ROTULO_DO_ACORDO,
  type SituacaoDeCobranca,
  type StatusDoAcordo,
} from "@/lib/financeiro/cobranca/regras";
import { podeDesfazer, podeQuebrar } from "@/lib/financeiro/cobranca/acordo";
import {
  filaDeCobranca,
  listarAcordos,
  dadosDaAbaRegua,
  MODULO_DE_COBRANCA,
  type LinhaDeCobranca,
} from "@/lib/financeiro/cobranca/consultas";
import { quebrarAcordo, desfazerAcordo } from "./actions";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { FiltroDaEmpresa, EscolhaAEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import { escolherEmpresaDaTela } from "@/lib/empresas/ultimaEmpresa";
import { empresaNaUrl, type EscolhaDaEmpresa } from "@/lib/empresas/escolhaDaEmpresa";
import { escopoFinanceiroDaEscolha, type EscopoDaEscolha } from "@/lib/empresas/escopoDaEscolha";

export const dynamic = "force-dynamic";

const MODULE = MODULO_DE_COBRANCA;
const SECTOR = getModuleDef(MODULE)!.sectorCode;

const SITUACOES: SituacaoDeCobranca[] = ["VENCIDO_SEM_CONTATO", "EM_COBRANCA", "PROMETEU_PAGAR", "CONTESTADO", "EM_ACORDO", "PERDA"];
const FAIXAS = FAIXAS_DE_ATRASO.filter((f) => f.chave !== "a_vencer");
const STATUS_DE_ACORDO: StatusDoAcordo[] = ["ATIVO", "QUEBRADO", "CUMPRIDO", "DESFEITO"];

function dataDaChave(key: string): string {
  const [a, m, d] = key.split("-");
  return `${d}/${m}/${a}`;
}

/**
 * Cobrança: a fila de títulos a receber vencidos, os acordos e a régua.
 *
 * Filtros por GET, como o resto do financeiro — a URL da fila filtrada é o que
 * se manda para um colega ("os seus de 31 a 60 dias").
 */
export default async function CobrancaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) notFound();
  const setores = (await setoresDoModulo(ctx.tenantId, MODULE)) ?? [SECTOR];
  if (!canViewSector(ctx, setores) || !(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();
  const podeAgir = canActOnSector(ctx, setores);
  const gerencia = canManageSector(ctx, setores);

  const params = await searchParams;
  const aba = params.aba === "acordos" ? "acordos" : params.aba === "regua" ? "regua" : "fila";
  // A empresa da URL, a última aberta pela pessoa, ou nenhuma — e a fila e os
  // acordos pedem (13/10/2026). "Todas as empresas" fica como escolha
  // explícita (`?empresa=todas`): a fila para em 2.000 títulos e os acordos em
  // 500. A régua é do escritório e não depende da empresa.
  const empresas = await empresasDoSeletor(ctx.tenantId);
  // Com uma empresa em foco (21/10/2026), só a base dela; "Todas" é a base.
  const { escolha, noSeletor, foco, empresasDeTodas } = await escolherEmpresaDaTela(ctx, params.empresa, empresas, {
    permitirTodas: true,
    comFoco: true,
  });
  const escopo = escopoFinanceiroDaEscolha(ctx.tenantId, escolha, { permitirTodas: true, grupo: empresasDeTodas });
  const naUrl = empresaNaUrl(escolha);
  // Trocar de aba conserva a empresa — até 13/10/2026 as abas a perdiam.
  const daAba = (href: string) => (naUrl ? `${href}${href.includes("?") ? "&" : "?"}empresa=${encodeURIComponent(naUrl)}` : href);

  return (
    <PageContainer>
      <PageHeader
        title="Cobrança"
        subtitle="Contas a receber vencidas: quem cobrar hoje, o que foi combinado, acordos e a régua de lembretes por e-mail."
      />
      {aba !== "regua" && (
        <FiltroDaEmpresa foco={foco} />
      )}
      <div className="mt-4">
        <AbasDeLink
          abas={[
            { chave: "fila", rotulo: "Fila", href: daAba("/cobranca"), icone: <ListChecks /> },
            { chave: "acordos", rotulo: "Acordos", href: daAba("/cobranca?aba=acordos"), icone: <Handshake /> },
            { chave: "regua", rotulo: "Régua", href: daAba("/cobranca?aba=regua"), icone: <Settings2 /> },
          ]}
          ativa={aba}
        />
      </div>
      {aba !== "regua" && !escopo && (
        <EscolhaAEmpresa escolha={escolha} porQue="Para não carregar os títulos de todos os clientes de uma vez, a cobrança abre numa empresa." />
      )}
      {aba === "fila" && escopo && (
        <Fila tenantId={ctx.tenantId} userId={ctx.userId} setores={setores} escopo={escopo} escolha={escolha} params={params} podeAgir={podeAgir} />
      )}
      {aba === "acordos" && escopo && <Acordos escopo={escopo} status={params.status} podeAgir={podeAgir} />}
      {aba === "regua" && <Regua tenantId={ctx.tenantId} empresas={noSeletor} soDaBase={empresasDeTodas} gerencia={gerencia} filtroDosEnvios={params.envios} naUrl={naUrl ?? undefined} />}
    </PageContainer>
  );
}

// ─── Fila ───────────────────────────────────────────────────────────────────

async function Fila({
  tenantId,
  userId,
  setores,
  escopo,
  escolha,
  params,
  podeAgir,
}: {
  tenantId: string;
  userId: string;
  /** Os setores da cobrança (21/10/2026): o responsável pode ser de qualquer um. */
  setores: string[];
  /** Uma empresa, ou todas — só quando pedido (`?empresa=todas`). */
  escopo: EscopoDaEscolha;
  escolha: EscolhaDaEmpresa;
  params: Record<string, string | undefined>;
  podeAgir: boolean;
}) {
  const empresaId = escopo.companyIds?.[0] ?? null;
  const naUrl = empresaNaUrl(escolha);
  const faixa = FAIXAS.find((f) => f.chave === params.faixa)?.chave ?? null;
  const situacao = SITUACOES.find((s) => s === params.situacao) ?? null;
  const responsavelBruto = params.responsavel ?? "";
  const responsavel = responsavelBruto === "eu" ? userId : responsavelBruto || null;

  const [fila, usuarios] = await Promise.all([
    filaDeCobranca(tenantId, { empresaId, faixa: faixa as ChaveDaFaixa | null, situacao, responsavel }, new Date()),
    getSectorUsers(tenantId, setores),
  ]);
  const hojeKey = saoPauloParts(new Date()).dateKey;

  // Trocar o cartão de situação conserva empresa (inclusive "todas"), atraso e responsável.
  function hrefDaSituacao(valor: string) {
    const q = new URLSearchParams();
    if (naUrl) q.set("empresa", naUrl);
    if (faixa) q.set("faixa", faixa);
    if (responsavelBruto) q.set("responsavel", responsavelBruto);
    if (params.situacao !== valor) q.set("situacao", valor);
    const busca = q.toString();
    return busca ? `/cobranca?${busca}` : "/cobranca";
  }

  return (
    <>
      <FaixaDeTotais
        itens={[
          {
            rotulo: situacao === "PERDA" ? "Títulos perdidos" : "Títulos vencidos",
            valor: String(fila.totais.titulos),
            icone: <FileWarning />,
            href: hrefDaSituacao(situacao === "PERDA" ? "PERDA" : "VENCIDOS"),
            ativo: params.situacao === "VENCIDOS" || situacao === "PERDA",
          },
          {
            rotulo: "Valor",
            valor: moeda(fila.totais.centavos),
            tom: fila.totais.centavos > 0 && situacao !== "PERDA" ? "text-danger" : "",
            icone: <Wallet />,
          },
          {
            rotulo: "Sem contato",
            valor: String(fila.totais.semContato),
            tom: fila.totais.semContato > 0 ? "text-danger" : "",
            icone: <PhoneOff />,
            href: hrefDaSituacao("VENCIDO_SEM_CONTATO"),
            ativo: situacao === "VENCIDO_SEM_CONTATO",
          },
          {
            rotulo: "Sacado sem e-mail",
            valor: String(fila.totais.semEmail),
            tom: fila.totais.semEmail > 0 ? "text-warning-fg" : "text-fg-muted",
            icone: <MailX />,
          },
        ]}
      />

      {/* Quatro filtros no botão "Filtros" — eram quatro selects e um
          "Aplicar" numa fileira (conferência de 30/09). */}
      <CascoDaTabela
        contagem={contarItens(fila.linhas.length, "título", "títulos", fila.limitado)}
        total={moeda(fila.totais.centavos)}
        filtros={
          <FiltrosDaTela
            naBarra
            campos={[
              { chave: "faixa", rotulo: "Atraso", vazioLabel: "Qualquer atraso", opcoes: FAIXAS.map((f) => ({ value: f.chave, label: f.rotulo })) },
              {
                chave: "situacao",
                rotulo: "Situação",
                vazioLabel: "Todas as situações",
                opcoes: [{ value: "VENCIDOS", label: "Títulos vencidos" }, ...SITUACOES.map((s) => ({ value: s, label: ROTULO_DA_SITUACAO[s] }))],
              },
              {
                chave: "responsavel",
                rotulo: "Responsável",
                vazioLabel: "Qualquer responsável",
                opcoes: [
                  { value: "eu", label: "Meus" },
                  { value: "sem", label: "Sem responsável" },
                  ...usuarios.map((u) => ({ value: u.id, label: u.name })),
                ],
              },
            ]}
          />
        }
      >
        {fila.linhas.length === 0 ? (
          <EmptyState
            icon={<Handshake />}
            title={situacao || faixa || responsavel ? "Nada neste filtro" : empresaId ? "Nenhum título vencido nesta empresa" : "Nenhum título vencido"}
            description="Títulos a receber aparecem aqui no dia seguinte ao vencimento, até serem pagos, renegociados ou baixados por perda."
          />
        ) : (
          <GruposDaFila linhas={fila.linhas} hojeKey={hojeKey} podeAgir={podeAgir} />
        )}
        {fila.limitado && <p className="text-micro text-fg-muted mt-3">A fila passou de 2.000 títulos — mostrando os mais antigos. Filtre por empresa.</p>}
      </CascoDaTabela>
    </>
  );
}

// O que cabe de cada grupo antes do "mostrar mais": a fila pode ter 2.000 títulos.
const LIMITE_DO_GRUPO = 40;
const TOM_DO_GRUPO: Record<GrupoDaFila, TomDoSelo> = {
  hoje: "perigo",
  semContato: "atencao",
  semAcao: "atencao",
  aguardando: "neutro",
  parados: "neutro",
};

/** A segunda linha do título: o porquê de ele estar no grupo, e de quem é. */
function detalheDaLinha(l: LinhaDeCobranca, grupo: GrupoDaFila, hojeKey: string): string {
  const atraso = l.diasDeAtraso === 1 ? "1 dia de atraso" : `${l.diasDeAtraso} dias de atraso`;
  const quem = l.responsavelNome ?? "sem responsável";
  const quando = l.acao.quandoKey ? dataDaChave(l.acao.quandoKey) : "";
  if (grupo === "hoje") {
    const porque =
      l.situacao === "PROMETEU_PAGAR"
        ? `prometeu pagar em ${quando} e não pagou`
        : l.acao.quandoKey && l.acao.quandoKey < hojeKey
          ? `ação de ${quando} atrasada`
          : "ação marcada para hoje";
    return `${porque} · ${quem}`;
  }
  if (grupo === "aguardando") return `${l.situacao === "PROMETEU_PAGAR" ? `prometeu pagar em ${quando}` : `retorno em ${quando}`} · ${quem}`;
  if (grupo === "parados") return `${l.situacao ? ROTULO_DA_SITUACAO[l.situacao] : "Sem situação"} · ${atraso}`;
  return `${atraso} · ${quem}`;
}

function LinhaDaFila({ l, grupo, hojeKey, podeAgir }: { l: LinhaDeCobranca; grupo: GrupoDaFila; hojeKey: string; podeAgir: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-soft py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1 basis-60">
        <Link href={`/cobranca/${l.id}`} className="font-semibold text-fg transition-colors hover:text-brand">
          {l.sacadoNome}
        </Link>
        <p className="text-micro text-fg-muted">
          {l.empresaNome} · {detalheDaLinha(l, grupo, hojeKey)}
          {l.parcelaDeAcordo && " · parcela de acordo"}
          {l.regua.enviar === null && l.regua.motivo === "SEM_EMAIL" && <span className="text-warning-fg"> · sacado sem e-mail</span>}
        </p>
      </div>
      <span className="font-semibold tabular-nums">{moeda(l.valorCentavos)}</span>
      <span className="flex items-center gap-1.5">
        {podeAgir && grupo !== "parados" && (
          <RegistrarContatoNaLinha entryId={l.id} sacadoNome={l.sacadoNome} valor={moeda(l.valorCentavos)} hojeISO={hojeKey} />
        )}
        <Button href={`/cobranca/${l.id}`} variant="ghost" size="xs" aria-label={`Abrir o título de ${l.sacadoNome}`}>
          Abrir <ArrowRight size={12} />
        </Button>
      </span>
    </li>
  );
}

/**
 * A fila em grupos pela próxima ação (Cobrança A, 04/11/2026): por onde
 * começar o dia, com o "Registrar contato" na linha. Era uma tabela única de
 * oito colunas, com o "Próximas ações de hoje" num cartão à parte em cima.
 */
function GruposDaFila({ linhas, hojeKey, podeAgir }: { linhas: LinhaDeCobranca[]; hojeKey: string; podeAgir: boolean }) {
  const porGrupo = new Map<GrupoDaFila, LinhaDeCobranca[]>();
  for (const l of linhas) {
    const g = grupoDaFila(l);
    porGrupo.set(g, [...(porGrupo.get(g) ?? []), l]);
  }
  return (
    <div className="flex flex-col gap-4">
      {GRUPOS_DA_FILA.filter((g) => porGrupo.has(g.chave)).map((g) => {
        const doGrupo = porGrupo.get(g.chave)!;
        const total = doGrupo.reduce((s, l) => s + l.valorCentavos, 0);
        return (
          <Card key={g.chave} as="section" aria-labelledby={`grupo-${g.chave}`} className="p-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 id={`grupo-${g.chave}`} className="text-card-title font-semibold">
                {g.rotulo}
              </h2>
              <Selo tom={TOM_DO_GRUPO[g.chave]}>{doGrupo.length}</Selo>
              <span className="ml-auto text-fs-2 tabular-nums text-fg-muted">{moeda(total)}</span>
            </div>
            <p className="mb-1 text-micro text-fg-muted">{g.explicacao}</p>
            <ul>
              {doGrupo.slice(0, LIMITE_DO_GRUPO).map((l) => (
                <LinhaDaFila key={l.id} l={l} grupo={g.chave} hojeKey={hojeKey} podeAgir={podeAgir} />
              ))}
            </ul>
            {doGrupo.length > LIMITE_DO_GRUPO && (
              <BlocoRecolhivel className="mt-2" titulo={`Mais ${doGrupo.length - LIMITE_DO_GRUPO} neste grupo`}>
                <ul>
                  {doGrupo.slice(LIMITE_DO_GRUPO).map((l) => (
                    <LinhaDaFila key={l.id} l={l} grupo={g.chave} hojeKey={hojeKey} podeAgir={podeAgir} />
                  ))}
                </ul>
              </BlocoRecolhivel>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ─── Acordos ────────────────────────────────────────────────────────────────

type AcordoDaLista = Awaited<ReturnType<typeof listarAcordos>>["acordos"][number];

function BarraDasParcelas({ and, cor, rotulo }: { and: AndamentoDoAcordo; cor: string; rotulo: string }) {
  const pct = and.total > 0 ? Math.round((and.pagas / and.total) * 100) : 0;
  return (
    <div className="w-36">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={and.total}
        aria-valuenow={and.pagas}
        aria-label={`Parcelas pagas do acordo de ${rotulo}`}
        className="h-1.5 overflow-hidden rounded-full bg-border-soft"
      >
        <div className={`h-full rounded-full ${cor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-micro tabular-nums text-fg-muted">
        {and.pagas} de {and.total} pagas
      </span>
    </div>
  );
}

function ProximaParcela({ and }: { and: AndamentoDoAcordo }) {
  if (!and.proxima) return <span className="text-fg-muted">—</span>;
  return (
    <span className="tabular-nums">
      <span className={and.proxima.vencida ? "font-medium text-danger" : ""}>
        {and.proxima.vencida ? "venceu " : ""}
        {dataDaChave(and.proxima.vencimentoKey)}
      </span>
      <span className="text-fg-muted"> · {moeda(and.proxima.valorCentavos)}</span>
    </span>
  );
}

/** O que abre no "Ver parcelas": o texto do acordo, as parcelas e os títulos originais. */
function DetalheDoAcordo({ a, motivoDeNaoDesfazer }: { a: AcordoDaLista; motivoDeNaoDesfazer: string | null }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-fs-2 tabular-nums text-fg-secondary">
        Originais {moeda(a.originalCentavos)} → acordado <strong className="text-fg">{moeda(a.acordadoCentavos)}</strong>
        {a.diferencaCentavos !== 0 && ` (${a.diferencaCentavos > 0 ? "acréscimo" : "desconto"} de ${moeda(Math.abs(a.diferencaCentavos))})`}
        {" · "}
        {moeda(a.resumo.pagoCentavos)} recebido · acordado em {formatInstantDate(a.acordadoEm)}
        {a.criadoPor ? ` por ${a.criadoPor}` : ""}
        {a.encerradoEm && a.status !== "ATIVO" ? ` · ${ROTULO_DO_ACORDO[a.status].toLowerCase()} em ${formatInstantDate(a.encerradoEm)}` : ""}
      </p>
      {a.notas && <p className="max-w-[720px] text-helper text-fg-secondary">{a.notas}</p>}
      {motivoDeNaoDesfazer && <p className="text-micro text-fg-muted">{motivoDeNaoDesfazer}</p>}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="overflow-x-auto">
          <p className="c41-rotulo mb-1">Parcelas</p>
          <table className="w-full text-ui">
            <tbody>
              {a.parcelas.map((p, i) => (
                <tr key={p.id} className="border-b border-border-soft">
                  <td className="py-1 pr-3 tabular-nums">
                    {i + 1}/{a.parcelas.length}
                  </td>
                  <td className="py-1 pr-3 tabular-nums">{formatInstantDate(p.vencimento)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{moeda(p.valorCentavos)}</td>
                  <td className="py-1">
                    {p.pagoEm ? (
                      <Selo tom={tomDaVariante(TOM_DA_SITUACAO.PAGA)}>Paga em {formatInstantDate(p.pagoEm)}</Selo>
                    ) : p.closeReason === "PERDA" ? (
                      <Selo tom={tomDaVariante(TOM_DA_SITUACAO.PERDA)}>Perda</Selo>
                    ) : p.closeReason === "RENEGOCIADO" ? (
                      <Selo tom={tomDaVariante(TOM_DA_SITUACAO.RENEGOCIADA)}>Renegociada</Selo>
                    ) : p.status === "CANCELADO" ? (
                      <Selo tom={tomDaVariante(TOM_DA_SITUACAO.CANCELADA)}>Cancelada</Selo>
                    ) : (
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <Selo tom={tomDaVariante(TOM_DA_SITUACAO.EM_ABERTO)}>Em aberto</Selo>
                        <Button href={`/cobranca/${p.id}`} variant="secondary" size="xs">
                          Abrir <ArrowRight size={12} />
                        </Button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="overflow-x-auto">
          <p className="c41-rotulo mb-1">Títulos originais</p>
          <table className="w-full text-ui">
            <tbody>
              {a.originais.map((o) => (
                <tr key={o.id} className="border-b border-border-soft">
                  <td className="py-1 pr-3 tabular-nums">venc. {formatInstantDate(o.vencimento)}</td>
                  <td className="py-1 pr-3 tabular-nums">comp. {formatarCompetencia(o.competencia)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{moeda(o.valorCentavos)}</td>
                  <td className="max-w-[200px] truncate py-1 text-fg-muted">
                    <Link href={`/cobranca/${o.id}`} className="hover:underline">
                      {o.descricao ?? "ver título"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/**
 * Os acordos em tabela, com o andamento em barra (Cobrança A, 04/11/2026):
 * uma linha por acordo, a parcela vencida à vista, e o texto e as parcelas no
 * "Ver parcelas". Eram cartões empilhados com três linhas de texto cada.
 */
async function Acordos({
  escopo,
  status,
  podeAgir,
}: {
  /** Uma empresa, ou todas — só quando pedido (`?empresa=todas`). */
  escopo: EscopoDaEscolha;
  status: string | undefined;
  podeAgir: boolean;
}) {
  const filtroStatus = STATUS_DE_ACORDO.find((s) => s === status) ?? null;
  const { acordos, contagem } = await listarAcordos(escopo, { status: filtroStatus });
  const hojeKey = saoPauloParts(new Date()).dateKey;

  const linhas = acordos.map((a) => {
    const and = andamentoDoAcordo(
      a.parcelas.map((p) => ({
        valorCentavos: p.valorCentavos,
        vencimentoKey: saoPauloParts(p.vencimento).dateKey,
        pago: p.pagoEm !== null,
        encerrada: p.closeReason !== null || p.status === "CANCELADO",
      })),
      hojeKey
    );
    const desfazer = podeDesfazer(a.status, a.parcelas.map((p) => ({ status: p.status, closeReason: p.closeReason, paidAt: p.pagoEm })));
    const vencida = a.status === "ATIVO" && and.vencidas > 0;
    const cor = a.status === "QUEBRADO" ? "bg-danger" : vencida ? "bg-warning" : "bg-success";
    const selo = vencida ? <Selo tom="atencao">Parcela vencida</Selo> : <SeloDoAcordo status={a.status} />;
    const motivo = !desfazer.pode && (a.status === "ATIVO" || a.status === "QUEBRADO") ? desfazer.motivo : null;
    // Quebrar e desfazer encerram o acordo: vão no "⋯", em vermelho, com a
    // janela do motivo (11A, 15/10/2026).
    const decisoes = [
      ...(podeQuebrar(a.status).pode
        ? [
            {
              rotulo: "Marcar como quebrado",
              variante: "danger" as const,
              titulo: "Acordo quebrado",
              descricao: "As parcelas não pagas continuam em aberto como a dívida e voltam para a cobrança comum (e para a régua).",
              confirmar: "Marcar como quebrado",
              acao: quebrarAcordo.bind(null, a.id),
            },
          ]
        : []),
      ...(desfazer.pode
        ? [
            {
              rotulo: "Desfazer acordo",
              variante: "danger" as const,
              titulo: "Desfazer acordo",
              descricao:
                "Cancela as parcelas e devolve os títulos originais ao em aberto, com o valor e o vencimento de antes. A diferença do acordo sai da DRE econômica.",
              confirmar: "Desfazer acordo",
              acao: desfazerAcordo.bind(null, a.id),
            },
          ]
        : []),
    ];
    const menu = podeAgir && decisoes.length > 0 ? <DecisoesNoMenu rotulo={`Mais ações do acordo de ${a.sacadoNome}`} decisoes={decisoes} /> : undefined;
    return { a, and, cor, selo, motivo, menu, vencida };
  });

  // Os totais olham os acordos ativos; com outro filtro de situação, não há ativos na lista.
  const ativos = linhas.filter((l) => l.a.status === "ATIVO");
  const veAtivos = !filtroStatus || filtroStatus === "ATIVO";
  const emAberto = ativos.reduce((s, l) => s + l.and.emAbertoCentavos, 0);
  const comVencida = ativos.filter((l) => l.vencida).length;

  return (
    <>
      <FaixaDeTotais
        itens={[
          { rotulo: "Acordos ativos", valor: String(contagem.ATIVO ?? 0), icone: <Handshake /> },
          { rotulo: "Em aberto nos acordos", valor: veAtivos ? moeda(emAberto) : "—", icone: <Wallet />, detalhe: veAtivos ? undefined : "com o filtro de ativos" },
          {
            rotulo: "Com parcela vencida",
            valor: veAtivos ? String(comVencida) : "—",
            tom: veAtivos && comVencida > 0 ? "text-danger" : "",
            icone: <AlarmClock />,
          },
          { rotulo: "Quebrados", valor: String(contagem.QUEBRADO ?? 0), tom: (contagem.QUEBRADO ?? 0) > 0 ? "text-danger" : "", icone: <FileWarning /> },
        ]}
      />

      <CascoDaTabela
        contagem={contarItens(acordos.length, "acordo", "acordos", false)}
        filtros={
          // Situação (com a contagem de cada uma) no botão "Filtros"; a empresa
          // é o seletor da fileira de cima (13/10/2026).
          <FiltrosDaTela
            naBarra
            campos={[
              {
                chave: "status",
                rotulo: "Situação",
                vazioLabel: "Todos",
                opcoes: STATUS_DE_ACORDO.map((s) => ({ value: s, label: `${ROTULO_DO_ACORDO[s]} (${contagem[s] ?? 0})` })),
              },
            ]}
          />
        }
      >
        {acordos.length === 0 ? (
          <EmptyState icon={<Handshake />} title="Nenhum acordo" description="Acordos nascem no título vencido, na fila: escolha os títulos do sacado e simule as parcelas." />
        ) : (
          <>
            <CartoesNoCelular>
              {linhas.map(({ a, and, cor, selo, motivo, menu }) => (
                <Cartao key={a.id}>
                  <TopoDoCartao nome={a.sacadoNome} valor={moeda(a.acordadoCentavos)} />
                  <InfoDoCartao>
                    {a.empresaNome} · {formatInstantDate(a.acordadoEm)}
                  </InfoDoCartao>
                  <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
                    <BarraDasParcelas and={and} cor={cor} rotulo={a.sacadoNome} />
                    <span className="text-fs-2">
                      <ProximaParcela and={and} />
                    </span>
                  </div>
                  <PeDoCartao>
                    {selo}
                    <span className="ml-auto">{menu}</span>
                  </PeDoCartao>
                  <BlocoRecolhivel className="mt-2" titulo="Ver parcelas">
                    <DetalheDoAcordo a={a} motivoDeNaoDesfazer={motivo} />
                  </BlocoRecolhivel>
                </Cartao>
              ))}
            </CartoesNoCelular>
            <TabelaNoDesktop padrao>
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-border text-micro uppercase tracking-wide text-fg-muted">
                    <th className="py-2 pr-3 font-medium">Sacado</th>
                    <th className="py-2 pr-3 font-medium">Situação</th>
                    <th className="py-2 pr-3 font-medium">Parcelas</th>
                    <th className="py-2 pr-3 font-medium">Próxima parcela</th>
                    <th className="py-2 pr-3 text-right font-medium">Acordado</th>
                    <th className="py-2 font-medium">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map(({ a, and, cor, selo, motivo, menu }) => (
                    <LinhaDoAcordo
                      key={a.id}
                      rotulo={a.sacadoNome}
                      menu={menu}
                      detalhe={<DetalheDoAcordo a={a} motivoDeNaoDesfazer={motivo} />}
                      colunas={
                        <>
                          <td className="py-2.5 pr-3">
                            <span className="font-semibold">{a.sacadoNome}</span>
                            <span className="block text-micro text-fg-muted">
                              {a.empresaNome} · {formatInstantDate(a.acordadoEm)}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3">{selo}</td>
                          <td className="py-2.5 pr-3">
                            <BarraDasParcelas and={and} cor={cor} rotulo={a.sacadoNome} />
                          </td>
                          <td className="py-2.5 pr-3 text-fs-2 whitespace-nowrap">
                            <ProximaParcela and={and} />
                          </td>
                          <td className="py-2.5 pr-3 text-right font-medium tabular-nums">{moeda(a.acordadoCentavos)}</td>
                        </>
                      }
                    />
                  ))}
                </tbody>
              </table>
            </TabelaNoDesktop>
          </>
        )}
      </CascoDaTabela>
    </>
  );
}

// ─── Régua ──────────────────────────────────────────────────────────────────

/**
 * A régua em trilho com a prévia do e-mail (Cobrança A, 04/11/2026); os envios
 * com o filtro "Com erro", e as empresas fora na coluna da prévia.
 */
async function Regua({
  tenantId,
  empresas,
  soDaBase,
  gerencia,
  filtroDosEnvios,
  naUrl,
}: {
  tenantId: string;
  empresas: EmpresaDoSeletor[];
  /** Com uma empresa em foco (21/10/2026), as listas mostram só a base dela. */
  soDaBase: string[] | null;
  gerencia: boolean;
  filtroDosEnvios: string | undefined;
  naUrl: string | undefined;
}) {
  const d = await dadosDaAbaRegua(tenantId, soDaBase);
  const fora = new Set(d.foraDaRegua.map((f) => f.companyId));
  const soErros = filtroDosEnvios === "erro";
  const comErro = d.envios.filter((e) => !e.ok).length;
  const envios = soErros ? d.envios.filter((e) => !e.ok) : d.envios;
  const hrefDosEnvios = (erro: boolean) => {
    const q = new URLSearchParams({ aba: "regua" });
    if (naUrl) q.set("empresa", naUrl);
    if (erro) q.set("envios", "erro");
    return `/cobranca?${q}`;
  };

  const cartaoDosEnvios = (
    <Card as="section" aria-labelledby="ultimos-envios" className="p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 id="ultimos-envios" className="text-card-title font-semibold">
          Últimos envios
        </h2>
        {d.errosNaSemana > 0 && <Badge variant="danger">{d.errosNaSemana} com erro nos últimos 7 dias</Badge>}
        <nav aria-label="Filtrar os envios" className="ml-auto flex items-center gap-1">
          <Button href={hrefDosEnvios(false)} size="xs" variant={soErros ? "ghost" : "secondary"} aria-current={soErros ? undefined : "page"}>
            Todos
          </Button>
          <Button href={hrefDosEnvios(true)} size="xs" variant={soErros ? "secondary" : "ghost"} aria-current={soErros ? "page" : undefined}>
            Com erro ({comErro})
          </Button>
        </nav>
      </div>
      {envios.length === 0 ? (
        <EmptyState
          icon={<Mail />}
          title={soErros ? "Nenhum envio com erro" : "Nenhum lembrete enviado"}
          description={soErros ? "Os últimos envios saíram todos." : "Os envios da régua aparecem aqui, com erro quando o servidor de e-mail recusou."}
        />
      ) : (
        <ul>
          {envios.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border-soft py-2 last:border-b-0">
              <div className="min-w-0 flex-1 basis-60">
                <Link href={`/cobranca/${e.entryId}`} className="font-semibold text-fg transition-colors hover:text-brand">
                  {e.sacadoNome}
                </Link>
                <p className="text-micro tabular-nums text-fg-muted">
                  {formatInstantDateTime(e.em)} · passo de {e.passo} dias · {e.empresaNome} · para {e.para}
                </p>
                {!e.ok && e.erro && <p className="break-words text-micro text-danger">{e.erro}</p>}
              </div>
              <span className="tabular-nums">{moeda(e.valorCentavos)}</span>
              {e.ok ? <Selo tom="sucesso">Enviado</Selo> : <Selo tom="perigo">Erro</Selo>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  const cartaoDasEmpresasFora = (
    <Card as="section" aria-labelledby="empresas-fora" className="flex flex-col gap-2 p-4">
      <h2 id="empresas-fora" className="text-card-title font-semibold">
        Empresas fora da régua
      </h2>
      <p className="text-helper text-fg-muted">Para o cliente que cobra os próprios sacados. A fila continua mostrando os títulos.</p>
      {d.foraDaRegua.length === 0 ? (
        <p className="text-helper text-fg-muted">Nenhuma empresa fora.</p>
      ) : (
        <ul className="flex flex-col text-ui">
          {d.foraDaRegua.map((f) => (
            <li key={f.companyId} className="flex flex-wrap items-center gap-2 border-b border-border-soft py-1.5 last:border-b-0">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{f.empresaNome}</span>
                <span className="block text-micro text-fg-muted">
                  desde {formatInstantDate(f.desde)}
                  {f.por ? ` · ${f.por}` : ""}
                </span>
              </span>
              {gerencia && <EmpresaNaRegua companyId={f.companyId} fora={false} />}
            </li>
          ))}
        </ul>
      )}
      {gerencia && <EmpresaNaRegua empresas={empresas.filter((e) => !fora.has(e.id))} fora />}
    </Card>
  );

  return (
    <ReguaEmTrilho
      ligada={d.config.ligada}
      passos={d.config.passos}
      podeEditar={gerencia}
      hojeISO={saoPauloParts(new Date()).dateKey}
      envios={cartaoDosEnvios}
      fora={cartaoDasEmpresasFora}
    />
  );
}
