"use server";

// Modelos de documento do Societário (27/11/2026, funcionalidade-891).
//
// Quem pode:
// - modelos e o cadastro de advogados e testemunhas são configuração do
//   módulo: "gerir" (a coordenação do setor que opera o Societário, o
//   Administrador e o Super Admin), como os roteiros;
// - escolher quem assina no processo e gerar o documento é do dia a dia:
//   "agir" no módulo de processos.

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { logAudit } from "@/lib/audit";
import { getPrisma } from "@/lib/prisma";
import { nomeDeQuemFez } from "@/lib/honorarios/acesso";
import { LUGARES, ehPapel, ehTipoDeModelo, type Lugar } from "@/lib/societario/modelos/campos";
import { TAMANHO_MAXIMO_DO_MODELO, modeloDeExemplo } from "@/lib/societario/modelos/docx";
import {
  ErroDosModelos,
  arquivoDoModelo,
  ativarModelo,
  ativarParticipante,
  camposEmBrancoNoProcesso,
  definirParticipantesDoProcesso,
  excluirModelo,
  excluirParticipante,
  gerarDocumento,
  salvarModelo,
  salvarParticipante,
  type DocumentoGerado,
} from "@/lib/societario/modelos/servidor";

const MODULO = "societario_processos";
const SO_COORDENACAO = "Só a coordenação do Societário mexe nos modelos e no cadastro de advogados e testemunhas.";
const SEM_PERMISSAO = "Você não tem permissão para agir nos processos do Societário.";

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

async function tentar<T>(fazer: () => Promise<Resultado<T>>): Promise<Resultado<T>> {
  try {
    return await fazer();
  } catch (err) {
    if (err instanceof ErroDosModelos) return { ok: false, erro: err.message };
    throw err;
  }
}

async function contexto(nivel: "gerir" | "agir") {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return null;
  if (!(await podeNoModulo(ctx, MODULO, nivel))) return null;
  return ctx;
}

const texto = (form: FormData, campo: string, max: number) => String(form.get(campo) ?? "").trim().slice(0, max);
const opcional = (form: FormData, campo: string, max: number) => texto(form, campo, max) || null;

function revalidarModelos() {
  revalidatePath("/processos/modelos");
  revalidatePath("/processos/[id]", "page");
}

// ─── Modelos ────────────────────────────────────────────────────────────────

/** Envia um modelo novo ou edita um (nome, tipo e, se vier, o arquivo). */
export async function salvarModeloDeDocumento(form: FormData): Promise<Resultado<{ avisos: string[] }>> {
  const ctx = await contexto("gerir");
  if (!ctx) return { ok: false, erro: SO_COORDENACAO };
  const id = texto(form, "id", 64) || null;
  const tipo = texto(form, "tipo", 30);
  const nome = texto(form, "nome", 120);
  if (!ehTipoDeModelo(tipo)) return { ok: false, erro: "Escolha o tipo do documento." };
  if (!nome) return { ok: false, erro: "Dê um nome ao modelo, como “Alteração de endereço”." };
  const arquivo = form.get("arquivo");
  let lido: { nome: string; bytes: Buffer } | null = null;
  if (arquivo instanceof File && arquivo.size > 0) {
    if (arquivo.size > TAMANHO_MAXIMO_DO_MODELO) return { ok: false, erro: "O modelo passa de 5 MB." };
    if (!/\.docx$/i.test(arquivo.name)) return { ok: false, erro: "O modelo precisa ser um arquivo .docx do Word." };
    lido = { nome: arquivo.name, bytes: Buffer.from(await arquivo.arrayBuffer()) };
  }
  return tentar(async () => {
    const r = await salvarModelo(ctx.tenantId, { id, tipo, nome, arquivo: lido, enviadoPor: await nomeDeQuemFez(ctx) });
    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: id ? "societario.modelo.editado" : "societario.modelo.enviado",
      entityType: "SocietarioModeloDocumento",
      entityId: r.id,
      metadata: { nome, tipo, arquivo: lido?.nome ?? null },
    });
    revalidarModelos();
    return { ok: true, avisos: r.avisos };
  });
}

export async function ativarModeloDeDocumento(id: string, ativo: boolean): Promise<Resultado> {
  const ctx = await contexto("gerir");
  if (!ctx) return { ok: false, erro: SO_COORDENACAO };
  if (typeof id !== "string" || !id || typeof ativo !== "boolean") return { ok: false, erro: "Pedido inválido." };
  return tentar(async () => {
    const nome = await ativarModelo(ctx.tenantId, id, ativo);
    await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "societario.modelo.situacao", entityType: "SocietarioModeloDocumento", entityId: id, metadata: { nome, ativo } });
    revalidarModelos();
    return { ok: true };
  });
}

export async function excluirModeloDeDocumento(id: string): Promise<Resultado> {
  const ctx = await contexto("gerir");
  if (!ctx) return { ok: false, erro: SO_COORDENACAO };
  if (typeof id !== "string" || !id) return { ok: false, erro: "Pedido inválido." };
  return tentar(async () => {
    const nome = await excluirModelo(ctx.tenantId, id);
    await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "societario.modelo.excluido", entityType: "SocietarioModeloDocumento", entityId: id, metadata: { nome } });
    revalidarModelos();
    return { ok: true };
  });
}

/** O .docx guardado (para conferir o que está em uso). */
export async function baixarModeloDeDocumento(id: string): Promise<Resultado<{ nomeArquivo: string; conteudoBase64: string }>> {
  const ctx = await contexto("gerir");
  if (!ctx) return { ok: false, erro: SO_COORDENACAO };
  if (typeof id !== "string" || !id) return { ok: false, erro: "Pedido inválido." };
  const m = await arquivoDoModelo(ctx.tenantId, id);
  if (!m) return { ok: false, erro: "O modelo não existe mais. Recarregue a tela." };
  return { ok: true, nomeArquivo: m.nomeArquivo, conteudoBase64: m.conteudo.toString("base64") };
}

/** O modelo com todos os campos, para o escritório copiar para o dele. */
export async function baixarModeloDeExemplo(): Promise<Resultado<{ nomeArquivo: string; conteudoBase64: string }>> {
  const ctx = await contexto("gerir");
  if (!ctx) return { ok: false, erro: SO_COORDENACAO };
  return { ok: true, nomeArquivo: "Campos_dos_modelos_do_Connect.docx", conteudoBase64: modeloDeExemplo().toString("base64") };
}

// ─── Advogados e testemunhas ────────────────────────────────────────────────

export async function salvarParticipanteDoSocietario(form: FormData): Promise<Resultado> {
  const ctx = await contexto("gerir");
  if (!ctx) return { ok: false, erro: SO_COORDENACAO };
  const id = texto(form, "id", 64) || null;
  const papel = texto(form, "papel", 12);
  const nome = texto(form, "nome", 180);
  const cpf = texto(form, "cpf", 20).replace(/\D/g, "") || null;
  if (!ehPapel(papel)) return { ok: false, erro: "Escolha se é advogado ou testemunha." };
  if (!nome) return { ok: false, erro: "Informe o nome." };
  if (cpf && cpf.length !== 11) return { ok: false, erro: "O CPF tem 11 números." };
  return tentar(async () => {
    const salvo = await salvarParticipante(ctx.tenantId, {
      id,
      papel,
      nome,
      cpf,
      rg: opcional(form, "rg", 30),
      oab: opcional(form, "oab", 30),
      nacionalidade: opcional(form, "nacionalidade", 60),
      estadoCivil: opcional(form, "estadoCivil", 40),
      profissao: opcional(form, "profissao", 120),
      endereco: opcional(form, "endereco", 300),
    });
    await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "societario.participante.salvo", entityType: "SocietarioParticipante", entityId: salvo, metadata: { nome, papel, novo: id === null } });
    revalidarModelos();
    return { ok: true };
  });
}

export async function ativarParticipanteDoSocietario(id: string, ativo: boolean): Promise<Resultado> {
  const ctx = await contexto("gerir");
  if (!ctx) return { ok: false, erro: SO_COORDENACAO };
  if (typeof id !== "string" || !id || typeof ativo !== "boolean") return { ok: false, erro: "Pedido inválido." };
  return tentar(async () => {
    const nome = await ativarParticipante(ctx.tenantId, id, ativo);
    await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "societario.participante.situacao", entityType: "SocietarioParticipante", entityId: id, metadata: { nome, ativo } });
    revalidarModelos();
    return { ok: true };
  });
}

export async function excluirParticipanteDoSocietario(id: string): Promise<Resultado> {
  const ctx = await contexto("gerir");
  if (!ctx) return { ok: false, erro: SO_COORDENACAO };
  if (typeof id !== "string" || !id) return { ok: false, erro: "Pedido inválido." };
  return tentar(async () => {
    const nome = await excluirParticipante(ctx.tenantId, id);
    await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "societario.participante.excluido", entityType: "SocietarioParticipante", entityId: id, metadata: { nome } });
    revalidarModelos();
    return { ok: true };
  });
}

// ─── No processo ────────────────────────────────────────────────────────────

async function rotuloDoProcesso(tenantId: string, processId: string) {
  const p = await getPrisma().process.findFirst({ where: { id: processId, tenantId }, select: { number: true, company: { select: { name: true } } } });
  return p ? `processo ${p.number} · ${p.company.name}` : null;
}

/** O pedido da tela, só com os três lugares e ids de texto. */
function lugaresLimpos(escolhidos: unknown): Record<Lugar, string | null> {
  const e = (escolhidos && typeof escolhidos === "object" ? escolhidos : {}) as Record<string, unknown>;
  return Object.fromEntries(LUGARES.map((l) => [l, typeof e[l] === "string" && e[l] ? (e[l] as string).slice(0, 64) : null])) as Record<Lugar, string | null>;
}

/** Grava quem assina como advogado e testemunhas no processo. */
export async function definirQuemAssinaNoProcesso(processId: string, escolhidos: Record<Lugar, string | null>): Promise<Resultado> {
  const ctx = await contexto("agir");
  if (!ctx) return { ok: false, erro: SEM_PERMISSAO };
  if (typeof processId !== "string" || !processId || !escolhidos || typeof escolhidos !== "object") return { ok: false, erro: "Pedido inválido." };
  const limpos = lugaresLimpos(escolhidos);
  return tentar(async () => {
    await definirParticipantesDoProcesso(ctx.tenantId, processId, limpos);
    await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "societario.processo.participantes", entityType: "Process", entityId: processId, metadata: { nome: await rotuloDoProcesso(ctx.tenantId, processId) } });
    revalidatePath("/processos/[id]", "page");
    return { ok: true };
  });
}

/** O que vai sair em branco com o modelo escolhido — o aviso antes de gerar. */
export async function camposEmBrancoDoModelo(processId: string, modeloId: string, escolhidos: Record<Lugar, string | null>): Promise<Resultado<{ emBranco: string[] }>> {
  const ctx = await contexto("agir");
  if (!ctx) return { ok: false, erro: SEM_PERMISSAO };
  if (typeof processId !== "string" || !processId || typeof modeloId !== "string" || !modeloId) return { ok: false, erro: "Pedido inválido." };
  return { ok: true, emBranco: await camposEmBrancoNoProcesso(ctx.tenantId, processId, modeloId, lugaresLimpos(escolhidos)) };
}

/** Gera o documento com o cadastro de agora; volta o .docx para baixar. */
export async function gerarDocumentoDoModelo(processId: string, modeloId: string): Promise<Resultado<DocumentoGerado>> {
  const ctx = await contexto("agir");
  if (!ctx) return { ok: false, erro: SEM_PERMISSAO };
  if (typeof processId !== "string" || !processId || typeof modeloId !== "string" || !modeloId) return { ok: false, erro: "Escolha o modelo." };
  return tentar(async () => {
    const gerado = await gerarDocumento(ctx.tenantId, processId, modeloId, { userId: ctx.userId, nome: await nomeDeQuemFez(ctx) });
    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "societario.processo.documento_gerado",
      entityType: "Process",
      entityId: processId,
      metadata: { nome: await rotuloDoProcesso(ctx.tenantId, processId), arquivo: gerado.nomeArquivo, nosArquivos: gerado.guardadoNosArquivos },
    });
    revalidatePath("/processos/[id]", "page");
    return { ok: true, ...gerado };
  });
}
