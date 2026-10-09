import { NextResponse } from "next/server";
import { buscarAlertasReuniao } from "@/app/(app)/agenda/alert-actions";

export const dynamic = "force-dynamic";

// A autenticação da equipe é aplicada pelo proxy e a consulta limita ao usuário/tenant.
export async function GET() {
  return NextResponse.json(await buscarAlertasReuniao(), { headers: { "Cache-Control": "no-store" } });
}
