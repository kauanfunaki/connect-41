"use server";

// Ações do Planejamento tributário (05/11/2026): criar, salvar, lixeira,
// restaurar e abrir uma versão antiga. Toda gravação confere o módulo no
// nível "agir" (quem só vê não grava), valida os dados com o `studySchema` do
// motor e vai para a auditoria. Salvar e lixeira exigem a revisão que a tela
// leu: outra sessão no meio é recusada, sem gravar por cima.

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { logAudit } from "@/lib/audit";
import type { Study } from "@/lib/tributario/avaliacao/model";
import { novaAvaliacao, validarAvaliacao, ROTA_DO_PLANEJAMENTO, type ModoDaAvaliacao } from "@/lib/tributario/regras";
import {
  criarAvaliacao,
  dadosDaVersao,
  empresaParaAvaliacao,
  mudarLixeira,
  salvarAvaliacao,
} from "@/lib/tributario/servidor";

export type ResultadoDoPlanejamento = { error: string } | { ok: true; id?: string; revisao?: number };

const SESSAO_EXPIRADA = "Sessão expirada. Entre de novo.";
const SEM_PERMISSAO = "Você não pode alterar avaliações do Planejamento tributário.";

/** Anos aceitos para os dados da avaliação (o motor projeta 2027–2033). */
const ANO_MINIMO = 2020;
const ANO_MAXIMO = 2033;

export async function criarAvaliacaoTributaria(entrada: {
  modo: unknown;
  ano: unknown;
  companyId: unknown;
  prospecto: unknown;
}): Promise<ResultadoDoPlanejamento> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: SESSAO_EXPIRADA };
  if (!(await podeNoModulo(ctx, "contabil_planejamento", "agir"))) return { error: SEM_PERMISSAO };

  const modo: ModoDaAvaliacao = entrada.modo === "guiada" ? "guiada" : "rapida";
  const ano = Number(entrada.ano);
  if (!Number.isInteger(ano) || ano < ANO_MINIMO || ano > ANO_MAXIMO) return { error: "Escolha o ano dos dados." };

  const companyId = typeof entrada.companyId === "string" && entrada.companyId ? entrada.companyId : null;
  let estudo: Study;
  if (companyId) {
    const empresa = await empresaParaAvaliacao(ctx.tenantId, companyId);
    if (!empresa) return { error: "Empresa não encontrada." };
    estudo = novaAvaliacao(modo, ano, { empresa });
  } else {
    const prospecto = typeof entrada.prospecto === "string" ? entrada.prospecto.trim() : "";
    if (!prospecto) return { error: "Escolha uma empresa ou digite o nome do prospecto." };
    estudo = novaAvaliacao(modo, ano, { prospecto });
  }

  const { id } = await criarAvaliacao(ctx.tenantId, ctx.userId, estudo, companyId);
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "contabil.avaliacao_tributaria.criar",
    entityType: "AvaliacaoTributaria",
    entityId: id,
    metadata: { nome: estudo.name },
  });
  revalidatePath(ROTA_DO_PLANEJAMENTO);
  return { ok: true, id };
}

export async function salvarAvaliacaoTributaria(id: string, revisaoLida: number, dados: unknown): Promise<ResultadoDoPlanejamento> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: SESSAO_EXPIRADA };
  if (!(await podeNoModulo(ctx, "contabil_planejamento", "agir"))) return { error: SEM_PERMISSAO };
  if (typeof id !== "string" || !id || !Number.isInteger(revisaoLida)) return { error: "Avaliação inválida." };

  const validacao = validarAvaliacao(dados);
  if (!validacao.ok) return { error: validacao.error };

  const r = await salvarAvaliacao(ctx.tenantId, ctx.userId, id, revisaoLida, validacao.estudo);
  if (!r.ok) return { error: r.error };

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "contabil.avaliacao_tributaria.salvar",
    entityType: "AvaliacaoTributaria",
    entityId: id,
    metadata: { nome: validacao.estudo.name, revisao: r.revisao },
  });
  revalidatePath(ROTA_DO_PLANEJAMENTO);
  revalidatePath(`${ROTA_DO_PLANEJAMENTO}/${id}`);
  return { ok: true, id, revisao: r.revisao };
}

async function lixeira(id: string, revisaoLida: number, paraLixeira: boolean): Promise<ResultadoDoPlanejamento> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: SESSAO_EXPIRADA };
  if (!(await podeNoModulo(ctx, "contabil_planejamento", "agir"))) return { error: SEM_PERMISSAO };
  if (typeof id !== "string" || !id || !Number.isInteger(revisaoLida)) return { error: "Avaliação inválida." };

  const r = await mudarLixeira(ctx.tenantId, ctx.userId, id, revisaoLida, paraLixeira);
  if (!r.ok) return { error: r.error };

  if (paraLixeira) {
    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "contabil.avaliacao_tributaria.lixeira",
      entityType: "AvaliacaoTributaria",
      entityId: id,
    });
  } else {
    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "contabil.avaliacao_tributaria.restaurar",
      entityType: "AvaliacaoTributaria",
      entityId: id,
    });
  }
  revalidatePath(ROTA_DO_PLANEJAMENTO);
  revalidatePath(`${ROTA_DO_PLANEJAMENTO}/${id}`);
  return { ok: true, id, revisao: r.revisao };
}

export async function moverAvaliacaoParaLixeira(id: string, revisaoLida: number): Promise<ResultadoDoPlanejamento> {
  return lixeira(id, revisaoLida, true);
}

export async function restaurarAvaliacao(id: string, revisaoLida: number): Promise<ResultadoDoPlanejamento> {
  return lixeira(id, revisaoLida, false);
}

/** Os dados de uma versão antiga, para a tela abrir como rascunho não salvo. Só leitura. */
export async function abrirVersaoDaAvaliacao(
  id: string,
  versaoId: string,
): Promise<{ error: string } | { ok: true; estudo: Study }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: SESSAO_EXPIRADA };
  if (!(await podeNoModulo(ctx, "contabil_planejamento", "ver"))) return { error: "Você não pode abrir esta avaliação." };
  const estudo = await dadosDaVersao(ctx.tenantId, id, versaoId);
  if (!estudo) return { error: "Versão não encontrada." };
  return { ok: true, estudo };
}
