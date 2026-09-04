import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { sincronizarTenant } from "@/lib/sped/sync";

export const dynamic = "force-dynamic";

// Sincronização do acervo fiscal com o índice do SPED. Mesmo padrão das outras
// rotas de cron (token de serviço, `/api/cron/` já em PUBLIC_PATHS no proxy).
//
// Cada chamada avança um número limitado de páginas por raiz de CNPJ e guarda o
// cursor — a carga inicial são 457 páginas, e ela atravessa várias execuções em
// vez de segurar uma requisição HTTP por meia hora.
//
// Rodar **fora das janelas de geração do SPED**: o que derruba a conexão de lá é
// a geração lendo ~1 GB de blob, e concorrer com ela é pedir para ser o
// culpado.
export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SERVICE_TOKEN;
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!expected || !token || token !== expected) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const prisma = getPrisma();
    const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

    const porTenant = [];
    let semCredencial = false;
    for (const t of tenants) {
      const r = await sincronizarTenant(t.id);
      if (r.semCredencial) {
        semCredencial = true;
        break;
      }
      if (r.raizes.length > 0) porTenant.push({ tenant: t.name, raizes: r.raizes });
    }

    if (semCredencial) {
      // 200, não erro: sem `SPED_API_URL`/`SPED_API_TOKEN` a integração está
      // desligada, e isso é uma configuração ausente — não uma falha do cron,
      // que ficaria vermelho todo minuto no scheduler até alguém desligá-lo.
      return NextResponse.json({ ok: true, desligado: "SPED_API_URL/SPED_API_TOKEN não configurados" });
    }

    return NextResponse.json({ ok: true, tenants: porTenant });
  } catch (err) {
    console.error("[cron/sped-sync]", err);
    return NextResponse.json({ ok: false, error: "Falha ao sincronizar com o SPED" }, { status: 500 });
  }
}
