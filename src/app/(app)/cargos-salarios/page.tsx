import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";
import { PageContainer } from "@/components/shared/PageContainer";

// Bloco 4 do levantamento de RH/DP ("Implantação de Cargos e Salários") —
// setor Gestão (decisão do usuário, 2026-07-10). Cargo já existe como model
// escopado por empresa (src/app/(app)/empresas/[id]/cargos); esta tela é a
// visão cross-empresa (matriz) pedida no levantamento, sem duplicar o CRUD
// que já existe na ficha de cada empresa.
export default async function CargosSalariosPage() {
  const ctx = await getAuthContext();
  const prisma = getPrisma();
  const canViewSalary = await canViewSensitiveField(ctx, "SALARIO");

  const cargos = await prisma.cargo.findMany({
    where: { tenantId: ctx.tenantId, active: true },
    orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
    include: {
      company: { select: { id: true, name: true } },
      _count: { select: { people: true } },
    },
  });

  const fmt = (v: unknown) =>
    v == null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Cargos e Salários</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          Matriz de cargos, áreas e faixas salariais de todas as empresas.
        </p>
      </div>

      {cargos.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg py-16 text-center text-[13px] text-fg-muted">
          Nenhum cargo cadastrado ainda. Cadastre cargos na ficha de cada empresa.
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <table className="w-full text-[13px]">
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
      )}
    </PageContainer>
  );
}
