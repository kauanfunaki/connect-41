import { notFound } from "next/navigation";
import { getAuthContext, canViewSector, canActOnSector, canManageSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { getSectorUsers } from "@/lib/sectorUsers";
import { formatInstantDate, formatInstantDateTime, formatarCompetencia } from "@/lib/format";
import { saoPauloParts } from "@/lib/agenda";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Selo, tomDaVariante } from "@/components/ui/Selo";
import { TOM_DA_SITUACAO } from "@/components/financeiro/tomDaSituacao";
import { Button } from "@/components/ui/Button";
import { SeloDaCobranca, SeloDoAcordo } from "@/components/cobranca/SeloDaCobranca";
import { RegistrarContato } from "@/components/cobranca/RegistrarContato";
import { AtribuirResponsavel } from "@/components/cobranca/AtribuirResponsavel";
import { CriarAcordo } from "@/components/cobranca/CriarAcordo";
import { AcaoComMotivo } from "@/components/cobranca/AcaoComMotivo";
import { moeda } from "@/lib/financeiro/formato";
import { FAIXAS_DE_ATRASO } from "@/lib/financeiro/analise";
import {
  ROTULO_DO_CANAL,
  ROTULO_DO_RESULTADO,
  podeBaixarPorPerda,
  podeReverterPerda,
} from "@/lib/financeiro/cobranca/regras";
import { ROTULO_DO_MOTIVO } from "@/lib/financeiro/cobranca/regua";
import { carregarTitulo, MODULO_DE_COBRANCA, type AcordoMontado } from "@/lib/financeiro/cobranca/consultas";
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
  const setor = (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR;
  if (!canViewSector(ctx, setor) || !(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();
  const podeAgir = canActOnSector(ctx, setor);
  const gerencia = canManageSector(ctx, setor);

  const { id } = await params;
  const agora = new Date();
  const [t, usuarios] = await Promise.all([carregarTitulo(ctx.tenantId, id, agora), getSectorUsers(ctx.tenantId, setor)]);
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
      <BackButton className="mb-3" />
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

      {t.perda && (
        <Card className="p-4 mb-4 border-danger/40">
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

      <Card className="p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-ui">
          <div className="min-w-0">
            <span className="block text-helper text-fg-muted mb-1">Responsável</span>
            {podeAgir ? (
              <AtribuirResponsavel entryId={l.id} atual={l.responsavelId} usuarios={usuarios} />
            ) : (
              <span>{l.responsavelNome ?? "—"}</span>
            )}
          </div>
          <div className="min-w-0">
            <span className="block text-helper text-fg-muted mb-1">E-mail do sacado</span>
            {l.sacadoEmail ? (
              <span className="block break-words">{l.sacadoEmail}</span>
            ) : (
              // Revisão de 05/10: botão não é link — era "cadastrar" em texto azul.
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <span className="text-warning-fg">sem e-mail</span>
                <Button href={`/cadastros-financeiros?empresa=${l.empresaId}&aba=sacados`} variant="secondary" size="xs">
                  Cadastrar e-mail
                </Button>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <span className="block text-helper text-fg-muted mb-1">Régua</span>
            {l.regua.enviar !== null ? <span>passo de {l.regua.enviar} dias na próxima execução</span> : <span className="text-fg-secondary">{ROTULO_DO_MOTIVO[l.regua.motivo]}</span>}
          </div>
        </div>
        {podeAgir && (
          <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-border-soft">
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
            {gerencia && perda.pode && (
              <AcaoComMotivo
                rotulo="Baixar por perda"
                variante="danger"
                tamanho="sm"
                titulo="Baixa por perda"
                descricao={`${l.sacadoNome} · ${moeda(l.valorCentavos)}. O título sai do em aberto e do aging; a receita da competência ${formatarCompetencia(t.competencia)} não muda, e a perda entra como despesa neste mês.`}
                confirmar="Baixar por perda"
                motivoObrigatorio
                ajuda="Fica registrado no histórico do título."
                acao={baixarPorPerda.bind(null, l.id)}
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

      {t.acordoDaParcela && <ResumoDoAcordoCard titulo="Parcela do acordo" acordo={t.acordoDaParcela} destaque={l.id} />}
      {t.acordoRenegociado && <ResumoDoAcordoCard titulo="Renegociado no acordo" acordo={t.acordoRenegociado} destaque={l.id} />}

      {podeAgir && (l.situacao !== null || t.closeReason === "PERDA") && t.closeReason !== "RENEGOCIADO" && (
        <Card className="p-4 mb-4">
          <h2 className="text-card-title font-semibold mb-3">Registrar contato</h2>
          <RegistrarContato entryId={l.id} hojeISO={hojeKey} />
        </Card>
      )}

      {/* Seções em cartão com o título dentro, como "Registrar contato" e o
          acordo logo acima (08/10/2026): "Histórico" e "Lembretes da régua"
          eram os únicos títulos soltos no fundo da ficha. O contato registrado
          é um bloco de leitura: `rounded-lg`, como os cartões, e o corpo da
          anotação em 15px (o papel de mensagem na escala); data e autor
          continuam no tamanho de metadado. */}
      <Card className="p-4 mb-4">
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
        <Card className="p-4 mb-4">
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
    </PageContainer>
  );
}

function ResumoDoAcordoCard({ titulo, acordo, destaque }: { titulo: string; acordo: AcordoMontado; destaque: string }) {
  return (
    <Card className="p-4 mb-4">
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
