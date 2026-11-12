"use server";

// Ações do termo aditivo em Word (funcionalidade-643, 12/11/2026): gravar os
// dados do contratante no cadastro (agir), gerar o termo (agir) e trocar o
// modelo do escritório (gerir).

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { logAudit } from "@/lib/audit";
import { getPrisma } from "@/lib/prisma";
import { nomeDeQuemFez } from "@/lib/honorarios/acesso";
import { ehAppError } from "@/lib/honorarios/servidor/erros";
import { lerFormularioDoContratante } from "@/lib/honorarios/termo/formulario";
import { TAMANHO_MAXIMO_DO_MODELO } from "@/lib/honorarios/termo/docx";
import { gerarTermo, salvarContratante, salvarModelo, type TermoGerado } from "@/lib/honorarios/termo/servidor";

const SEM_PERMISSAO = "Você não tem permissão para isso em Contratos e honorários.";

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

async function nomeDaEmpresa(tenantId: string, companyId: string) {
  const e = await getPrisma().company.findFirst({ where: { id: companyId, tenantId }, select: { name: true } });
  return e?.name ?? null;
}

/** O erro de regra volta como mensagem; o resto sobe. */
async function tentar<T>(fazer: () => Promise<Resultado<T>>): Promise<Resultado<T>> {
  try {
    return await fazer();
  } catch (err) {
    if (ehAppError(err)) return { ok: false, erro: err.message };
    throw err;
  }
}

/** Grava no cadastro o endereço da empresa, o sócio que assina e os contatos do contrato. */
export async function salvarDadosDoTermo(form: FormData): Promise<Resultado<{ socioId: string }>> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, erro: "Entre de novo no Connect." };
  if (!(await podeNoModulo(ctx, "controladoria_honorarios", "agir"))) return { ok: false, erro: SEM_PERMISSAO };
  const lido = lerFormularioDoContratante(form);
  if (!lido.ok) return { ok: false, erro: lido.erro };
  const entrada = lido.entrada;
  return tentar(async () => {
    const socioId = await salvarContratante(ctx.tenantId, entrada);
    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "honorario.termo.dados",
      entityType: "Company",
      entityId: entrada.companyId,
      metadata: { nome: await nomeDaEmpresa(ctx.tenantId, entrada.companyId), socioNovo: entrada.socioId === "novo" },
    });
    revalidatePath("/honorarios/termo", "layout");
    return { ok: true, socioId };
  });
}

/** Gera o termo com o cadastro de agora; volta o .docx para baixar. */
export async function gerarTermoAditivo(companyId: string, socioId: string | null): Promise<Resultado<TermoGerado>> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, erro: "Entre de novo no Connect." };
  if (!(await podeNoModulo(ctx, "controladoria_honorarios", "agir"))) return { ok: false, erro: SEM_PERMISSAO };
  if (typeof companyId !== "string" || !companyId) return { ok: false, erro: "Empresa não informada." };
  return tentar(async () => {
    const gerado = await gerarTermo(ctx.tenantId, companyId, socioId || null, { userId: ctx.userId, nome: await nomeDeQuemFez(ctx) });
    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "honorario.termo.gerar",
      entityType: "Company",
      entityId: companyId,
      metadata: { nome: await nomeDaEmpresa(ctx.tenantId, companyId), arquivo: gerado.nomeArquivo, nosArquivos: gerado.guardadoNosArquivos },
    });
    revalidatePath("/honorarios/termo", "layout");
    return { ok: true, ...gerado };
  });
}

/** Envia ou troca o modelo .docx do escritório (e a cidade da data). */
export async function salvarModeloDoTermo(form: FormData): Promise<Resultado<{ avisos: string[] }>> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, erro: "Entre de novo no Connect." };
  if (!(await podeNoModulo(ctx, "controladoria_honorarios", "gerir"))) return { ok: false, erro: SEM_PERMISSAO };
  const cidade = String(form.get("cidade") ?? "").trim().slice(0, 80);
  if (!cidade) return { ok: false, erro: "Informe a cidade que sai na data do termo." };
  const arquivo = form.get("modelo");
  let lido: { nome: string; bytes: Buffer } | null = null;
  if (arquivo instanceof File && arquivo.size > 0) {
    if (arquivo.size > TAMANHO_MAXIMO_DO_MODELO) return { ok: false, erro: "O modelo passa de 5 MB." };
    if (!/\.docx$/i.test(arquivo.name)) return { ok: false, erro: "O modelo precisa ser um arquivo .docx do Word." };
    lido = { nome: arquivo.name, bytes: Buffer.from(await arquivo.arrayBuffer()) };
  }
  return tentar(async () => {
    const avisos = await salvarModelo(ctx.tenantId, { arquivo: lido, cidade, enviadoPor: await nomeDeQuemFez(ctx) });
    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "honorario.termo.modelo",
      entityType: "Tenant",
      entityId: ctx.tenantId,
      metadata: { arquivo: lido?.nome ?? null, cidade },
    });
    revalidatePath("/honorarios/termo", "layout");
    return { ok: true, avisos };
  });
}
