import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { credenciaisDoAmbiente, obterPdf, ErroDoSped } from "@/lib/sped/client";
import { raizesDoAlcance } from "@/lib/sped/raizes";
import { alcanceDaEquipe } from "@/app/(app)/documentos-fiscais/alcance";

export const dynamic = "force-dynamic";

const SECTOR = "fiscal";
const MODULE = "fiscal_documentos";

/**
 * PDF de um CT-e, buscado ao vivo no SPED.
 *
 * ─── Por que uma rota e não um link direto ───────────────────────────────────
 *
 * O PDF mora no painel do SPED, atrás do token de serviço. Linkar de lá para o
 * navegador do usuário exigiria expor o token no cliente — que é exatamente o
 * que o desenho da integração evita. Então o Connect busca e repassa os bytes.
 *
 * ─── A fronteira ────────────────────────────────────────────────────────────
 *
 * A raiz chega pela URL, e é por isso que ela é conferida contra
 * `raizesDoAlcance` antes de qualquer chamada. Sem essa checagem, qualquer
 * pessoa logada trocaria o parâmetro e leria o frete de outro contribuinte — o
 * alcance do acervo não protege aqui, porque esta consulta não passa por ele.
 *
 * Raiz fora do alcance responde **404, nunca 403**: é a mesma regra que o SPED
 * aplica, e pelo mesmo motivo — 403 confirmaria que o documento existe.
 */
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, SECTOR)) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) {
    return NextResponse.json({ error: "Módulo não habilitado." }, { status: 404 });
  }

  const chave = req.nextUrl.searchParams.get("chave")?.trim() ?? "";
  const raiz = req.nextUrl.searchParams.get("raiz")?.trim() ?? "";
  if (!/^\d{44}$/.test(chave) || !/^\d{8}$/.test(raiz)) {
    return NextResponse.json({ error: "Chave ou raiz inválida." }, { status: 400 });
  }

  const permitidas = await raizesDoAlcance(alcanceDaEquipe(ctx.tenantId));
  if (!permitidas.has(raiz)) {
    return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  }

  const creds = credenciaisDoAmbiente();
  if (!creds) {
    return NextResponse.json({ error: "Integração com o SPED não configurada." }, { status: 503 });
  }

  try {
    const bytes = await obterPdf(creds, raiz, "cte", chave);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        // `inline`: o fiscal quer olhar, não baixar 40 arquivos.
        "Content-Disposition": `inline; filename="cte-${chave}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof ErroDoSped) {
      // `semXml` cobre o 409 `sem_xml_armazenado` e o próprio código tipado —
      // é catalogado, mas sem XML para renderizar. Não é falha da integração.
      if (err.semXml) {
        return NextResponse.json({ error: "Este CT-e não tem XML armazenado para gerar o PDF." }, { status: 409 });
      }
      if (err.status === 404) {
        return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
      }
    }
    console.error("[cte/pdf]", err);
    return NextResponse.json({ error: "Falha ao buscar o PDF no SPED." }, { status: 502 });
  }
}
