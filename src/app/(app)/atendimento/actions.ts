"use server";

import { revalidatePath } from "next/cache";
import { contexto } from "@/lib/atendimento/contexto";
import * as cmd from "@/lib/atendimento/comandos";
import * as midia from "@/lib/atendimento/comandosDeMidia";
import * as contato from "@/lib/atendimento/comandosDeContato";
import { empresasParaVincular } from "@/lib/atendimento/consultas";

export type Resultado = { ok: true } | { ok: false; erro: string };

/** Roda o comando com a sessão e devolve a frase do erro para a tela, sem lançar. */
async function rodar(trabalho: (c: Awaited<ReturnType<typeof contexto>>) => Promise<unknown>, caminho = "/atendimento"): Promise<Resultado> {
  try {
    const c = await contexto();
    await trabalho(c);
    revalidatePath(caminho, "layout");
    return { ok: true };
  } catch (err) {
    const erro = err instanceof Error ? err.message : "Não deu certo. Tente de novo.";
    if (!(err instanceof Error)) console.error("[atendimento:acao]", err);
    return { ok: false, erro };
  }
}

export async function assumirAction(cicloId: string) {
  return rodar((c) => cmd.assumir(c, cicloId));
}

export async function responderAction(cicloId: string, texto: string) {
  return rodar((c) => cmd.responder(c, cicloId, texto));
}

export async function anotarAction(cicloId: string, texto: string) {
  return rodar((c) => cmd.anotar(c, cicloId, texto));
}

export async function encaminharAction(p: { cicloId: string; sectorCode: string; paraUserId: string | null; nota: string; avisarCliente: string | null }) {
  return rodar((c) => cmd.encaminhar(c, p));
}

export async function pedirEncaminhamentoAction(p: { cicloId: string; paraSector: string | null; motivo: string; avisarCliente: boolean }) {
  return rodar((c) => cmd.pedirEncaminhamento(c, p));
}

export async function decidirPedidoAction(p: { pedidoId: string; aprovar: boolean; sectorCode: string | null; nota: string }) {
  return rodar((c) => cmd.decidirPedido(c, p));
}

export async function transferirAction(cicloId: string, paraUserId: string) {
  return rodar((c) => cmd.transferir(c, cicloId, paraUserId));
}

export async function encerrarAction(p: Parameters<typeof cmd.encerrar>[1]) {
  return rodar((c) => cmd.encerrar(c, p));
}

export async function vincularContatoAction(
  p: { cicloId: string } & ({ tipo: "CLIENTE"; companyId: string } | { tipo: "NOVO" })
) {
  return rodar((c) => cmd.vincularContato(c, p));
}

/** As empresas para o "Quem é?". Falha devolve lista vazia, e a tela avisa. */
export async function empresasParaVincularAction() {
  try {
    const c = await contexto();
    return await empresasParaVincular(c);
  } catch {
    return [];
  }
}

// ─── Configurações ───────────────────────────────────────────────────────────

export async function salvarConfiguracaoAction(p: Parameters<typeof cmd.salvarConfiguracao>[1]) {
  return rodar((c) => cmd.salvarConfiguracao(c, p));
}

export async function criarDesfechoAction(label: string) {
  return rodar((c) => cmd.criarDesfecho(c, label));
}

export async function editarDesfechoAction(id: string, p: { label?: string; ativo?: boolean }) {
  return rodar((c) => cmd.editarDesfecho(c, id, p));
}

export async function reordenarDesfechosAction(ids: string[]) {
  return rodar((c) => cmd.reordenarDesfechos(c, ids));
}

export async function salvarMensagemPadraoAction(p: { id: string | null; titulo: string; sectorCode: string | null; texto: string; ativo: boolean }) {
  return rodar((c) => cmd.salvarMensagemPadrao(c, p));
}

export async function removerMensagemPadraoAction(id: string) {
  return rodar((c) => cmd.removerMensagemPadrao(c, id));
}

// ─── Modelos da Meta e convite para o portal (11/11/2026) ────────────────────

export async function retomarConversaAction(cicloId: string, modeloId: string, preenchidos: string[]) {
  return rodar((c) => midia.retomarConversa(c, cicloId, modeloId, preenchidos));
}

export async function convidarParaOPortalAction(p: { cicloId: string; nome: string; email: string }) {
  return rodar((c) => midia.convidarParaOPortal(c, p));
}

export async function salvarModeloAction(p: { id: string | null; rotulo: string; nomeNaMeta: string; idioma: string; texto: string; ativo: boolean }) {
  return rodar((c) => midia.salvarModelo(c, p));
}

export async function removerModeloAction(id: string) {
  return rodar((c) => midia.removerModelo(c, id));
}

// ─── Iniciar conversa, pedir para assumir, tirar da conversa (13/11/2026) ────

/** Os contatos para "Nova conversa". Falha devolve lista vazia, e a tela avisa. */
export async function buscarContatosAction(termo: string) {
  try {
    const c = await contexto();
    return await contato.buscarContatos(c, termo);
  } catch (err) {
    console.error("[atendimento:busca]", err);
    return [];
  }
}

export async function iniciarConversaAction(contatoId: string): Promise<{ ok: true; cicloId: string } | { ok: false; erro: string }> {
  try {
    const c = await contexto();
    const cicloId = await contato.iniciarConversa(c, contatoId);
    revalidatePath("/atendimento", "layout");
    return { ok: true, cicloId };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Não deu certo. Tente de novo." };
  }
}

export async function pedirParaAssumirAction(cicloId: string) {
  return rodar((c) => contato.pedirParaAssumir(c, cicloId));
}

export async function decidirPedidoDeAssumirAction(cicloId: string, aceitar: boolean) {
  return rodar((c) => contato.decidirPedidoDeAssumir(c, cicloId, aceitar));
}

export async function tirarDaConversaAction(cicloId: string, motivo: string) {
  return rodar((c) => contato.tirarDaConversa(c, cicloId, motivo));
}
