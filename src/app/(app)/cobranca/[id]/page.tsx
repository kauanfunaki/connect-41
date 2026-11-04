import { notFound } from "next/navigation";
import { getAuthContext, canViewSector, canActOnSector, canManageSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { getSectorUsers } from "@/lib/sectorUsers";
import { formatInstantDate, formatInstantDateTime, formatarCompetencia } from "@/lib/format";
import { saoPauloParts } from "@/lib/agenda";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Selo, tomDaVariante } from "@/components/ui/Selo";
import { TOM_DA_SITUACAO } from "@/components/financeiro/tomDaSituacao";
import { Button } from "@/components/ui/Button";
import { SeloDaCobranca, SeloDoAcordo } from "@/components/cobranca/SeloDaCobranca";
import { RegistrarContato } from "@/components/cobranca/RegistrarContato";
import { AtribuirResponsavel } from "@/components/cobranca/AtribuirResponsavel";
import { CriarAcordo } from "@/components/cobranca/CriarAcordo";
import { AcaoComMotivo, DecisoesNoMenu } from "@/components/cobranca/AcaoComMotivo";
import { moeda } from "@/lib/financeiro/formato";
import { FAIXAS_DE_ATRASO } from "@/lib/financeiro/analise";
import {
  ROTULO_DO_CANAL,
  ROTULO_DO_RESULTADO,
  podeBaixarPorPerda,
  podeReverterPerda,
} from "@/lib/financeiro/cobranca/regras";
import { ROTULO_DO_MOTIVO } from "@/lib/financeiro/cobranca/regua";
import { carregarTitulo, configDaRegua, MODULO_DE_COBRANCA, type AcordoMontado } from "@/lib/financeiro/cobranca/consultas";
import { baixarPorPerda, reverterPerda } from "../actions";

export const dynamic = "force-dynamic";

const MODULE = MODULO_DE_COBRANCA;
const SECTOR = getModuleDef(MODULE)!.sectorCode;

const ROTULO_DO_EVENTO: Record<string, string> = {
  RESPONSAVEL_ALTERADO: "Responsável alterado",
  RENEGOCIADO: "Renegociado em acordo",
  DEVOLVIDO_AO_ABERTO: "Acordo desfeito — de volta ao em aberto",
  PERDA: "Baixado por perda",
  PERDA_REVERTIDA: "Perda revertida",
  ACORDO_QUEBRADO: "Acordo marcado como quebrado",
};

/** O título na cobrança: dados, responsável, contato, acordo, perda e o histórico inteiro. */
export default async function TituloEmCobrancaPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) notFound();
  const setores = (await setoresDoModulo(ctx.tenantId, MODULE)) ?? [SECTOR];
  if (!canViewSector(ctx, setores) || !(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();
  const podeAgir = canActOnSector(ctx, setores);
  const gerencia = canManageSector(ctx, setores);

  const { id } = await params;
  const agora = new Date();
  const [t, usuarios, regua] = await Promise.all([
    carregarTitulo(ctx.tenantId, id, agora),
    getSectorUsers(ctx.tenantId, setores),
    configDaRegua(ctx.tenantId),
  ]);
  if (!t) notFound();
  const hojeKey = saoPauloParts(agora).dateKey;
  const l = t.linha;

  const statusDoAcordo = t.acordoDaParcela?.status ?? null;
  const perda = podeBaixarPorPerda(
    { kind: "RECEBER", status: t.status, closeReason: t.closeReason, paidAt: t.status === "PAGO" ? agora : null, vencimentoKey: l.vencimentoKey, statusDoAcordo },
    hojeKey
  );
  const reverter = podeReverterPerda({ status: t.status, closeReason: t.closeReason });
  const emAberto = t.status === "PROVISORIO" || t.status === "CONFERIDO";
  const candidatoAoAcordo = emAberto && t.candidatosAoAcordo.some((c) => c.id === l.id);

  // Contatos e eventos numa linha do tempo só, do mais recente para o mais antigo.
  const historico = [
    ...t.contatos.map((c) => ({ tipo: "contato" as const, em: c.em, ordem: c.registradoEm, c })),
    ...t.eventos.map((e) => ({ tipo: "evento" as const, em: e.em, ordem: e.em, e })),
  ].sort((a, b) => b.em.getTime() - a.em.getTime() || b.ordem.getTime() - a.ordem.getTime());

  return (
    <PageContainer>
      {/* Trilha no lugar do "← Voltar" (P04, 15/10/2026): o pai é sempre a Cobrança. */}
      <Breadcrumb items={[{ label: "Cobrança", href: "/cobranca" }, { label: l.sacadoNome, truncate: true }]} />
      <PageHeader
        title={l.sacadoNome}
        subtitle={
          <>
            {l.empresaNome} · {moeda(l.valorCentavos)} · venceu em {formatInstantDate(l.vencimento)} · competência {formatarCompetencia(t.competencia)}
          </>
        }
        meta={
          <>
            <SeloDaCobranca situacao={l.situacao} />
            {l.situacao === null && (
              <Selo tom={tomDaVariante(t.status === "PAGO" ? TOM_DA_SITUACAO.PAGA : TOM_DA_SITUACAO.CANCELADA)}>
                {t.status === "PAGO" ? "Pago" : "Cancelado"}
              </Selo>
            )}
            {emAberto && l.diasDeAtraso > 0 && (
              <span>
                {l.diasDeAtraso === 1 ? "1 dia" : `${l.diasDeAtraso} dias`} de atraso · {FAIXAS_DE_ATRASO.find((f) => f.chave === l.faixa)?.rotulo}
              </span>
            )}
            {l.descricao && <span>{l.descricao}</span>}
          </>
        }
      />

      {/* Duas colunas (Cobrança A, página de opções de 04/11/2026): à esquerda,
          "O que aconteceu agora?" e o histórico logo abaixo; à direita, o valor
          em aberto grande, quem cuida, o e-mail, o "Criar acordo" e a régua do
          sacado como trilho. Era uma pilha de cartões, com o formulário em
          quatro colunas no meio. Sem `order` de CSS: a leitura segue a tela. */}
      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          {t.perda && (
            <Card className="p-4 border-danger/40">
              <p className="text-ui">
                <strong>Baixado por perda</strong>
                {t.perda.em ? ` em ${formatInstantDate(t.perda.em)}` : ""}
                {t.perda.por ? ` por ${t.perda.por}` : ""}.
              </p>
              {t.perda.motivo && <p className="text-helper text-fg-secondary mt-1">“{t.perda.motivo}”</p>}
              <p className="text-micro text-fg-muted mt-1">
                A receita continua na competência {formatarCompetencia(t.competencia)}; a perda é despesa (outras despesas) na competência da data da perda.
              </p>
            </Card>
          )}

          {t.acordoDaParcela && <ResumoDoAcordoCard titulo="Parcela do acordo" acordo={t.acordoDaParcela} destaque={l.id} />}
          {t.acordoRenegociado && <ResumoDoAcordoCard titulo="Renegociado no acordo" acordo={t.acordoRenegociado} destaque={l.id} />}

          {podeAgir && (l.situacao !== null || t.closeReason === "PERDA") && t.closeReason !== "RENEGOCIADO" && (
            <Card as="section" aria-labelledby="registrar-contato" className="p-4 flex flex-col gap-3">
              <h2 id="registrar-contato" className="text-card-title font-semibold">
                O que aconteceu agora?
              </h2>
              <RegistrarContato entryId={l.id} hojeISO={hojeKey} />
            </Card>
          )}

          <Card className="p-4">
            <h2 className="text-card-title font-semibold mb-3">Histórico</h2>
            {historico.length === 0 ? (
              <p className="text-helper text-fg-muted">Nenhum contato registrado.</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {historico.map((h) =>
                  h.tipo === "contato" ? (
                    <li key={`c-${h.c.id}`} className="rounded-lg border border-border px-3 py-2 text-ui">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="tabular-nums font-medium">{formatInstantDate(h.c.em)}</span>
                        <span>{ROTULO_DO_CANAL[h.c.canal]}</span>
                        {/* O resultado classifica o contato (categoria), não é situação
                            que muda: fica no `Badge` (regra 2A, 08/10/2026). */}
                        <Badge variant={h.c.resultado === "CONTESTOU" ? "warning" : "info"}>{ROTULO_DO_RESULTADO[h.c.resultado]}</Badge>
                        {h.c.proximaAcao && <span className="text-fs-2 text-fg-muted">próxima ação {formatInstantDate(h.c.proximaAcao)}</span>}
                        <span className="text-micro text-fg-muted ml-auto">
                          {h.c.por ?? "—"} · registrado {formatInstantDateTime(h.c.registradoEm)}
                        </span>
                      </div>
                      {h.c.notas && <p className="text-body text-fg-secondary mt-1 whitespace-pre-wrap">{h.c.notas}</p>}
                    </li>
                  ) : (
                    <li key={`e-${h.e.id}`} className="px-3 py-1.5 text-fs-2 text-fg-secondary">
                      <span className="tabular-nums">{formatInstantDateTime(h.e.em)}</span> · {ROTULO_DO_EVENTO[h.e.tipo] ?? h.e.tipo}
                      {h.e.motivo ? ` — ${h.e.motivo}` : ""}
                      {h.e.por ? <span className="text-fg-muted"> · {h.e.por}</span> : null}
                    </li>
                  )
                )}
              </ol>
            )}
          </Card>

          {t.envios.length > 0 && (
            <Card className="p-4">
              <h2 className="text-card-title font-semibold mb-3">Lembretes da régua</h2>
              {/* Colunas fixas a partir de sm: com itens soltos, o e-mail e o selo
                  mudavam de lugar conforme a largura da data de cada linha. */}
              <ul className="flex flex-col gap-1.5 text-fs-2">
                {t.envios.map((e) => (
                  <li key={e.step} className="grid grid-cols-1 sm:grid-cols-[9.5rem_7.5rem_minmax(0,1fr)_auto] sm:items-center gap-x-3 gap-y-0.5">
                    <span className="tabular-nums">{formatInstantDateTime(e.sentAt)}</span>
                    <span>passo de {e.step} dias</span>
                    <span className="text-fg-muted truncate" title={e.to}>
                      {e.to}
                    </span>
                    <span>{e.ok ? <Selo tom="sucesso">Enviado</Selo> : <Selo tom="perigo">Erro</Selo>}</span>
                    {!e.ok && e.error && <span className="text-danger sm:col-span-4">{e.error}</span>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card as="section" aria-labelledby="em-aberto" className="p-4 flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 id="em-aberto" className="c41-rotulo">
                {emAberto ? "Em aberto" : "Valor do título"}
              </h2>
              <p className={`text-2xl font-semibold tabular-nums leading-tight ${emAberto && l.diasDeAtraso > 0 ? "text-danger" : "text-fg"}`}>
                {moeda(l.valorCentavos)}
              </p>
              <p className="text-fs-2 text-fg-muted">
                venceu em {formatInstantDate(l.vencimento)}
                {emAberto && l.diasDeAtraso > 0 && ` · ${l.diasDeAtraso === 1 ? "1 dia" : `${l.diasDeAtraso} dias`} de atraso`}
              </p>
            </div>
            <dl className="flex flex-col divide-y divide-border-soft text-ui">
              <div className="flex flex-col gap-1 py-2">
                <dt className="text-fs-2 text-fg-muted">Responsável</dt>
                <dd className="min-w-0">
                  {podeAgir ? <AtribuirResponsavel entryId={l.id} atual={l.responsavelId} usuarios={usuarios} /> : <span>{l.responsavelNome ?? "—"}</span>}
                </dd>
              </div>
              <div className="flex flex-col gap-1 py-2">
                <dt className="text-fs-2 text-fg-muted">E-mail do sacado</dt>
                <dd className="min-w-0">
                  {l.sacadoEmail ? (
                    <span className="block break-words">{l.sacadoEmail}</span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                      <span className="text-warning-fg">sem e-mail</span>
                      <Button href={`/fornecedores-e-sacados?empresa=${l.empresaId}&aba=sacados`} variant="secondary" size="xs">
                        Cadastrar e-mail
                      </Button>
                    </div>
                  )}
                </dd>
              </div>
            </dl>
            {podeAgir && (
              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border-soft">
                {candidatoAoAcordo && (
                  <CriarAcordo
                    sacadoNome={l.sacadoNome}
                    hojeISO={hojeKey}
                    selecionadoInicial={l.id}
                    candidatos={t.candidatosAoAcordo.map((c) => ({
                      id: c.id,
                      valorCentavos: c.valorCentavos,
                      vencimentoLabel: formatInstantDate(c.vencimento),
                      descricao: c.descricao,
                      competencia: c.competencia,
                    }))}
                  />
                )}
                {/* Baixar por perda encerra o título: vai no "⋯", em vermelho, com
                    a janela do motivo (11A, 15/10/2026). */}
                {gerencia && perda.pode && (
                  <DecisoesNoMenu
                    rotulo="Mais ações do título"
                    size="md"
                    decisoes={[
                      {
                        rotulo: "Baixar por perda",
                        variante: "danger",
                        titulo: "Baixa por perda",
                        descricao: `${l.sacadoNome} · ${moeda(l.valorCentavos)}. O título sai do em aberto e do aging; a receita da competência ${formatarCompetencia(t.competencia)} não muda, e a perda entra como despesa neste mês.`,
                        confirmar: "Baixar por perda",
                        motivoObrigatorio: true,
                        ajuda: "Fica registrado no histórico do título.",
                        acao: baixarPorPerda.bind(null, l.id),
                      },
                    ]}
                  />
                )}
                {gerencia && reverter.pode && (
                  <AcaoComMotivo
                    rotulo="Reverter perda"
                    tamanho="sm"
                    titulo="Reverter baixa por perda"
                    descricao="O título volta ao em aberto e à fila, e a perda sai da DRE econômica."
                    confirmar="Reverter"
                    acao={reverterPerda.bind(null, l.id)}
                  />
                )}
                {!gerencia && (perda.pode || reverter.pode) && <span className="text-micro text-fg-muted">Baixa e reversão por perda são da coordenação.</span>}
                {emAberto && !perda.pode && l.diasDeAtraso > 0 && gerencia && <span className="text-micro text-fg-muted">{perda.motivo}</span>}
              </div>
            )}
          </Card>

          <ReguaDoSacado
            passos={regua.passos}
            ligada={regua.ligada}
            diasDeAtraso={l.diasDeAtraso}
            enviados={t.envios.map((e) => ({ passo: e.step, ok: e.ok }))}
            hoje={l.regua.enviar}
            pausa={l.regua.enviar === null ? ROTULO_DO_MOTIVO[l.regua.motivo] : null}
          />
        </div>
      </div>
    </PageContainer>
  );
}

/**
 * A régua deste sacado como trilho (Cobrança A, 04/11/2026): cada passo da
 * régua do escritório com o que aconteceu — enviado, com erro, o de hoje, o
 * que vem, ou ficou para trás sem envio. Era só a frase "passo de N dias na
 * próxima execução".
 */
function ReguaDoSacado({
  passos,
  ligada,
  diasDeAtraso,
  enviados,
  hoje,
  pausa,
}: {
  passos: number[];
  ligada: boolean;
  diasDeAtraso: number;
  enviados: { passo: number; ok: boolean }[];
  /** O passo que sai hoje, se sai. */
  hoje: number | null;
  /** Por que não sai nada hoje ("Pausada: em acordo"). */
  pausa: string | null;
}) {
  const ordenados = [...new Set(passos)].sort((a, b) => a - b);
  const proximo = ordenados.find((p) => p > diasDeAtraso && !enviados.some((e) => e.passo === p)) ?? null;
  const falta = proximo !== null ? proximo - diasDeAtraso : 0;
  const frases = [
    pausa,
    hoje !== null ? `O lembrete de ${hoje} dias sai na próxima execução.` : null,
    hoje === null && proximo !== null ? `Próximo: ${proximo} dias de atraso, em ${falta} ${falta === 1 ? "dia" : "dias"}.` : null,
  ].filter(Boolean);
  return (
    <Card as="section" aria-labelledby="regua-do-sacado" className="p-4 flex flex-col gap-3">
      <h2 id="regua-do-sacado" className="text-card-title font-semibold">
        Régua deste sacado
      </h2>
      {!ligada ? (
        <p className="text-fs-2 text-fg-muted">A régua de lembretes está desligada no escritório.</p>
      ) : (
        <>
          <ol className="flex flex-wrap items-center gap-1.5" aria-label="Passos da régua">
            {ordenados.map((p, i) => {
              const envio = enviados.find((e) => e.passo === p);
              const [tom, texto]: ["sucesso" | "perigo" | "marca" | "neutro", string] = envio
                ? envio.ok
                  ? ["sucesso", `✓ ${p} dias`]
                  : ["perigo", `✕ ${p} dias`]
                : hoje === p
                  ? ["marca", `${p} dias · hoje`]
                  : p <= diasDeAtraso
                    ? ["neutro", `${p} dias · não saiu`]
                    : ["neutro", `◷ ${p} dias`];
              return (
                <li key={p} className="flex items-center gap-1.5">
                  {i > 0 && <span aria-hidden className="h-px w-2.5 bg-border" />}
                  <Selo tom={tom}>{texto}</Selo>
                </li>
              );
            })}
          </ol>
          {frases.length > 0 && <p className="text-fs-2 text-fg-muted">{frases.join(" ")}</p>}
          <p className="text-micro text-fg-muted">Os e-mails param sozinhos com acordo, contestação ou promessa de pagamento.</p>
        </>
      )}
    </Card>
  );
}

function ResumoDoAcordoCard({ titulo, acordo, destaque }: { titulo: string; acordo: AcordoMontado; destaque: string }) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <h2 className="text-card-title font-semibold">{titulo}</h2>
          <SeloDoAcordo status={acordo.status} />
        </div>
        <Button href={`/cobranca?aba=acordos&empresa=${acordo.empresaId}`} variant="secondary" size="xs">
          Ver nos acordos
        </Button>
      </div>
      <p className="text-fs-2 text-fg-muted tabular-nums mb-2">
        {formatInstantDate(acordo.acordadoEm)} · originais {moeda(acordo.originalCentavos)} → acordado {moeda(acordo.acordadoCentavos)} ·{" "}
        {acordo.resumo.pagas}/{acordo.resumo.total} pagas · {moeda(acordo.resumo.emAbertoCentavos)} em aberto
      </p>
      <ul className="flex flex-col gap-1 text-fs-2">
        {acordo.parcelas.map((p, i) => (
          // Colunas fixas: número, vencimento e valor caem um embaixo do outro.
          <li
            key={p.id}
            className={`grid grid-cols-[2.5rem_5.5rem_minmax(0,7rem)_auto] items-center justify-start gap-3 tabular-nums ${p.id === destaque ? "font-semibold" : ""}`}
          >
            <span>
              {i + 1}/{acordo.parcelas.length}
            </span>
            <span>{formatInstantDate(p.vencimento)}</span>
            <span className="text-right">{moeda(p.valorCentavos)}</span>
            {p.pagoEm ? (
              <Selo tom={tomDaVariante(TOM_DA_SITUACAO.PAGA)}>Paga</Selo>
            ) : p.closeReason === "PERDA" ? (
              <Selo tom={tomDaVariante(TOM_DA_SITUACAO.PERDA)}>Perda</Selo>
            ) : p.closeReason === "RENEGOCIADO" ? (
              <Selo tom={tomDaVariante(TOM_DA_SITUACAO.RENEGOCIADA)}>Renegociada</Selo>
            ) : p.status === "CANCELADO" ? (
              <Selo tom={tomDaVariante(TOM_DA_SITUACAO.CANCELADA)}>Cancelada</Selo>
            ) : p.id === destaque ? null : (
              <Button href={`/cobranca/${p.id}`} variant="ghost" size="xs">
                Abrir
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
