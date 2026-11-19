import { NextRequest } from "next/server";
import { idValido, semEmpresa } from "@/lib/contabil-core/conciliacao/rotaDaRevisao";
import { autorizarNotas, erroDasNotas, notaInexistente, recusaDaNota, respostaSemCache } from "@/lib/contabil-core/notas/rotaDasNotas";
import { obterNota } from "@/lib/contabil-core/servidor/notas";

export const runtime = "nodejs";

// Uma nota fiscal (Bloco C, Fase C1, 18/11/2026): porte do `GET /empresas/{id}/notas/{nota_id}`.

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await autorizarNotas("ver");
  if (a.recusa) return a.recusa;
  const empresaId = idValido(req.nextUrl.searchParams.get("empresa"));
  if (!empresaId) return semEmpresa();
  const notaId = idValido((await params).id);
  if (!notaId) return notaInexistente();
  try {
    const r = await obterNota(a.ctx.tenantId, empresaId, notaId);
    if (!r.ok) return recusaDaNota(r);
    return respostaSemCache({ ok: true, nota: r.valor });
  } catch (err) {
    return erroDasNotas("leitura", err);
  }
}
