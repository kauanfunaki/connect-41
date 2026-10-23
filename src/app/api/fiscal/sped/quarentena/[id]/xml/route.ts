import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { ErroDoMotor } from "@/lib/sped/motor";
import { abrirMotor } from "@/lib/fiscal/motor/servidor";

export const dynamic = "force-dynamic";

/**
 * O XML de um documento da quarentena, buscado no motor (API-CONNECT
 * §11.1.3), para ver ou baixar. Mesma fronteira do download do SPED: módulo
 * `fiscal_acervo` no nível "ver" e raiz conferida contra o alcance da equipe
 * antes de chamar; fora disso, 404.
 *
 * ─── Ver sem executar ───────────────────────────────────────────────────────
 *
 * O XML é de terceiros (é o que o motor rejeitou). Servido como
 * `application/xml` na origem do Connect, um XML com elementos XHTML ou uma
 * folha XSLT rodaria script com a sessão da pessoa. Para ver, vai como texto
 * puro, com `nosniff` e CSP que proíbe tudo; para baixar (`baixar=1`), com o
 * tipo do motor e `attachment`.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext();
  if (!auth.tenantId || !(await podeNoModulo(auth, "fiscal_acervo", "ver"))) {
    return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  }
  const { id: bruto } = await ctx.params;
  const id = Number(bruto);
  const raiz = req.nextUrl.searchParams.get("raiz") ?? "";
  const baixar = req.nextUrl.searchParams.get("baixar") === "1";
  if (!Number.isSafeInteger(id) || id < 1 || !/^\d{8}$/.test(raiz)) {
    return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  }
  const motor = await abrirMotor(auth.tenantId);
  if (!motor) return NextResponse.json({ error: "A integração com o motor SPED não está configurada." }, { status: 503 });
  if (!motor.raizes.includes(raiz)) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });

  try {
    const resposta = await motor.cliente.xmlDaQuarentena(raiz, id);
    const headers = new Headers({
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    });
    if (baixar) {
      headers.set("Content-Type", resposta.headers.get("Content-Type") ?? "application/xml; charset=utf-8");
      headers.set("Content-Disposition", `attachment; filename="quarentena-${id}.xml"`);
    } else {
      headers.set("Content-Type", "text/plain; charset=utf-8");
      headers.set("Content-Disposition", `inline; filename="quarentena-${id}.xml.txt"`);
    }
    return new Response(resposta.body, { status: 200, headers });
  } catch (err) {
    if (err instanceof ErroDoMotor) {
      const status = err.status === 404 ? 404 : err.status >= 400 && err.status < 500 ? 409 : 502;
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status });
    }
    console.error("[fiscal/sped/quarentena/xml]", err);
    return NextResponse.json({ error: "Falha ao buscar o XML no motor SPED." }, { status: 502 });
  }
}
