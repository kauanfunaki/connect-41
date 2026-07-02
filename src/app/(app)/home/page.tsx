import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { scopedCompanyWhere, scopedPersonWhere, scopedPipelineWhere, scopedHandoffWhere } from "@/lib/auth/scope";
import { ROLE_LABELS } from "@/lib/roles";

export default async function HomePage() {
  const ctx = await getAuthContext();

  const prisma = getPrisma();
  const [companyCount, personCount, pipelineCount, pendingHandoffs] = await Promise.all([
    prisma.company.count({ where: await scopedCompanyWhere(ctx) }),
    prisma.person.count({ where: await scopedPersonWhere(ctx) }),
    prisma.pipeline.count({ where: scopedPipelineWhere(ctx) }),
    prisma.handoff.count({ where: { ...scopedHandoffWhere(ctx), status: "PENDING" } }),
  ]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">
          Início
        </h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          Bem-vindo ao Connect 41 — CRM interno da 41 Tech.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <StatCard href="/empresas" label="Empresas" value={companyCount} />
        <StatCard href="/pessoas" label="Pessoas" value={personCount} />
        <StatCard href="/kanban" label="Kanban ativos" value={pipelineCount} />
        <StatCard
          href="/transferencias?status=PENDING"
          label="Transferências pendentes"
          value={pendingHandoffs}
          highlight={pendingHandoffs > 0}
        />
      </div>

      <div className="bg-surface border border-border rounded-lg p-5">
        <p className="text-[13px] font-medium text-fg mb-1">
          {ROLE_LABELS[ctx.role]}
        </p>
        <p className="text-[13px] text-fg-muted leading-relaxed">
          {ctx.sectors.length > 0
            ? `Você tem acesso a ${ctx.sectors.length} setor${ctx.sectors.length !== 1 ? "es" : ""}.`
            : "Você tem acesso a todos os setores do tenant."}
        </p>
      </div>
    </div>
  );
}

function StatCard({
  href,
  label,
  value,
  highlight,
}: {
  href: string;
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className="bg-surface border border-border rounded-lg px-4 py-4 hover:border-border-strong transition-colors block"
    >
      <p className="text-[12px] text-fg-muted mb-1">{label}</p>
      <p className={`text-[24px] font-semibold tnum leading-none mb-1 ${highlight ? "text-warning" : "text-fg"}`}>
        {value}
      </p>
    </Link>
  );
}
