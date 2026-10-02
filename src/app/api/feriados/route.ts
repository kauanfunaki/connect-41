import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";

/**
 * Feriados do escritório, para o calendário do campo de data marcar (02/10/2026).
 *
 * A data sai em texto "AAAA-MM-DD" lida em **UTC**: o feriado é gravado como
 * meia-noite UTC (`new Date("2026-10-12")`, em admin/feriados/actions.ts), e
 * lê-lo em São Paulo devolveria o dia anterior.
 *
 * O calendário só pede quando abre, e guarda a resposta até a página recarregar.
 */
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const feriados = await getPrisma().holiday.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { date: "asc" },
    select: { date: true, name: true },
  });
  return NextResponse.json(
    { feriados: feriados.map((f) => ({ data: f.date.toISOString().slice(0, 10), nome: f.name })) },
    { headers: { "Cache-Control": "private, max-age=3600" } }
  );
}
