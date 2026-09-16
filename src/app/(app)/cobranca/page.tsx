import Link from "next/link";
import { notFound } from "next/navigation";
import { AlarmClock, Handshake, Mail } from "lucide-react";
import { getAuthContext, canViewSector, canActOnSector, canManageSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { getSectorUsers } from "@/lib/sectorUsers";
import { formatInstantDate, formatInstantDateTime } from "@/lib/format";
import { saoPauloParts } from "@/lib/agenda";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { AbasDeLink, FaixaDeTotais } from "@/components/financeiro/FiltroDePeriodo";
import { SeloDaCobranca, SeloDoAcordo } from "@/components/cobranca/SeloDaCobranca";
import { AcaoComMotivo } from "@/components/cobranca/AcaoComMotivo";
import { ConfigDaRegua, EmpresaNaRegua } from "@/components/cobranca/ConfigDaRegua";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { moeda } from "@/lib/financeiro/formato";
import { FAIXAS_DE_ATRASO, type ChaveDaFaixa } from "@/lib/financeiro/analise";
import {
  ROTULO_DA_SITUACAO,
  ROTULO_DO_CANAL,
  ROTULO_DO_RESULTADO,
  ROTULO_DO_ACORDO,
  type SituacaoDeCobranca,
  type StatusDoAcordo,
} from "@/lib/financeiro/cobranca/regras";
import { ROTULO_DO_MOTIVO } from "@/lib/financeiro/cobranca/regua";
import { podeDesfazer, podeQuebrar } from "@/lib/financeiro/cobranca/acordo";
import {
  filaDeCobranca,
  listarAcordos,
  dadosDaAbaRegua,
  MODULO_DE_COBRANCA,
  type LinhaDeCobranca,
} from "@/lib/financeiro/cobranca/consultas";
import { quebrarAcordo, desfazerAcordo } from "./actions";

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
  const setor = (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR;
  if (!canViewSector(ctx, setor) || !(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();
  const podeAgir = canActOnSector(ctx, setor);
  const gerencia = canManageSector(ctx, setor);

  const params = await searchParams;
  const aba = params.aba === "acordos" ? "acordos" : params.aba === "regua" ? "regua" : "fila";
  const empresas = await empresasDoSeletor(ctx.tenantId);
  const empresaId = params.empresa && empresas.some((e) => e.id === params.empresa) ? params.empresa : null;

  return (
    <PageContainer>
      <PageHeader
        title="Cobrança"
        subtitle="Contas a receber vencidas: quem cobrar hoje, o que foi combinado, acordos e a régua de lembretes por e-mail."
      />
      <div className="mt-4">
        <AbasDeLink
          abas={[
            { chave: "fila", rotulo: "Fila", href: "/cobranca" },
            { chave: "acordos", rotulo: "Acordos", href: "/cobranca?aba=acordos" },
            { chave: "regua", rotulo: "Régua", href: "/cobranca?aba=regua" },
          ]}
          ativa={aba}
        />
      </div>
      {aba === "fila" && (
        <Fila tenantId={ctx.tenantId} userId={ctx.userId} setor={setor} empresas={empresas} empresaId={empresaId} params={params} />
      )}
      {aba === "acordos" && (
        <Acordos tenantId={ctx.tenantId} empresas={empresas} empresaId={empresaId} status={params.status} podeAgir={podeAgir} />
      )}
      {aba === "regua" && <Regua tenantId={ctx.tenantId} empresas={empresas} gerencia={gerencia} />}
    </PageContainer>
  );
}

// ─── Fila ───────────────────────────────────────────────────────────────────

async function Fila({
  tenantId,
  userId,
  setor,
  empresas,
  empresaId,
  params,
}: {
  tenantId: string;
  userId: string;
  setor: string;
  empresas: { id: string; nome: string }[];
  empresaId: string | null;
  params: Record<string, string | undefined>;
}) {
  const faixa = FAIXAS.find((f) => f.chave === params.faixa)?.chave ?? null;
  const situacao = SITUACOES.find((s) => s === params.situacao) ?? null;
  const responsavelBruto = params.responsavel ?? "";
  const responsavel = responsavelBruto === "eu" ? userId : responsavelBruto || null;

  const [fila, usuarios] = await Promise.all([
    filaDeCobranca(tenantId, { empresaId, faixa: faixa as ChaveDaFaixa | null, situacao, responsavel }, new Date()),
    getSectorUsers(tenantId, setor),
  ]);
  const hojeKey = saoPauloParts(new Date()).dateKey;

  return (
    <>
      <FaixaDeTotais
        itens={[
          { rotulo: situacao === "PERDA" ? "Títulos perdidos" : "Títulos vencidos", valor: String(fila.totais.titulos) },
          { rotulo: "Valor", valor: moeda(fila.totais.centavos), tom: fila.totais.centavos > 0 && situacao !== "PERDA" ? "text-danger" : "" },
          { rotulo: "Sem contato", valor: String(fila.totais.semContato), tom: fila.totais.semContato > 0 ? "text-danger" : "" },
          { rotulo: "Sacado sem e-mail", valor: String(fila.totais.semEmail), tom: fila.totais.semEmail > 0 ? "text-warning" : "text-fg-muted" },
        ]}
      />

      <form method="get" action="/cobranca" className="flex flex-wrap items-center gap-2 mb-4">
        <Select compact name="empresa" defaultValue={empresaId ?? ""} className="w-72 max-w-full" aria-label="Empresa">
          <option value="">Todas as empresas</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </Select>
        <Select compact name="faixa" defaultValue={faixa ?? ""} className="w-40" aria-label="Faixa de atraso">
          <option value="">Qualquer atraso</option>
          {FAIXAS.map((f) => (
            <option key={f.chave} value={f.chave}>
              {f.rotulo}
            </option>
          ))}
        </Select>
        <Select compact name="situacao" defaultValue={situacao ?? ""} className="w-48" aria-label="Situação">
          <option value="">Todas as situações</option>
          {SITUACOES.map((s) => (
            <option key={s} value={s}>
              {ROTULO_DA_SITUACAO[s]}
            </option>
          ))}
        </Select>
        <Select compact name="responsavel" defaultValue={responsavelBruto} className="w-48" aria-label="Responsável">
          <option value="">Qualquer responsável</option>
          <option value="eu">Meus</option>
          <option value="sem">Sem responsável</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary" size="sm">
          Aplicar
        </Button>
      </form>

      {fila.paraHoje.length > 0 && (
        <Card className="p-4 mb-4 border-warning/40">
          <h2 className="text-[14px] font-semibold mb-2 flex items-center gap-2">
            <AlarmClock size={15} className="text-warning" /> Próximas ações de hoje
          </h2>
          <ul className="flex flex-col gap-1.5 text-[13px]">
            {fila.paraHoje.slice(0, 30).map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/cobranca/${l.id}`} className="text-brand hover:underline font-medium">
                  {l.sacadoNome}
                </Link>
                <span className="text-fg-muted">{l.empresaNome}</span>
                <span className="tabular-nums">{moeda(l.valorCentavos)}</span>
                {l.acao.quandoKey && l.acao.quandoKey < hojeKey ? (
                  <span className="text-[12px] text-danger">agendada para {dataDaChave(l.acao.quandoKey)}</span>
                ) : (
                  <span className="text-[12px] text-fg-muted">hoje</span>
                )}
                {l.ultimoContato && <span className="text-[12px] text-fg-muted">· {ROTULO_DO_RESULTADO[l.ultimoContato.resultado]}</span>}
                {l.responsavelNome && <span className="text-[12px] text-fg-muted">· {l.responsavelNome}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {fila.linhas.length === 0 ? (
        <EmptyState
          icon={<Handshake />}
          title={situacao || faixa || responsavel || empresaId ? "Nada neste filtro" : "Nenhum título vencido"}
          description="Títulos a receber aparecem aqui no dia seguinte ao vencimento, até serem pagos, renegociados ou baixados por perda."
        />
      ) : (
        <TabelaDaFila linhas={fila.linhas} hojeKey={hojeKey} />
      )}
      {fila.limitado && <p className="text-[11px] text-fg-muted mt-3">A fila passou de 2.000 títulos — mostrando os mais antigos. Filtre por empresa.</p>}
    </>
  );
}

function TabelaDaFila({ linhas, hojeKey }: { linhas: LinhaDeCobranca[]; hojeKey: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px] text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
            <th className="py-2 pr-3 font-medium">Vencimento</th>
            <th className="py-2 pr-3 font-medium">Sacado</th>
            <th className="py-2 pr-3 font-medium text-right">Valor</th>
            <th className="py-2 pr-3 font-medium">Situação</th>
            <th className="py-2 pr-3 font-medium">Próxima ação</th>
            <th className="py-2 pr-3 font-medium">Responsável</th>
            <th className="py-2 pr-3 font-medium">Régua</th>
            <th className="py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id} className="border-b border-border-soft align-top hover:bg-surface-hover transition-colors">
              <td className="py-2.5 pr-3 tabular-nums whitespace-nowrap">
                {formatInstantDate(l.vencimento)}
                <span className="block text-[11px] text-fg-muted">{l.diasDeAtraso === 1 ? "1 dia" : `${l.diasDeAtraso} dias`}</span>
              </td>
              <td className="py-2.5 pr-3">
                <span className="font-medium">{l.sacadoNome}</span>
                <span className="block text-[11px] text-fg-muted">{l.empresaNome}</span>
                {l.parcelaDeAcordo && <span className="block text-[11px] text-fg-muted">parcela de acordo</span>}
              </td>
              <td className="py-2.5 pr-3 text-right tabular-nums font-medium">{moeda(l.valorCentavos)}</td>
              <td className="py-2.5 pr-3">
                <SeloDaCobranca situacao={l.situacao} />
                {l.ultimoContato && (
                  <span className="block text-[11px] text-fg-muted mt-1">
                    {formatInstantDate(l.ultimoContato.em)} · {ROTULO_DO_CANAL[l.ultimoContato.canal]} · {ROTULO_DO_RESULTADO[l.ultimoContato.resultado]}
                  </span>
                )}
              </td>
              <td className="py-2.5 pr-3 tabular-nums whitespace-nowrap">
                {l.acao.quandoKey ? (
                  <span className={l.acao.quandoKey < hojeKey ? "text-danger" : l.acao.paraHoje ? "text-warning font-medium" : ""}>
                    {dataDaChave(l.acao.quandoKey)}
                  </span>
                ) : (
                  <span className="text-fg-muted">—</span>
                )}
              </td>
              <td className="py-2.5 pr-3 text-fg-secondary">{l.responsavelNome ?? <span className="text-fg-muted">—</span>}</td>
              <td className="py-2.5 pr-3 text-[12px]">
                {l.regua.enviar !== null ? (
                  <span className="inline-flex items-center gap-1 text-brand">
                    <Mail size={12} /> passo de {l.regua.enviar} dias
                  </span>
                ) : l.regua.motivo === "SEM_EMAIL" ? (
                  <span className="text-warning">{ROTULO_DO_MOTIVO[l.regua.motivo]}</span>
                ) : (
                  <span className="text-fg-muted">{ROTULO_DO_MOTIVO[l.regua.motivo]}</span>
                )}
              </td>
              <td className="py-2.5">
                <Link href={`/cobranca/${l.id}`} className="text-brand hover:underline text-[12px] whitespace-nowrap">
                  abrir
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Acordos ────────────────────────────────────────────────────────────────

async function Acordos({
  tenantId,
  empresas,
  empresaId,
  status,
  podeAgir,
}: {
  tenantId: string;
  empresas: { id: string; nome: string }[];
  empresaId: string | null;
  status: string | undefined;
  podeAgir: boolean;
}) {
  const filtroStatus = STATUS_DE_ACORDO.find((s) => s === status) ?? null;
  const { acordos, contagem } = await listarAcordos({ tenantId, companyIds: empresaId ? [empresaId] : null }, { status: filtroStatus });
  const href = (s: StatusDoAcordo | null) => {
    const q = new URLSearchParams({ aba: "acordos" });
    if (empresaId) q.set("empresa", empresaId);
    if (s) q.set("status", s);
    return `/cobranca?${q.toString()}`;
  };

  return (
    <>
      <form method="get" action="/cobranca" className="flex flex-wrap items-center gap-2 mb-4">
        <input type="hidden" name="aba" value="acordos" />
        {filtroStatus && <input type="hidden" name="status" value={filtroStatus} />}
        <Select compact name="empresa" defaultValue={empresaId ?? ""} className="w-72 max-w-full" aria-label="Empresa">
          <option value="">Todas as empresas</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary" size="sm">
          Aplicar
        </Button>
      </form>
      <AbasDeLink
        abas={[
          { chave: "todos", rotulo: "Todos", href: href(null) },
          ...STATUS_DE_ACORDO.map((s) => ({ chave: s, rotulo: `${ROTULO_DO_ACORDO[s]} (${contagem[s] ?? 0})`, href: href(s) })),
        ]}
        ativa={filtroStatus ?? "todos"}
      />

      {acordos.length === 0 ? (
        <EmptyState icon={<Handshake />} title="Nenhum acordo" description="Acordos nascem no título vencido, na fila: escolha os títulos do sacado e simule as parcelas." />
      ) : (
        <div className="flex flex-col gap-3">
          {acordos.map((a) => {
            const desfazer = podeDesfazer(a.status, a.parcelas.map((p) => ({ status: p.status, closeReason: p.closeReason, paidAt: p.pagoEm })));
            return (
              <Card key={a.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold">{a.sacadoNome}</span>
                      <SeloDoAcordo status={a.status} />
                    </div>
                    <p className="text-[12px] text-fg-muted mt-0.5">
                      {a.empresaNome} · acordado em {formatInstantDate(a.acordadoEm)}
                      {a.criadoPor ? ` por ${a.criadoPor}` : ""}
                      {a.encerradoEm && a.status !== "ATIVO" ? ` · ${ROTULO_DO_ACORDO[a.status].toLowerCase()} em ${formatInstantDate(a.encerradoEm)}` : ""}
                    </p>
                    <p className="text-[12px] mt-1 tabular-nums">
                      Originais {moeda(a.originalCentavos)} → acordado <strong>{moeda(a.acordadoCentavos)}</strong>
                      {a.diferencaCentavos !== 0 && (
                        <span className={a.diferencaCentavos > 0 ? "text-success" : "text-danger"}>
                          {" "}
                          ({a.diferencaCentavos > 0 ? "acréscimo" : "desconto"} de {moeda(Math.abs(a.diferencaCentavos))})
                        </span>
                      )}{" "}
                      · {a.resumo.pagas}/{a.resumo.total} pagas · {moeda(a.resumo.pagoCentavos)} recebido
                    </p>
                    {a.notas && <p className="text-[12px] text-fg-secondary mt-1 max-w-[720px]">{a.notas}</p>}
                  </div>
                  {podeAgir && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {podeQuebrar(a.status).pode && (
                        <AcaoComMotivo
                          rotulo="Marcar como quebrado"
                          titulo="Acordo quebrado"
                          descricao="As parcelas não pagas continuam em aberto como a dívida e voltam para a cobrança comum (e para a régua)."
                          confirmar="Marcar como quebrado"
                          acao={quebrarAcordo.bind(null, a.id)}
                        />
                      )}
                      {desfazer.pode ? (
                        <AcaoComMotivo
                          rotulo="Desfazer"
                          variante="danger"
                          titulo="Desfazer acordo"
                          descricao="Cancela as parcelas e devolve os títulos originais ao em aberto, com o valor e o vencimento de antes. A diferença do acordo sai da DRE econômica."
                          confirmar="Desfazer acordo"
                          acao={desfazerAcordo.bind(null, a.id)}
                        />
                      ) : (
                        (a.status === "ATIVO" || a.status === "QUEBRADO") && <span className="text-[11px] text-fg-muted max-w-[220px]">{desfazer.motivo}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="overflow-x-auto">
                    <p className="text-[11px] uppercase tracking-wide text-fg-muted mb-1">Parcelas</p>
                    <table className="w-full text-[12px]">
                      <tbody>
                        {a.parcelas.map((p, i) => (
                          <tr key={p.id} className="border-b border-border-soft">
                            <td className="py-1 pr-3 tabular-nums">
                              {i + 1}/{a.parcelas.length}
                            </td>
                            <td className="py-1 pr-3 tabular-nums">{formatInstantDate(p.vencimento)}</td>
                            <td className="py-1 pr-3 tabular-nums text-right">{moeda(p.valorCentavos)}</td>
                            <td className="py-1">
                              {p.pagoEm ? (
                                <Badge variant="success">Paga em {formatInstantDate(p.pagoEm)}</Badge>
                              ) : p.closeReason === "PERDA" ? (
                                <Badge variant="danger">Perda</Badge>
                              ) : p.closeReason === "RENEGOCIADO" ? (
                                <Badge variant="info">Renegociada</Badge>
                              ) : p.status === "CANCELADO" ? (
                                <Badge variant="info">Cancelada</Badge>
                              ) : (
                                <Link href={`/cobranca/${p.id}`} className="text-brand hover:underline">
                                  em aberto
                                </Link>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="overflow-x-auto">
                    <p className="text-[11px] uppercase tracking-wide text-fg-muted mb-1">Títulos originais</p>
                    <table className="w-full text-[12px]">
                      <tbody>
                        {a.originais.map((o) => (
                          <tr key={o.id} className="border-b border-border-soft">
                            <td className="py-1 pr-3 tabular-nums">venc. {formatInstantDate(o.vencimento)}</td>
                            <td className="py-1 pr-3 tabular-nums">comp. {o.competencia}</td>
                            <td className="py-1 pr-3 tabular-nums text-right">{moeda(o.valorCentavos)}</td>
                            <td className="py-1 text-fg-muted truncate max-w-[200px]">
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
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─── Régua ──────────────────────────────────────────────────────────────────

async function Regua({ tenantId, empresas, gerencia }: { tenantId: string; empresas: { id: string; nome: string }[]; gerencia: boolean }) {
  const d = await dadosDaAbaRegua(tenantId);
  const fora = new Set(d.foraDaRegua.map((f) => f.companyId));

  return (
    <>
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <h2 className="text-[14px] font-semibold">Régua de lembretes por e-mail</h2>
          {d.config.ligada ? <Badge variant="success">Ligada</Badge> : <Badge variant="info">Desligada</Badge>}
        </div>
        <p className="text-[12px] text-fg-muted mb-3 max-w-[860px]">
          Um e-mail ao sacado em cada passo de atraso, pelo SMTP do escritório, em nome da empresa credora — com valor, vencimento e
          dias de atraso, sem link. Pausa quando o título está em acordo, quando o último contato contestou, e enquanto a data de
          pagamento prometida não passou. Sacado sem e-mail fica fora. A execução diária é agendada fora do Connect.
        </p>
        <ConfigDaRegua ligada={d.config.ligada} passos={d.config.passosTexto} podeEditar={gerencia} />
        {!gerencia && <p className="text-[11px] text-fg-muted mt-2">Só a coordenação altera a régua.</p>}
      </Card>

      <Card className="p-4 mb-4">
        <h2 className="text-[14px] font-semibold mb-1">Empresas fora da régua</h2>
        <p className="text-[12px] text-fg-muted mb-3">Para o cliente que cobra os próprios sacados. A fila continua mostrando os títulos.</p>
        {gerencia && <EmpresaNaRegua empresas={empresas.filter((e) => !fora.has(e.id))} fora />}
        {d.foraDaRegua.length === 0 ? (
          <p className="text-[12px] text-fg-muted mt-3">Nenhuma empresa fora.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 mt-3 text-[13px]">
            {d.foraDaRegua.map((f) => (
              <li key={f.companyId} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{f.empresaNome}</span>
                <span className="text-[11px] text-fg-muted">
                  desde {formatInstantDate(f.desde)}
                  {f.por ? ` · ${f.por}` : ""}
                </span>
                {gerencia && <EmpresaNaRegua companyId={f.companyId} fora={false} />}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <h2 className="text-[14px] font-semibold">Últimos envios</h2>
        {d.errosNaSemana > 0 && <Badge variant="danger">{d.errosNaSemana} com erro nos últimos 7 dias</Badge>}
      </div>
      {d.envios.length === 0 ? (
        <EmptyState icon={<Mail />} title="Nenhum lembrete enviado" description="Os envios da régua aparecem aqui, com erro quando o servidor de e-mail recusou." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                <th className="py-2 pr-3 font-medium">Quando</th>
                <th className="py-2 pr-3 font-medium">Sacado</th>
                <th className="py-2 pr-3 font-medium">Para</th>
                <th className="py-2 pr-3 font-medium">Passo</th>
                <th className="py-2 pr-3 font-medium text-right">Valor</th>
                <th className="py-2 font-medium">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {d.envios.map((e) => (
                <tr key={e.id} className="border-b border-border-soft align-top">
                  <td className="py-2 pr-3 tabular-nums whitespace-nowrap">{formatInstantDateTime(e.em)}</td>
                  <td className="py-2 pr-3">
                    <Link href={`/cobranca/${e.entryId}`} className="font-medium hover:underline">
                      {e.sacadoNome}
                    </Link>
                    <span className="block text-[11px] text-fg-muted">{e.empresaNome}</span>
                  </td>
                  <td className="py-2 pr-3 text-fg-secondary">{e.para}</td>
                  <td className="py-2 pr-3 tabular-nums">{e.passo} dias</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{moeda(e.valorCentavos)}</td>
                  <td className="py-2">
                    {e.ok ? <Badge variant="success">Enviado</Badge> : <Badge variant="danger">Erro</Badge>}
                    {!e.ok && e.erro && <span className="block text-[11px] text-danger mt-1 max-w-[280px]">{e.erro}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
