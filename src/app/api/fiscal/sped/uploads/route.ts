import { createHash } from "crypto";
import type { NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { FORMATO_DA_CHAVE } from "@/lib/sped/motor";
import { problemaDoNome, TETO_DO_UPLOAD } from "@/lib/sped/envioEmPartes";
import { doErro, recusa } from "@/lib/fiscal/motor/acoes";
import { portaoDaEscrita, raizDaQuery } from "@/lib/fiscal/motor/portaoDoUpload";
import { responder, statusDoErro } from "@/lib/fiscal/motor/rotas";
import { emitirTokenDoUpload } from "@/lib/fiscal/motor/tokenDoUpload";

export const dynamic = "force-dynamic";

/**
 * Abre uma sessão de upload em partes (API-CONNECT §14.4): o "Enviar
 * documentos" acima de 25 MiB, um arquivo por sessão, até 500 MiB.
 *
 * Corpo `{nome, tamanho, gesto}`. A `Idempotency-Key` (obrigatória no motor)
 * é derivada do gesto, do usuário, do nome e do tamanho: a nova tentativa da
 * criação depois de falha de rede devolve a mesma sessão, em vez de abrir
 * outra (o motor limita a 4 abertas por raiz). A resposta leva o `Upload` e o
 * token do dono, que o navegador devolve a cada parte (`tokenDoUpload.ts`).
 */
export async function POST(req: NextRequest) {
  const raiz = raizDaQuery(req);
  if (!raiz) return responder(recusa("Empresa não encontrada."), 404);
  const corpo = (await req.json().catch(() => null)) as { nome?: unknown; tamanho?: unknown; gesto?: unknown } | null;
  const nome = typeof corpo?.nome === "string" ? corpo.nome : "";
  const tamanho = corpo?.tamanho;
  const gesto = typeof corpo?.gesto === "string" ? corpo.gesto : "";
  const problema = problemaDoNome(nome);
  if (problema) return responder(recusa(problema, { codigo: "parametro_invalido", campos: { nome: problema } }), 422);
  if (typeof tamanho !== "number" || !Number.isSafeInteger(tamanho) || tamanho < 1) return responder(recusa("Tamanho do arquivo inválido.", { codigo: "parametro_invalido", campos: { tamanho: "inválido" } }), 422);
  if (tamanho > TETO_DO_UPLOAD) return responder(recusa("O arquivo passa de 500 MB, o limite do envio em partes. Divida o lote ou use a importação por pasta.", { codigo: "corpo_grande" }), 413);
  if (!FORMATO_DA_CHAVE.test(gesto)) return responder(recusa("A ação foi enviada sem identificador. Recarregue a página e repita.", { codigo: "idempotencia_ausente" }), 400);

  const g = await portaoDaEscrita(raiz);
  if ("recusa" in g) return g.recusa;
  const { p } = g;
  const chave = `c41:${createHash("sha256").update(JSON.stringify(["upload", raiz, p.ator.id, nome, tamanho, gesto])).digest("hex")}`;
  try {
    const upload = await p.motor.cliente.criarUpload(raiz, { nome, tamanho }, { ator: p.ator, chave });
    const token = emitirTokenDoUpload({ id: upload.id, tenantId: p.ctx.tenantId!, raiz, userId: p.ctx.userId! }, upload.expira_em);
    await logAudit({ tenantId: p.ctx.tenantId, userId: p.ctx.userId, action: "fiscal.sped.upload.criado",
      entityType: "SpedUpload", entityId: upload.id, metadata: { nome: upload.nome, raiz, chave, tamanho, partes: upload.partes_esperadas, expiraEm: upload.expira_em } });
    return responder({ ok: true, mensagem: `Envio em partes aberto: ${upload.partes_esperadas} parte(s).`, dados: { upload, token } });
  } catch (err) {
    return responder(doErro(err), statusDoErro(err));
  }
}
