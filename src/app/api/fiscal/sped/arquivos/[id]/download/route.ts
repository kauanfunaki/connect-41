import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { ErroDoMotor } from "@/lib/sped/motor";
import { abrirMotor } from "@/lib/fiscal/motor/servidor";

export const dynamic = "force-dynamic";

/** Os cabeçalhos que atravessam do motor para o navegador, sem mudar nada. */
const REPASSADOS = ["Content-Type", "Content-Disposition", "Content-Length", "X-Conteudo-SHA256", "ETag"] as const;

/**
 * O TXT de um SPED gerado, buscado no motor (API-CONNECT §6.4 e §8.2).
 *
 * ─── Por que stream ─────────────────────────────────────────────────────────
 *
 * O arquivo é ISO-8859-1 e o PVA confere byte a byte. `await resposta.text()`
 * decodificaria como UTF-8 e trocaria cada acento — e ainda carregaria 20 MB
 * na memória. O corpo do motor vai direto para o navegador, com os mesmos
 * `Content-Type`, `Content-Disposition` e o `X-Conteudo-SHA256` para quem
 * quiser conferir.
 *
 * ─── A fronteira ────────────────────────────────────────────────────────────
 *
 * A raiz vem da URL e é conferida contra as raízes do alcance da equipe antes
 * de qualquer chamada; fora delas, 404 — a mesma regra do motor.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext();
  if (!auth.tenantId || !(await podeNoModulo(auth, "fiscal_entregas", "ver"))) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }
  const { id: bruto } = await ctx.params;
  const id = Number(bruto);
  const raiz = req.nextUrl.searchParams.get("raiz") ?? "";
  if (!Number.isSafeInteger(id) || id < 1 || !/^\d{8}$/.test(raiz)) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }
  const motor = await abrirMotor(auth.tenantId);
  if (!motor) return NextResponse.json({ error: "A integração com o motor SPED não está configurada." }, { status: 503 });
  if (!motor.raizes.includes(raiz)) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });

  try {
    const resposta = await motor.cliente.baixarArquivo(raiz, id);
    const headers = new Headers({ "Cache-Control": "private, no-store" });
    for (const nome of REPASSADOS) {
      const valor = resposta.headers.get(nome);
      if (valor) headers.set(nome, valor);
    }
    if (!headers.has("Content-Disposition")) headers.set("Content-Disposition", `attachment; filename="sped-${id}.txt"`);
    return new Response(resposta.body, { status: 200, headers });
  } catch (err) {
    if (err instanceof ErroDoMotor) {
      const status = err.status === 404 ? 404 : err.status >= 400 && err.status < 500 ? 409 : 502;
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status });
    }
    console.error("[fiscal/sped/download]", err);
    return NextResponse.json({ error: "Falha ao buscar o arquivo no motor SPED." }, { status: 502 });
  }
}
