"use server";

// A Receita pelo Serpro na ficha da empresa (Fase 1 do Integra Contador,
// 20/10/2026): pedir a situação fiscal e abrir uma mensagem da Caixa Postal.
// Cada action confere de novo quem pode — Server Function aceita POST direto.

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { acessoAsAutorizacoes } from "@/lib/autorizacoes/servidor";
import { pedirSituacaoFiscal } from "@/lib/serpro/situacaoFiscal";
import { emitirGuia } from "@/lib/serpro/emissaoDeGuia";
import { abrirMensagem, mensagemJaAberta, type MensagemAberta } from "@/lib/serpro/acompanhamento";

const ehId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/** Pede o relatório de situação fiscal (uma emissão, cobrada). Quem edita no Fiscal. */
export async function pedirSituacaoFiscalAction(companyId: unknown): Promise<{ ok: true; texto: string; pronto: boolean } | { ok: false; erro: string }> {
  const acesso = await acessoAsAutorizacoes(await getAuthContext());
  if (!acesso?.podeEditar) return { ok: false, erro: "Sem permissão para pedir a situação fiscal." };
  if (!ehId(companyId)) return { ok: false, erro: "Empresa não encontrada." };
  const r = await pedirSituacaoFiscal(acesso.tenantId, acesso.ctx.userId, companyId);
  revalidatePath(`/empresas/${companyId}`);
  return r;
}

/**
 * Emite uma guia federal pelo Serpro (Fase 2 enxuta, 27/10/2026): uma
 * emissão, cobrada; o PDF vai para a pasta Guias. Quem edita no Fiscal, como
 * a situação fiscal. Os campos vêm soltos da tela e são conferidos lá dentro.
 */
export async function emitirGuiaAction(companyId: unknown, campos: unknown): Promise<{ ok: true; texto: string; arquivoId: string } | { ok: false; erro: string }> {
  const acesso = await acessoAsAutorizacoes(await getAuthContext());
  if (!acesso?.podeEditar) return { ok: false, erro: "Sem permissão para emitir guias." };
  if (!ehId(companyId)) return { ok: false, erro: "Empresa não encontrada." };
  if (!campos || typeof campos !== "object" || Array.isArray(campos)) return { ok: false, erro: "Pedido inválido." };
  const r = await emitirGuia(acesso.tenantId, acesso.ctx.userId, companyId, campos as Record<string, unknown>);
  revalidatePath(`/empresas/${companyId}`);
  return r;
}

/**
 * Abre a mensagem — dá ciência da intimação, e o prazo começa a contar.
 * Decisão do Kauan em 20/10/2026: só a coordenação do Fiscal, e só depois
 * da confirmação na tela (`confirmado`).
 */
export async function abrirMensagemAction(mensagemId: unknown, confirmado: unknown): Promise<{ ok: true; mensagem: MensagemAberta } | { ok: false; erro: string }> {
  const acesso = await acessoAsAutorizacoes(await getAuthContext());
  if (!acesso?.podeConfigurar) return { ok: false, erro: "Só a coordenação do Fiscal abre mensagens da Caixa Postal: abrir dá ciência da intimação." };
  if (!ehId(mensagemId)) return { ok: false, erro: "Mensagem não encontrada." };
  if (confirmado !== true) return { ok: false, erro: "Confirme que a ciência da intimação começa a contar ao abrir." };
  const r = await abrirMensagem(acesso.tenantId, acesso.ctx.userId, mensagemId);
  if (r.ok) {
    revalidatePath("/autorizacoes/caixa-postal");
    revalidatePath("/empresas/[id]", "page");
  }
  return r;
}

/** Uma mensagem já aberta, do banco: não chama o Serpro nem dá ciência. Quem vê o Fiscal. */
export async function verMensagemAction(mensagemId: unknown): Promise<{ ok: true; mensagem: MensagemAberta } | { ok: false; erro: string }> {
  const acesso = await acessoAsAutorizacoes(await getAuthContext());
  if (!acesso) return { ok: false, erro: "Sem acesso." };
  if (!ehId(mensagemId)) return { ok: false, erro: "Mensagem não encontrada." };
  const mensagem = await mensagemJaAberta(acesso.tenantId, mensagemId);
  return mensagem ? { ok: true, mensagem } : { ok: false, erro: "Esta mensagem ainda não foi aberta." };
}
