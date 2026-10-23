import type { NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { ErroDoMotor } from "@/lib/sped/motor";
import type { UploadConcluido } from "@/lib/sped/escritasDoMotor";
import { doErro, recusa, revalidarTelas } from "@/lib/fiscal/motor/acoes";
import { portaoDaSessao, TELA_DO_UPLOAD } from "@/lib/fiscal/motor/portaoDoUpload";
import { responder, statusDoErro } from "@/lib/fiscal/motor/rotas";

export const dynamic = "force-dynamic";

/**
 * Conclui o envio em partes (API-CONNECT §14.4): o motor junta as partes,
 * confere o SHA-256 do arquivo inteiro (calculado no navegador) e roda a
 * mesma ingestão do `POST /documentos`. Pesada: 60 s e nenhuma nova tentativa
 * automática; `503 motor_ocupado` deixa a sessão aberta.
 *
 * Idempotente no motor: a mesma `sha256` numa sessão concluída devolve o
 * mesmo relatório. Por isso, quando os 60 s estouram, a rota consulta a
 * sessão e, se ela já está `concluida`, pede o relatório de novo (replay, sem
 * ingerir outra vez). Ainda `concluindo`, devolve `upload_em_andamento`, e a
 * tela consulta de novo em alguns segundos.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await portaoDaSessao(req, (await ctx.params).id);
  if ("recusa" in g) return g.recusa;
  const { p, raiz, id } = g;
  const corpo = (await req.json().catch(() => null)) as { sha256?: unknown } | null;
  const sha256 = typeof corpo?.sha256 === "string" ? corpo.sha256.toLowerCase() : "";
  if (!/^[0-9a-f]{64}$/.test(sha256)) return responder(recusa("SHA-256 do arquivo inválido.", { codigo: "parametro_invalido", campos: { sha256: "64 hexadecimais" } }), 422);
  const escrita = { ator: p.ator };

  let r: UploadConcluido;
  try {
    try {
      r = await p.motor.cliente.concluirUpload(raiz, id, sha256, escrita);
    } catch (err) {
      if (!(err instanceof ErroDoMotor) || err.codigo !== "tempo_esgotado") throw err;
      const u = await p.motor.cliente.obterUpload(raiz, id);
      if (u.estado === "concluindo") return responder(recusa("A conclusão ainda está rodando no motor. Aguarde alguns segundos.", { codigo: "upload_em_andamento", renovarChave: false }), 409);
      if (u.estado !== "concluida") throw err;
      r = await p.motor.cliente.concluirUpload(raiz, id, sha256, escrita);
    }
  } catch (err) {
    return responder(doErro(err), statusDoErro(err));
  }
  await logAudit({ tenantId: p.ctx.tenantId, userId: p.ctx.userId, action: "fiscal.sped.upload.concluido",
    entityType: "SpedImportacao", entityId: String(r.importacao_id), metadata: { nome: `importação #${r.importacao_id}`, raiz, upload: id, sha256, resumo: { lidos: r.resumo.lidos, novos: r.resumo.novos, duplicados: r.resumo.duplicados, erros: r.resumo.erros, ignorados: r.resumo.ignorados } } });
  revalidarTelas(TELA_DO_UPLOAD);
  return responder({ ok: true, mensagem: `Importação #${r.importacao_id}: ${r.resumo.novos} novo(s), ${r.resumo.duplicados} duplicado(s), ${r.resumo.erros} com erro, ${r.resumo.ignorados} ignorado(s).`, dados: r });
}
