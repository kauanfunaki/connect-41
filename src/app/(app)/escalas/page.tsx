import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";

export default async function EscalasPage() {
  const ctx = await getAuthContext();
  const prisma = getPrisma();

  const now = new Date();
  const in30Days = new Date(now);
  in30Days.setDate(in30Days.getDate() + 30);

  const entries = await prisma.scheduleEntry.findMany({
    where: {
      tenantId: ctx.tenantId,
      date: { gte: now, lte: in30Days },
      status: { notIn: ["CANCELADA"] },
    },
    orderBy: { date: "asc" },
    include: { person: { select: { id: true, name: true } }, shift: { select: { name: true } } },
  });

  const grouped = entries.reduce<Record<string, typeof entries>>((acc, e) => {
    const key = e.date.toLocaleDateString("pt-BR");
    (acc[key] ??= []).push(e);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Escala — Próximos 30 dias</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          {entries.length} lançamento{entries.length !== 1 ? "s" : ""} de escala
        </p>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="bg-surface border border-border rounded-lg py-16 text-center text-[13px] text-fg-muted">
          Nenhuma escala montada para os próximos 30 dias.
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([date, items]) => (
            <div key={date}>
              <h2 className="text-[13px] font-semibold text-fg mb-2">{date}</h2>
              <div className="bg-surface border border-border rounded-lg divide-y divide-border">
                {items.map((e) => (
                  <Link
                    key={e.id}
                    href={`/pessoas/${e.person.id}`}
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-surface-2 transition-colors"
                  >
                    <p className="text-[13px] text-fg">{e.person.name}</p>
                    <span className="text-[12px] text-fg-muted">
                      {e.dayOff ? "Folga" : e.shift?.name ?? "Sem turno definido"}
                      {e.isHoliday && " · Feriado"}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
