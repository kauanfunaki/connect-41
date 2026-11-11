"use server";

import { revalidatePath } from "next/cache";
import { contexto } from "@/lib/atendimento/contexto";
import * as cmd from "@/lib/atendimento/comandos";
import { buscarEmpresas } from "@/lib/atendimento/consultas";

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

export async function encerrarAction(p: { cicloId: string; desfechoId: string; desfechoOutro: string; resumo: string; despedida: string | null }) {
  return rodar((c) => cmd.encerrar(c, p));
}

export async function vincularContatoAction(
  p: { cicloId: string } & ({ tipo: "CLIENTE"; companyId: string } | { tipo: "NOVO"; nome: string; interesse: string })
) {
  return rodar((c) => cmd.vincularContato(c, p));
}

export async function buscarEmpresasAction(termo: string) {
  try {
    const c = await contexto();
    return await buscarEmpresas(c, termo);
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
