import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { lerTelasEmManutencao } from "@/lib/manutencao/leitura";
import { COOKIE_DE_TESTE, HORAS_DE_TESTE, comManutencaoEmTeste, passaPelaManutencao } from "@/lib/manutencao/regras";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * "Abrir para testar" (13/11/2026): a tela em manutenção fica bloqueada para
 * todos; quem conserta (Tech e administrador) abre só para si, pelo aviso,
 * para conferir a correção antes de liberar. Grava a manutenção no cookie que
 * o proxy confere (ver `COOKIE_DE_TESTE`); os setores continuam no aviso.
 *
 * Rota, e não ação de servidor: o aviso mora no endereço da própria tela (o
 * proxy reescreve), e uma ação postada ali iria para a página da tela.
 */
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return NextResponse.json({ error: "Entre de novo no Connect." }, { status: 401 });
  if (!passaPelaManutencao(ctx)) {
    return NextResponse.json({ error: "Só a Tech e os administradores abrem uma tela em manutenção." }, { status: 403 });
  }

  const corpo = (await req.json().catch(() => null)) as { tela?: unknown } | null;
  const tela = typeof corpo?.tela === "string" ? corpo.tela : "";
  const { telas } = await lerTelasEmManutencao(ctx.tenantId);
  const manutencao = telas.find((t) => t.moduleCode === tela);
  // Liberada nesse meio-tempo: nada a gravar, a tela já abre para todos.
  if (!manutencao) return NextResponse.json({ ok: true, liberada: true });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_DE_TESTE, comManutencaoEmTeste(req.cookies.get(COOKIE_DE_TESTE)?.value, manutencao.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: HORAS_DE_TESTE * 60 * 60,
  });
  return res;
}
