import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { scopedCompanyWhere, scopedPersonWhere, scopedPipelineWhere } from "@/lib/auth/scope";

const LIMIT = 5;

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ companies: [], people: [], pipelines: [] });
  }

  const prisma = getPrisma();
  const [companies, people, pipelines] = await Promise.all([
    prisma.company.findMany({
      where: { ...(await scopedCompanyWhere(ctx)), name: { contains: q } },
      orderBy: { name: "asc" },
      take: LIMIT,
      select: { id: true, name: true },
    }),
    prisma.person.findMany({
      where: { ...(await scopedPersonWhere(ctx)), name: { contains: q } },
      orderBy: { name: "asc" },
      take: LIMIT,
      select: { id: true, name: true },
    }),
    prisma.pipeline.findMany({
      where: { ...scopedPipelineWhere(ctx), name: { contains: q } },
      orderBy: { name: "asc" },
      take: LIMIT,
      select: { id: true, name: true },
    }),
  ]);

  return NextResponse.json({ companies, people, pipelines });
}
