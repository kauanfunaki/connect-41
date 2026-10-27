// O portão das rotas do envio em partes (API-CONNECT §14.4), 23/10/2026.
//
// Toda rota de `/api/fiscal/sped/uploads/[id]/...` passa por aqui, nesta
// ordem: raiz e id no formato; o portão de §13 (`prepararEscrita`: `agir` em
// Documentos, raiz no alcance, token de escrita, ator); e o dono da sessão —
// o `X-Upload-Token` que o Connect assinou ao criá-la, amarrado a este id,
// escritório, raiz e usuário (`tokenDoUpload.ts`). Sessão de outra pessoa é
// 404, como a inexistente: não confirma que existe.

import "server-only";
import type { NextRequest } from "next/server";
import { ENVIOS, ID_DO_UPLOAD } from "@/lib/sped/escritasDoMotor";
import { CABECALHO_DO_TOKEN } from "@/lib/sped/envioEmPartes";
import { prepararEscrita, recusa, recusado, type Preparo } from "./acoes";
import { responder } from "./rotas";
import { conferirTokenDoUpload } from "./tokenDoUpload";

/** O módulo do envio de documentos (§13.3), o mesmo do envio num corpo só. */
export const MODULO_DO_UPLOAD = ENVIOS.documentos.modulo;
export const TELA_DO_UPLOAD = ENVIOS.documentos.tela;

const naoEncontrado = (mensagem = "Envio não encontrado.") => responder(recusa(mensagem, { codigo: "nao_encontrado" }), 404);

/** A raiz da query: sem ela (ou fora do formato), 404. */
export function raizDaQuery(req: NextRequest): string | null {
  const raiz = req.nextUrl.searchParams.get("raiz") ?? "";
  return /^\d{8}$/.test(raiz) ? raiz : null;
}

/** O portão de §13 para quem abre uma sessão: devolve o preparo ou a resposta da recusa. */
export async function portaoDaEscrita(raiz: string): Promise<{ recusa: Response } | { p: Preparo }> {
  const p = await prepararEscrita(raiz, MODULO_DO_UPLOAD, "agir");
  if (recusado(p)) return { recusa: responder(p, p.codigo === "escrita_nao_habilitada" ? 409 : 403) };
  return { p };
}

/** O portão inteiro de uma sessão já aberta. */
export async function portaoDaSessao(req: NextRequest, id: string): Promise<{ recusa: Response } | { p: Preparo; raiz: string; id: string }> {
  const raiz = raizDaQuery(req);
  if (!raiz) return { recusa: responder(recusa("Empresa não encontrada."), 404) };
  if (!ID_DO_UPLOAD.test(id)) return { recusa: naoEncontrado() };
  const g = await portaoDaEscrita(raiz);
  if ("recusa" in g) return g;
  const veredicto = conferirTokenDoUpload(req.headers.get(CABECALHO_DO_TOKEN), { id, tenantId: g.p.ctx.tenantId!, raiz, userId: g.p.ctx.userId! });
  if (veredicto === "vencido") return { recusa: naoEncontrado("A sessão deste envio venceu. Envie o arquivo de novo.") };
  if (veredicto !== "ok") return { recusa: naoEncontrado() };
  return { p: g.p, raiz, id };
}

/**
 * Repassa o corpo como veio, em blocos, e para com erro se passar do
 * `Content-Length` declarado (o `fetch` do Node também confere o tamanho
 * exato; isto corta antes, sem esperar o fim do corpo).
 */
export function limitarCorpo(corpo: ReadableStream<Uint8Array>, maximo: number): ReadableStream<Uint8Array> {
  let vistos = 0;
  return corpo.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(bloco, saida) {
      vistos += bloco.byteLength;
      if (vistos > maximo) { saida.error(new Error("corpo maior que o Content-Length declarado")); return; }
      saida.enqueue(bloco);
    },
  }));
}
