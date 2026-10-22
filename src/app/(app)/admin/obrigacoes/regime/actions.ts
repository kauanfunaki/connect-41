"use server";

// Os modelos de obrigação por regime (22/10/2026) — ver src/lib/obrigacoes.
// Quem mexe: o administrador, e o gestor do setor nos modelos do setor dele
// (`canManageSector`, como as tags). Desligar no lugar de excluir: o que o
// modelo já gerou é histórico da carteira.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { feriadosDoEscritorio } from "@/lib/feriados";
import { hojeIso, dataBR } from "@/lib/datas/calendario";
import { proximasOcorrencias, rotuloDaCompetencia } from "@/lib/obrigacoes/calendario";
import { lerModeloDoForm, type DadosDoModelo } from "@/lib/obrigacoes/formulario";
import { carregarCarteira, empresasQueAtendem, gerarObrigacoesPorRegime } from "@/lib/obrigacoes/geracao";

export type ModeloState = { error: string } | null;

const LISTA = "/admin/obrigacoes/regime";

function colunas(d: DadosDoModelo, sectorCode: string) {
  return {
    nome: d.nome,
    descricao: d.descricao,
    sectorCode,
    pipelineId: d.pipelineId,
    periodicidade: d.datas.periodicidade,
    mesesAposCompetencia: d.datas.mesesAposCompetencia,
    diaLegal: d.datas.diaLegal,
    diasUteisAntes: d.datas.diasUteisAntes,
    ajuste: d.datas.ajuste,
    regimes: d.aplicacao.regimes,
    semMovimento: d.aplicacao.semMovimento,
    comFuncionarios: d.aplicacao.comFuncionarios,
    estados: d.aplicacao.estados,
    cidades: d.aplicacao.cidades,
    exigeSetorContratado: d.aplicacao.exigeSetorContratado,
  };
}

/** O que vai para a auditoria: a regra inteira, legível. */
function detalhes(d: DadosDoModelo) {
  return { nome: d.nome, pipelineId: d.pipelineId, ...d.datas, ...d.aplicacao };
}

/** Gera na hora para o modelo salvo; a falha não desfaz o salvar — o agendador tenta de novo em 15 minutos. */
async function gerarAgora(tenantId: string, modeloId: string) {
  try {
    const r = await gerarObrigacoesPorRegime({ tenantId, modeloId });
    if (r.criadas || r.removidas || r.reprogramadas) console.log("[obrigacoes] geração ao salvar", modeloId, r);
  } catch (err) {
    console.error("[obrigacoes] geração ao salvar", modeloId, err);
  }
}

export async function criarModelo(_prev: ModeloState, form: FormData): Promise<ModeloState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  const lido = lerModeloDoForm(form);
  if ("error" in lido) return lido;
  const d = lido.dados;

  const prisma = getPrisma();
  // O setor vem do kanban (não do form), como na obrigação recorrente.
  const pipeline = await prisma.pipeline.findFirst({ where: { id: d.pipelineId, tenantId: ctx.tenantId, active: true } });
  if (!pipeline) return { error: "Kanban não encontrado." };
  if (!canManageSector(ctx, pipeline.sectorCode)) return { error: "Sem permissão para criar obrigações deste setor." };

  const modelo = await prisma.modeloDeObrigacao.create({ data: { tenantId: ctx.tenantId, ...colunas(d, pipeline.sectorCode) } });
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "obrigacaoModelo.create",
    entityType: "ModeloDeObrigacao",
    entityId: modelo.id,
    metadata: detalhes(d),
  });
  await gerarAgora(ctx.tenantId, modelo.id);

  revalidatePath(LISTA);
  redirect(LISTA);
}

export async function atualizarModelo(_prev: ModeloState, form: FormData): Promise<ModeloState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  const id = typeof form.get("id") === "string" ? (form.get("id") as string) : "";
  const lido = lerModeloDoForm(form);
  if ("error" in lido) return lido;
  const d = lido.dados;

  const prisma = getPrisma();
  const existente = await prisma.modeloDeObrigacao.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existente) return { error: "Obrigação não encontrada." };
  if (!canManageSector(ctx, existente.sectorCode)) return { error: "Sem permissão para editar obrigações deste setor." };
  const pipeline = await prisma.pipeline.findFirst({ where: { id: d.pipelineId, tenantId: ctx.tenantId } });
  if (!pipeline) return { error: "Kanban não encontrado." };
  if (!canManageSector(ctx, pipeline.sectorCode)) return { error: "Sem permissão para o setor deste kanban." };

  await prisma.modeloDeObrigacao.update({ where: { id }, data: colunas(d, pipeline.sectorCode) });
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "obrigacaoModelo.update",
    entityType: "ModeloDeObrigacao",
    entityId: id,
    metadata: detalhes(d),
  });
  await gerarAgora(ctx.tenantId, id);

  revalidatePath(LISTA);
  redirect(LISTA);
}

export async function alternarModelo(id: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return;
  const prisma = getPrisma();
  const existente = await prisma.modeloDeObrigacao.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existente || !canManageSector(ctx, existente.sectorCode)) return;

  await prisma.modeloDeObrigacao.update({ where: { id }, data: { active: !existente.active } });
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: existente.active ? "obrigacaoModelo.disable" : "obrigacaoModelo.enable",
    entityType: "ModeloDeObrigacao",
    entityId: id,
    metadata: { nome: existente.nome },
  });
  // Desligado: as futuras ainda abertas saem; ligado: as próximas nascem.
  await gerarAgora(ctx.tenantId, id);
  revalidatePath(LISTA);
}

export type PreviaDaRegra =
  | {
      total: number;
      empresas: { id: string; nome: string }[];
      /** Competências e datas das próximas ocorrências. */
      ocorrencias: { competencia: string; dataLegal: string; prazoInterno: string }[];
      /** Empresas que ficaram de fora só por não se saber se têm funcionários. */
      semDadoDeFuncionarios: number;
    }
  | { error: string };

/** A prévia antes de salvar: quantas e quais empresas a regra pega, e as próximas datas. */
export async function previaDaRegra(form: FormData): Promise<PreviaDaRegra> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  const lido = lerModeloDoForm(form, false);
  if ("error" in lido) return lido;
  const d = lido.dados;

  const prisma = getPrisma();
  let sectorCode = "";
  if (d.pipelineId) {
    const pipeline = await prisma.pipeline.findFirst({ where: { id: d.pipelineId, tenantId: ctx.tenantId }, select: { sectorCode: true } });
    if (!pipeline) return { error: "Kanban não encontrado." };
    sectorCode = pipeline.sectorCode;
  }
  if (sectorCode ? !canManageSector(ctx, sectorCode) : !canManageSector(ctx, ctx.sectors)) return { error: "Sem permissão." };

  const [carteira, feriados] = await Promise.all([carregarCarteira(ctx.tenantId), feriadosDoEscritorio(ctx.tenantId)]);
  // Sem kanban escolhido ainda, o filtro de setor contratado não tem setor: fica de fora da prévia.
  const regra = sectorCode ? d.aplicacao : { ...d.aplicacao, exigeSetorContratado: false };
  const pegas = empresasQueAtendem(carteira, regra, sectorCode);
  const semDadoDeFuncionarios =
    regra.comFuncionarios === "QUALQUER"
      ? 0
      : empresasQueAtendem(carteira, { ...regra, comFuncionarios: "QUALQUER" }, sectorCode).filter(
          (e) => e.taxHasEmployees === null && e.colaboradoresAtivos === 0
        ).length;

  return {
    total: pegas.length,
    empresas: pegas.map((e) => ({ id: e.id, nome: e.nome })),
    ocorrencias: proximasOcorrencias(d.datas, hojeIso(), new Set(feriados.keys())).map((o) => ({
      competencia: rotuloDaCompetencia(d.datas.periodicidade, o.competencia),
      dataLegal: dataBR(o.dataLegal),
      prazoInterno: dataBR(o.prazoInterno),
    })),
    semDadoDeFuncionarios,
  };
}
