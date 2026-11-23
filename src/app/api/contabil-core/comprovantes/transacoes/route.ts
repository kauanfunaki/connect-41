import { NextRequest } from "next/server";
import { idValido, semEmpresa } from "@/lib/contabil-core/conciliacao/rotaDaRevisao";
import { autorizarComprovantes, erroDosComprovantes, respostaSemCache } from "@/lib/contabil-core/comprovantes/rotaDosComprovantes";
import { recusaDaNota } from "@/lib/contabil-core/notas/rotaDasNotas";
import { transacoesParaAssociar } from "@/lib/contabil-core/servidor/notas";

export const runtime = "nodejs";

// As transações pendentes para associar a um comprovante (Bloco C, Fase C2, 19/11/2026): o que o diálogo
// "Associar a uma Transação" do original lia (`/extrato?status=pendente&page_size=100`), com a busca pelo
// histórico, como na aba "Notas". Só lê; serve a quem associa, então pede "agir".

export async function GET(req: NextRequest) {
  const a = await autorizarComprovantes("agir");
  if (a.recusa) return a.recusa;
  const q = req.nextUrl.searchParams;
  const empresaId = idValido(q.get("empresa"));
  if (!empresaId) return semEmpresa();
  const busca = q.get("busca")?.trim().slice(0, 100) || null;
  try {
    const r = await transacoesParaAssociar(a.ctx.tenantId, empresaId, busca);
    if (!r.ok) return recusaDaNota(r);
    return respostaSemCache({ ok: true, transacoes: r.valor });
  } catch (err) {
    return erroDosComprovantes("transações", err, "Não deu para consultar as transações pendentes. Tente de novo.");
  }
}
