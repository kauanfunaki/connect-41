import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    JWT_ACCESS_SECRET: !!process.env.JWT_ACCESS_SECRET,
    JWT_REFRESH_SECRET: !!process.env.JWT_REFRESH_SECRET,
    NODE_ENV: process.env.NODE_ENV ?? "undefined",
  };

  const missing = Object.entries(checks)
    .filter(([, v]) => v === false)
    .map(([k]) => k);

  const ok = missing.length === 0;

  // Testa conexão com o banco se DATABASE_URL estiver presente
  let dbOk = false;
  let dbError: string | null = null;
  if (checks.DATABASE_URL) {
    try {
      const { getPrisma } = await import("@/lib/prisma");
      await getPrisma().$queryRaw`SELECT 1`;
      dbOk = true;
    } catch (err) {
      dbError = err instanceof Error ? err.message : String(err);
    }
  }

  return NextResponse.json(
    { ok, checks, missing, db: { ok: dbOk, error: dbError } },
    { status: ok && dbOk ? 200 : 500 }
  );
}
