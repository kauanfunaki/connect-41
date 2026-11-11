"use server";

// Ações de "Contratos e honorários". As regras são as do Aditiva Pronto
// (src/lib/honorarios/servidor); aqui ficam o gate do módulo, a validação da
// entrada, a Auditoria e o recarregar das telas.

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { logAudit } from "@/lib/audit";
import { getPrisma } from "@/lib/prisma";
import { nomeDeQuemFez, rodarAcao, type ResultadoDaAcao } from "@/lib/honorarios/acesso";
import { moeda } from "@/lib/honorarios/rotulos";
import { marcaSemPastaSchema, vincularPastaSchema } from "@/lib/honorarios/regras/auditPayload";
import { alterarMarcaSemPasta, alterarVinculo, solicitarSincronizacao } from "@/lib/honorarios/servidor/auditSyncService";
import { confirmarAcessorias, informarValor, removerValorInformado } from "@/lib/honorarios/servidor/honorariosService";
import { conferirTudo, enviarLote, enviarUma, liberarEnvios } from "@/lib/honorarios/servidor/acessoriasService";

const SEM_PERMISSAO = "Você não tem permissão para isso em Contratos e honorários.";

function recarregar() {
  revalidatePath("/honorarios", "layout");
}

async function nomeDaEmpresa(tenantId: string, companyId: string) {
  const e = await getPrisma().company.findFirst({ where: { id: companyId, tenantId }, select: { name: true } });
  return e?.name ?? null;
}

/** Pede ao robô uma nova varredura das pastas (ou devolve a que já está em andamento). */
export async function pedirVarredura(): Promise<ResultadoDaAcao> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, erro: "Entre de novo no Connect." };
  if (!(await podeNoModulo(ctx, "controladoria_honorarios", "agir"))) return { ok: false, erro: SEM_PERMISSAO };
  const r = await rodarAcao(ctx, async () => {
    const { job, criado } = await solicitarSincronizacao("manual");
    if (!criado) return "Já existe uma varredura em andamento.";
    await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "honorario.varredura", entityType: "HonorarioSyncJob", entityId: job.id });
    return "Varredura pedida. Ela começa quando o robô da rede responder.";
  });
  recarregar();
  return r;
}

/** Liga a pasta a uma empresa, marca como ignorada ou desfaz o vínculo. */
export async function mudarVinculoDaPasta(entrada: unknown): Promise<ResultadoDaAcao> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, erro: "Entre de novo no Connect." };
  if (!(await podeNoModulo(ctx, "controladoria_honorarios", "agir"))) return { ok: false, erro: SEM_PERMISSAO };
  const lido = vincularPastaSchema.safeParse(entrada);
  if (!lido.success) return { ok: false, erro: "Pedido inválido para a pasta." };
  const input = lido.data;
  const r = await rodarAcao(ctx, async () => {
    await alterarVinculo(input);
    if (input.acao === "vincular") {
      const nome = await nomeDaEmpresa(ctx.tenantId, input.companyId);
      await logAudit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "honorario.pasta.vincular",
        entityType: "Company",
        entityId: input.companyId,
        metadata: { nome, pasta: input.nomePasta },
      });
      return "Pasta vinculada.";
    }
    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: input.acao === "ignorar" ? "honorario.pasta.ignorar" : "honorario.pasta.desfazer",
      entityType: "HonorarioVinculoPasta",
      entityId: input.nomePasta.slice(0, 190),
      metadata: { nome: input.nomePasta },
    });
    return input.acao === "ignorar" ? "Pasta marcada como ignorada." : "Vínculo desfeito.";
  });
  recarregar();
  return r;
}

/** Marca a empresa como "sem pasta de propósito" (sai da auditoria) ou devolve. */
export async function mudarMarcaSemPasta(entrada: unknown): Promise<ResultadoDaAcao> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, erro: "Entre de novo no Connect." };
  if (!(await podeNoModulo(ctx, "controladoria_honorarios", "agir"))) return { ok: false, erro: SEM_PERMISSAO };
  const lido = marcaSemPastaSchema.safeParse(entrada);
  if (!lido.success) return { ok: false, erro: "Pedido inválido para a empresa." };
  const input = lido.data;
  const r = await rodarAcao(ctx, async () => {
    await alterarMarcaSemPasta(input);
    const nome = await nomeDaEmpresa(ctx.tenantId, input.companyId);
    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: input.acao === "marcar" ? "honorario.sem_pasta.marcar" : "honorario.sem_pasta.desmarcar",
      entityType: "Company",
      entityId: input.companyId,
      metadata: { nome, ...(input.acao === "marcar" && input.motivo ? { motivo: input.motivo } : {}) },
    });
    return input.acao === "marcar"
      ? "Empresa marcada como sem pasta. Ela saiu da auditoria."
      : "Marca removida. A empresa voltou para a auditoria.";
  });
  recarregar();
  return r;
}

const valorSchema = z.object({
  companyId: z.string().uuid(),
  valor: z.number().positive().max(1_000_000),
  documento: z.string().trim().max(1000).nullable(),
  observacao: z.string().trim().max(300).nullable(),
});

/** Informa (ou confirma) o honorário à mão. Ele vence o valor lido do documento. */
export async function informarHonorario(entrada: unknown): Promise<ResultadoDaAcao> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, erro: "Entre de novo no Connect." };
  if (!(await podeNoModulo(ctx, "controladoria_honorarios", "agir"))) return { ok: false, erro: SEM_PERMISSAO };
  const lido = valorSchema.safeParse(entrada);
  if (!lido.success) return { ok: false, erro: "Confira o valor: use um número maior que zero." };
  const d = lido.data;
  const conta = await nomeDeQuemFez(ctx);
  const r = await rodarAcao(ctx, async () => {
    await informarValor(conta, { ...d, documento: d.documento || null, observacao: d.observacao || null });
    const nome = await nomeDaEmpresa(ctx.tenantId, d.companyId);
    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "honorario.informar",
      entityType: "Company",
      entityId: d.companyId,
      metadata: { nome, valor: d.valor, ...(d.documento ? { documento: d.documento } : {}) },
    });
    return "Valor informado.";
  });
  recarregar();
  return r;
}

/** Tira o valor informado à mão: a empresa volta ao valor lido do documento. */
export async function removerHonorarioInformado(companyId: string): Promise<ResultadoDaAcao> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, erro: "Entre de novo no Connect." };
  if (!(await podeNoModulo(ctx, "controladoria_honorarios", "agir"))) return { ok: false, erro: SEM_PERMISSAO };
  if (!z.string().uuid().safeParse(companyId).success) return { ok: false, erro: "Empresa inválida." };
  const r = await rodarAcao(ctx, async () => {
    await removerValorInformado(companyId);
    const nome = await nomeDaEmpresa(ctx.tenantId, companyId);
    await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "honorario.remover", entityType: "Company", entityId: companyId, metadata: { nome } });
    return "Valor informado removido.";
  });
  recarregar();
  return r;
}

const acessoriasCertoSchema = z.object({
  companyId: z.string().uuid(),
  valorEsperado: z.number().positive(),
  observacao: z.string().trim().max(300).nullable(),
});

/**
 * "Acessórias está certo": passa a valer o valor da última leitura do
 * Acessórias guardada no Connect. Nada é enviado ao Acessórias.
 */
export async function usarValorDoAcessorias(entrada: unknown): Promise<ResultadoDaAcao> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, erro: "Entre de novo no Connect." };
  if (!(await podeNoModulo(ctx, "controladoria_honorarios", "agir"))) return { ok: false, erro: SEM_PERMISSAO };
  const lido = acessoriasCertoSchema.safeParse(entrada);
  if (!lido.success) return { ok: false, erro: "Pedido inválido." };
  const d = lido.data;
  const conta = await nomeDeQuemFez(ctx);
  const r = await rodarAcao(ctx, async () => {
    const valor = await confirmarAcessorias(conta, { ...d, observacao: d.observacao || null });
    const nome = await nomeDaEmpresa(ctx.tenantId, d.companyId);
    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "honorario.acessorias_certo",
      entityType: "Company",
      entityId: d.companyId,
      metadata: { nome, valor },
    });
    return `${nome ?? "Empresa"}: vale o valor do Acessórias (${moeda(valor)}).`;
  });
  recarregar();
  return r;
}

// ── Acessórias (F4) ─────────────────────────────────────────────────

/** IP de quem enviou, como o Aditiva guardava no histórico (atrás do proxy do EasyPanel). */
async function ipDoPedido(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

/** Lê todas as empresas do Acessórias (em segundo plano) para comparar com o honorário do Connect. */
export async function conferirNoAcessorias(): Promise<ResultadoDaAcao> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, erro: "Entre de novo no Connect." };
  if (!(await podeNoModulo(ctx, "controladoria_honorarios", "agir"))) return { ok: false, erro: SEM_PERMISSAO };
  const conta = await nomeDeQuemFez(ctx);
  const r = await rodarAcao(ctx, async () => {
    await conferirTudo(conta);
    await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "honorario.acessorias.conferir", entityType: "Company", entityId: "acessorias" });
    return "Conferência com o Acessórias começou. O andamento aparece no quadro do Acessórias.";
  });
  recarregar();
  return r;
}

const envioSchema = z.object({ companyId: z.string().uuid(), valorEsperado: z.number().positive() });

/** Atualiza o honorário de UMA empresa no Acessórias, com a ficha lida antes e depois. */
export async function enviarAoAcessorias(entrada: unknown): Promise<ResultadoDaAcao & { resultado?: "ok" | "erro" | "ignorado" }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, erro: "Entre de novo no Connect." };
  if (!(await podeNoModulo(ctx, "controladoria_honorarios", "gerir"))) return { ok: false, erro: SEM_PERMISSAO };
  const lido = envioSchema.safeParse(entrada);
  if (!lido.success) return { ok: false, erro: "Pedido inválido." };
  const { companyId, valorEsperado } = lido.data;
  const [conta, ip] = await Promise.all([nomeDeQuemFez(ctx), ipDoPedido()]);
  let resultado: "ok" | "erro" | "ignorado" | undefined;
  const r = await rodarAcao(ctx, async () => {
    const envio = await enviarUma(conta, ip, companyId, valorEsperado);
    resultado = envio.status;
    const nome = await nomeDaEmpresa(ctx.tenantId, companyId);
    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "honorario.acessorias.enviar",
      entityType: "Company",
      entityId: companyId,
      metadata: { nome, valor: valorEsperado, resultado: envio.status },
    });
    return envio.mensagem;
  });
  recarregar();
  return { ...r, ...(resultado ? { resultado } : {}) };
}

const loteSchema = z.object({ itens: z.array(envioSchema).min(1).max(1000) });

/** Começa o envio em lote ao Acessórias (em segundo plano). */
export async function enviarLoteAoAcessorias(entrada: unknown): Promise<ResultadoDaAcao> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, erro: "Entre de novo no Connect." };
  if (!(await podeNoModulo(ctx, "controladoria_honorarios", "gerir"))) return { ok: false, erro: SEM_PERMISSAO };
  const lido = loteSchema.safeParse(entrada);
  if (!lido.success) return { ok: false, erro: "Pedido inválido." };
  const [conta, ip] = await Promise.all([nomeDeQuemFez(ctx), ipDoPedido()]);
  const r = await rodarAcao(ctx, async () => {
    const n = await enviarLote(conta, ip, lido.data.itens);
    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "honorario.acessorias.lote",
      entityType: "Company",
      entityId: "acessorias",
      metadata: { empresas: n },
    });
    return `Envio de ${n} empresa(s) começou. O andamento aparece no quadro do Acessórias.`;
  });
  recarregar();
  return r;
}

/** "Já conferi no Acessórias": libera os envios travados por um envio que mexeu em outros campos. */
export async function liberarEnviosAoAcessorias(envioId: string): Promise<ResultadoDaAcao> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, erro: "Entre de novo no Connect." };
  if (!(await podeNoModulo(ctx, "controladoria_honorarios", "gerir"))) return { ok: false, erro: SEM_PERMISSAO };
  if (!z.string().uuid().safeParse(envioId).success) return { ok: false, erro: "Envio inválido." };
  const conta = await nomeDeQuemFez(ctx);
  const r = await rodarAcao(ctx, async () => {
    const envio = await getPrisma().honorarioAcessoriasEnvio.findFirst({ where: { id: envioId, tenantId: ctx.tenantId }, select: { companyId: true, razaoSocial: true } });
    await liberarEnvios(conta, envioId);
    if (envio) {
      await logAudit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "honorario.acessorias.liberar",
        entityType: "Company",
        entityId: envio.companyId,
        metadata: { nome: envio.razaoSocial },
      });
    }
    return "Envios liberados.";
  });
  recarregar();
  return r;
}
