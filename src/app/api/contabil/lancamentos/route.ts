import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { competenciaValida } from "@/lib/financeiro/periodo";
import { txtDaDominio, xlsxDaDominio } from "@/lib/financeiro/dominio/planilha";
import { empresaDoContabil, linhasParaADominio, painelDoContabil } from "@/lib/contabil/servidor";
import { CTE, NFE, NFSE } from "@/lib/contabil/lancamentos";

export const dynamic = "force-dynamic";

const TIPOS = { nfe: NFE, cte: CTE, nfse: NFSE } as const;

/**
 * A planilha de importação da Domínio com os lançamentos de entrada do mês
 * (29/10/2026). Um arquivo por tipo de documento, como no painel antigo: o
 * Contábil já importava as NF-e mês a mês, e um arquivo com tudo junto
 * duplicaria lá as já importadas.
 */
export async function GET(req: NextRequest) {
  const auth = await getAuthContext();
  const naoAchou = () => NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!auth.tenantId || !(await podeNoModulo(auth, "contabil_sped", "ver"))) return naoAchou();
  const p = req.nextUrl.searchParams;
  const mes = competenciaValida(p.get("mes") ?? undefined);
  const tipo = TIPOS[p.get("tipo") as keyof typeof TIPOS];
  const formato = p.get("formato") === "txt" ? "txt" : "xlsx";
  const id = p.get("empresa") ?? "";
  if (!mes || !tipo || !/^[0-9a-f-]{36}$/i.test(id)) return naoAchou();
  const empresa = await empresaDoContabil(auth.tenantId, id);
  if (!empresa) return naoAchou();

  const painel = await painelDoContabil(auth.tenantId, empresa, mes);
  const linhas = linhasParaADominio(painel.lancamentos, tipo, painel.configuracao.modelos.codigoFilial);
  if (!linhas.length) return NextResponse.json({ error: "Nenhum lançamento deste tipo no mês." }, { status: 409 });
  const nome = `lancamentos_${p.get("tipo")}_${empresa.cnpj || "empresa"}_${mes}.${formato}`;
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
