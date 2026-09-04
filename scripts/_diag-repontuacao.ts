import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

async function main() {
  const url = process.env.DATABASE_URL!;
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });
  const { papeisDosAgentes } = await import("../src/lib/chatwoot/evaluation");
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

  for (const t of tenants) {
    const conversas = await prisma.chatwootConversation.findMany({
      where: { tenantId: t.id, resolvedAt: { not: null }, excludedFromEvaluation: false },
      select: { id: true, evaluations: { select: { handlerLabel: true, evaluatedAt: true, segment: true } } },
    });
    if (conversas.length === 0) continue;

    const papeis = await papeisDosAgentes(t.id);
    console.log("=== " + t.name + " ===");
    console.log("  recepcao marcada: " + (papeis.recepcao.join(", ") || "NENHUMA"));
    console.log("  automacao marcada: " + (papeis.automacao.join(", ") || "nenhuma"));

    const sync = await prisma.chatwootMessage.groupBy({
      by: ["conversationId"],
      where: { tenantId: t.id },
      _max: { syncedAt: true },
      _count: { _all: true },
    });
    const maxSync = new Map(sync.map((s) => [s.conversationId, s._max.syncedAt]));

    const jaFeitas = conversas.filter(
      (c) => c.evaluations.length > 0 && c.evaluations.every((e) => e.handlerLabel !== null)
    );
    let stale = 0;
    let comTriagem = 0;
    for (const c of jaFeitas) {
      const avaliadaEm = c.evaluations.map((e) => e.evaluatedAt).sort((a, b) => b.getTime() - a.getTime())[0]!;
      const s = maxSync.get(c.id);
      if (s && avaliadaEm.getTime() < s.getTime() - 5000) stale += 1;
      if (c.evaluations.some((e) => e.segment === "TRIAGEM")) comTriagem += 1;
    }
    const todas = conversas.flatMap((c) => c.evaluations.map((e) => e.evaluatedAt.getTime()));
    console.log("  ja repontuadas: " + jaFeitas.length);
    console.log("    com segmento TRIAGEM: " + comTriagem);
    console.log("    avaliadas ANTES da ultima carga de mensagens: " + stale);
    console.log("  ultima avaliacao gravada: " + new Date(Math.max(...todas)).toISOString());
    console.log("  conversas com cache de exatamente 20 msgs (truncadas): " +
      sync.filter((s) => s._count._all === 20).length);
  }
  await prisma.$disconnect();
}
main();
