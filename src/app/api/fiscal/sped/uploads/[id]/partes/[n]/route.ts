import type { NextRequest } from "next/server";
import { doErro, recusa } from "@/lib/fiscal/motor/acoes";
import { limitarCorpo, portaoDaSessao } from "@/lib/fiscal/motor/portaoDoUpload";
import { responder, statusDoErro } from "@/lib/fiscal/motor/rotas";
import { partesEsperadas, TAMANHO_DA_PARTE, TETO_DO_UPLOAD } from "@/lib/sped/envioEmPartes";

export const dynamic = "force-dynamic";

/** O número máximo de uma parte: 500 MiB em partes de 8 MiB. */
const ULTIMA_PARTE_POSSIVEL = partesEsperadas(TETO_DO_UPLOAD, TAMANHO_DA_PARTE);

/**
 * Uma parte do envio em partes (API-CONNECT §14.4), do navegador ao motor.
 *
 * O navegador nunca fala com o motor: manda a parte aqui, com o
 * `X-Upload-Token` da sessão. A ordem: o corpo é conferido **sem ler** —
 * `application/octet-stream` (415), `Content-Length` presente (411) e no
 * máximo 8 MiB, o `tamanho_parte` do motor (413) —; depois o portão (o de §13
 * e o dono da sessão); e só então o corpo vai ao motor **como stream**, com o
 * mesmo `Content-Length`, cortado se passar dele. A parte não fica inteira na
 * memória do Connect além do que o proxy já guarda (`proxyClientMaxBodySize`,
 * 26 MB, acima da parte).
 *
 * O motor confere o tamanho exato da parte (`422 parte_invalida`) e o
 * `X-Parte-SHA256` (`422 parte_corrompida`); o PUT é idempotente (reenviar
 * substitui), e quem repete a parte é a tela. A parte não é auditada no
 * Connect, uma por uma (até 63 por envio): a abertura, a conclusão e o
 * cancelamento são, e o motor audita cada parte com o SHA-256 dela.
 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await ctx.params;
  const numero = /^\d{1,3}$/.test(n) ? Number(n) : NaN;
  if (!(numero >= 1 && numero <= ULTIMA_PARTE_POSSIVEL)) return responder(recusa("Número de parte inválido.", { codigo: "parte_invalida" }), 422);
  if ((req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() !== "application/octet-stream") {
    return responder(recusa("A parte tem de ir como application/octet-stream.", { codigo: "tipo_de_conteudo" }), 415);
  }
  const bruto = req.headers.get("content-length");
  const declarado = bruto && /^\d+$/.test(bruto) ? Number(bruto) : NaN;
  if (!Number.isSafeInteger(declarado)) return responder(recusa("A parte chegou sem o tamanho declarado. Tente de novo.", { codigo: "tamanho_ausente" }), 411);
  if (declarado > TAMANHO_DA_PARTE) return responder(recusa("A parte passa de 8 MB, o tamanho de parte do motor.", { codigo: "corpo_grande" }), 413);
  if (declarado < 1) return responder(recusa("Parte vazia.", { codigo: "parte_invalida" }), 422);
  const sha = req.headers.get("x-parte-sha256");
  if (sha !== null && !/^[0-9a-fA-F]{64}$/.test(sha)) return responder(recusa("SHA-256 da parte inválido.", { codigo: "parametro_invalido", campos: { "X-Parte-SHA256": "64 hexadecimais" } }), 422);

  const g = await portaoDaSessao(req, id);
  if ("recusa" in g) return g.recusa;
  if (!req.body) return responder(recusa("A parte chegou sem corpo. Tente de novo.", { codigo: "parte_invalida" }), 400);
  try {
    const r = await g.p.motor.cliente.enviarParteDoUpload(g.raiz, g.id, numero, limitarCorpo(req.body, declarado), { tamanho: declarado, sha256: sha?.toLowerCase() }, { ator: g.p.ator });
    return responder({ ok: true, mensagem: `Parte ${r.numero} de ${r.partes_esperadas} recebida.`, dados: r });
  } catch (err) {
    return responder(doErro(err), statusDoErro(err));
  }
}
