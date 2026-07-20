import Link from "next/link";
import { IdCard } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";
import { PageContainer } from "@/components/shared/PageContainer";
import { Pagination } from "@/components/shared/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";

const PER_PAGE = 30;

// Bloco 4 do levantamento de RH/DP ("Implantação de Cargos e Salários") —
// setor Gestão (decisão do usuário, 2026-07-10). Cargo já existe como model
// escopado por empresa (src/app/(app)/empresas/[id]/cargos); esta tela é a
// visão cross-empresa (matriz) pedida no levantamento, sem duplicar o CRUD
// que já existe na ficha de cada empresa.
export default async function CargosSalariosPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const ctx = await getAuthContext();
  const prisma = getPrisma();
  const canViewSalary = await canViewSensitiveField(ctx, "SALARIO");

  const pageNum = Math.max(1, parseInt(page ?? "1"));
  const where = { tenantId: ctx.tenantId, active: true };

  const [cargos, total] = await Promise.all([
    prisma.cargo.findMany({
      where,
      orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
      skip: (pageNum - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        company: { select: { id: true, name: true } },
        _count: { select: { people: true } },
      },
    }),
    prisma.cargo.count({ where }),
  ]);
  const totalPages = Math.ceil(total / PER_PAGE);

  const fmt = (v: unknown) =>
    v == null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Cargos e Salários</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          {total} cargo{total !== 1 ? "s" : ""} — matriz de cargos, áreas e faixas salariais de todas as empresas.
        </p>
      </div>

      {cargos.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg">
          <EmptyState
            icon={<IdCard />}
            title="Nenhum cargo cadastrado ainda."
            description="Cadastre cargos na ficha de cada empresa."
          />
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="scroll-x overflow-x-auto">
          <table className="w-full min-w-[600px] text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-fg-muted">
                <th className="px-4 py-2.5 font-medium">Cargo</th>
                <th className="px-4 py-2.5 font-medium">Empresa</th>
                <th className="px-4 py-2.5 font-medium">Área</th>
                <th className="px-4 py-2.5 font-medium">Colaboradores</th>
                {canViewSalary && <th className="px-4 py-2.5 font-medium">Faixa salarial</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cargos.map((c) => (
                <tr key={c.id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2.5 text-fg font-medium">{c.name}</td>
                  <td className="px-4 py-2.5">
                    <Link href={`/empresas/${c.company.id}/cargos`} className="text-fg-muted hover:text-fg hover:underline">
                      {c.company.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-fg-muted">{c.area ?? "—"}</td>
                  <td className="px-4 py-2.5 text-fg-muted tnum">{c._count.people}</td>
                  {canViewSalary && (
                    <td className="px-4 py-2.5 text-fg-muted tnum">
                      {fmt(c.salaryRangeMin)} – {fmt(c.salaryRangeMax)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <Pagination page={pageNum} totalPages={totalPages} buildHref={(p) => `/cargos-salarios?page=${p}`} />
    </PageContainer>
  );
}
