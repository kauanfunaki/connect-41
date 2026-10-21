import { NextResponse } from "next/server";
import { feriadosDoEscritorio } from "@/lib/feriados";
import { getAuthContext } from "@/lib/auth/context";

/**
 * Feriados do escritório, para o calendário do campo de data marcar (02/10/2026).
 *
 * A data sai em texto "AAAA-MM-DD" lida em **UTC**: o feriado é gravado como
 * meia-noite UTC (`new Date("2026-10-12")`, em admin/feriados/actions.ts), e
 * lê-lo em São Paulo devolveria o dia anterior.
 *
 * Desde 21/10/2026 vêm também os nacionais, calculados (`lib/feriados.ts`).
 *
 * O calendário só pede quando abre, e guarda a resposta até a página recarregar.
 */
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const feriados = [...(await feriadosDoEscritorio(ctx.tenantId))].sort(([a], [b]) => a.localeCompare(b));
  return NextResponse.json(
    { feriados: feriados.map(([data, nome]) => ({ data, nome })) },
    { headers: { "Cache-Control": "private, max-age=3600" } }
  );
}
