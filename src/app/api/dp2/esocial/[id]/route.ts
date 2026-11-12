import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { acessoAoEsocial } from "@/lib/dp2/esocial/acesso";

export const dynamic = "force-dynamic";

// O XML de um evento do eSocial do DP 2 (12/11/2026), sem assinatura, para
// conferir. `?baixar=1` devolve como arquivo.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { id } = await params;
  const ev = await getPrisma().dp2EventoEsocial.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!ev) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
  const acesso = await acessoAoEsocial(ev.companyId);
  if ("erro" in acesso) return NextResponse.json({ error: acesso.erro }, { status: acesso.status });
  const baixar = new URL(req.url).searchParams.get("baixar") === "1";
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${ev.xml}`, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      ...(baixar ? { "Content-Disposition": `attachment; filename="${ev.tipo}_${ev.idEvento}.xml"` } : {}),
      "Cache-Control": "no-store",
    },
  });
}
