import { headers } from "next/headers";

export default async function HomePage() {
  const h = await headers();
  const role = h.get("x-user-role") ?? "";
  const sectorsRaw = h.get("x-user-sectors") ?? "";
  const sectors = sectorsRaw ? sectorsRaw.split(",").filter(Boolean) : [];

  const isAdmin = role === "SUPER_ADMIN" || role === "ADMIN";

  return (
    <div className="p-6 max-w-5xl">
      {/* Heading */}
      <div className="mb-6">
        <h1 className="text-[20px] font-semibold text-fg tracking-[-0.01em]">
          Início
        </h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          Bem-vindo ao Connect 41 — CRM interno da 41 Tech.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Empresas cadastradas" value="—" note="em breve" />
        <StatCard label="Pessoas cadastradas" value="—" note="em breve" />
        <StatCard label="Pipelines ativos" value="—" note="em breve" />
      </div>

      {/* Info banner */}
      <div className="bg-surface border border-border rounded-lg p-5 mb-4">
        <p className="text-[13px] font-medium text-fg mb-1">
          Plataforma em configuração
        </p>
        <p className="text-[13px] text-fg-muted leading-relaxed">
          A fundação técnica está operando: autenticação multi-tenant, RBAC e
          modelo de dados do núcleo estão ativos. Os módulos de Empresas,
          Pessoas e Pipelines serão habilitados nas próximas etapas.
        </p>
      </div>

      {/* Admin-only: quick access to sectors */}
      {isAdmin && sectors.length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-5">
          <p className="text-[13px] font-medium text-fg mb-3">
            Setores com acesso
          </p>
          <div className="flex flex-wrap gap-2">
            {sectors.map((s) => (
              <span
                key={s}
                className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-surface-2 text-fg-secondary border border-border"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-lg px-4 py-4">
      <p className="text-[12px] text-fg-muted mb-1">{label}</p>
      <p className="text-[24px] font-semibold text-fg tnum leading-none mb-1">
        {value}
      </p>
      <p className="text-[11px] text-fg-muted">{note}</p>
    </div>
  );
}
