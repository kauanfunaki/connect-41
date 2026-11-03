import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { competenciaValida } from "@/lib/financeiro/periodo";
import { txtDaDominio, xlsxDaDominio } from "@/lib/financeiro/dominio/planilha";
import { empresaContabilVisivel, painelDasSaidas } from "@/lib/contabil/servidor";

export const dynamic = "force-dynamic";

/** A planilha da Domínio com os lançamentos de saída do mês (passo 6, 03/11/2026). */
export async function GET(req: NextRequest) {
  const auth = await getAuthContext();
  const naoAchou = () => NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!auth.tenantId || !(await podeNoModulo(auth, "contabil_sped", "ver"))) return naoAchou();
  const p = req.nextUrl.searchParams;
  const mes = competenciaValida(p.get("mes") ?? undefined);
  const formato = p.get("formato") === "txt" ? "txt" : "xlsx";
  const id = p.get("empresa") ?? "";
  if (!mes || !/^[0-9a-f-]{36}$/i.test(id)) return naoAchou();
  const empresa = await empresaContabilVisivel(auth, id);
  if (!empresa) return naoAchou();

  const { linhas } = await painelDasSaidas(auth.tenantId, empresa, mes);
  if (!linhas.length) return NextResponse.json({ error: "Nenhuma saída no mês." }, { status: 409 });
  const nome = `lancamentos_saidas_${empresa.cnpj || "empresa"}_${mes}.${formato}`;
  const corpo = formato === "txt" ? txtDaDominio(linhas) : await xlsxDaDominio(linhas);
  return new Response(new Uint8Array(corpo), {
    headers: {
      "Content-Type": formato === "txt" ? "text/plain; charset=iso-8859-1" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
