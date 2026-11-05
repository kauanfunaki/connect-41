import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { logAudit } from "@/lib/audit";
import { empresaContabilVisivel } from "@/lib/contabil/servidor";
import { importarDocumento, TIPOS_DE_ENVIO, type TipoDeEnvio } from "@/lib/contabil/importacaoDePagamentos";

export const dynamic = "force-dynamic";

/**
 * O envio de um documento dos pagamentos sem nota (03/11/2026): um arquivo
 * por pedido, para o lote grande não esbarrar no teto do corpo (26 MB no
 * proxy) e para a tela mostrar o resultado de cada um.
 */
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  const responder = (corpo: object, status = 200) => NextResponse.json(corpo, { status, headers: { "Cache-Control": "private, no-store" } });
  if (!ctx.tenantId || !ctx.userId || !(await podeNoModulo(ctx, "contabil_sped", "agir"))) return responder({ ok: false, erro: "Não encontrado." }, 404);
  let dados: FormData;
  try { dados = await req.formData(); } catch { return responder({ ok: false, erro: "Envio inválido." }, 400); }
  const empresa = await empresaContabilVisivel(ctx, String(dados.get("empresa") ?? ""));
  if (!empresa) return responder({ ok: false, erro: "Não encontrado." }, 404);
  const envio = String(dados.get("envio") ?? "");
  const arquivo = dados.get("arquivo");
  if (!(envio in TIPOS_DE_ENVIO)) return responder({ ok: false, erro: "Escolha o tipo do documento." }, 400);
  if (!(arquivo instanceof File) || !arquivo.size) return responder({ ok: false, erro: "Escolha o arquivo." }, 400);
  const pasta = String(dados.get("pasta") ?? "").trim().slice(0, 255);
  const r = await importarDocumento({ tenantId: ctx.tenantId, userId: ctx.userId, empresa, arquivo, envio: envio as TipoDeEnvio, pasta, substituir: dados.get("substituir") === "true" });
  if (!r.ok) return responder(r, r.existentes ? 409 : 400);
  await logAudit({
    tenantId: ctx.tenantId, userId: ctx.userId, action: "contabil.pagamento.enviado", entityType: "ContabilDocumentoPagamento", entityId: r.arquivoId,
    metadata: { nome: r.nome, tipo: TIPOS_DE_ENVIO[envio as TipoDeEnvio].rotulo, pasta: pasta || null, paginas: r.paginas, semTexto: r.semTexto, linhas: r.linhas, conferir: r.conferir, ligadas: r.ligadas },
  });
  return responder(r);
}
