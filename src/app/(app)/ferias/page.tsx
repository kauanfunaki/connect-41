import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";

const ACTIVE_STATUSES = ["PLANEJADA", "SOLICITADA", "EM_ANALISE", "APROVADA", "PROGRAMADA", "EM_GOZO"] as const;

export default async function FeriasPage() {
  const ctx = await getAuthContext();
  const prisma = getPrisma();

  const vacations = await prisma.vacation.findMany({
    where: { tenantId: ctx.tenantId, status: { in: [...ACTIVE_STATUSES] } },
    orderBy: { concessivePeriodEnd: "asc" },
    include: { person: { select: { id: true, name: true } } },
  });

  const now = new Date();
  const vencidas = vacations.filter((v) => v.concessivePeriodEnd && v.concessivePeriodEnd < now);
  const aVencer = vacations.filter((v) => !v.concessivePeriodEnd || v.concessivePeriodEnd >= now);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Férias</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          {vacations.length} registro{vacations.length !== 1 ? "s" : ""} em aberto
        </p>
      </div>

      <Section title={`Vencidas (${vencidas.length})`} items={vencidas} empty="Nenhuma férias vencida." danger />
      <Section title={`A vencer / Programadas (${aVencer.length})`} items={aVencer} empty="Nenhuma férias a vencer." />
    </div>
  );
}

function Section({
  title,
  items,
  empty,
  danger,
}: {
  title: string;
  items: Array<{
    id: string;
    days: number;
    concessivePeriodEnd: Date | null;
    person: { id: string; name: string };
  }>;
  empty: string;
  danger?: boolean;
}) {
  return (
    <div className="mb-6">
      <h2 className={`text-[13px] font-semibold mb-2 ${danger ? "text-danger" : "text-fg"}`}>{title}</h2>
      {items.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg py-8 text-center text-[13px] text-fg-muted">{empty}</div>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {items.map((v) => (
            <Link
              key={v.id}
              href={`/pessoas/${v.person.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors"
            >
              <p className="text-[13px] text-fg">{v.person.name}</p>
              <span className="text-[12px] text-fg-muted">
                {v.days} dias
                {v.concessivePeriodEnd && ` · concessivo até ${v.concessivePeriodEnd.toLocaleDateString("pt-BR")}`}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
