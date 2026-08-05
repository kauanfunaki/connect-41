import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { IdCard, AlertTriangle } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  agruparPorFamilia,
  detectarDivergenciasNome,
  SENIORITY_LABEL,
  type CargoLike,
} from "@/lib/cargoMatriz";

// Bloco 4 do levantamento de RH/DP ("Implantação de Cargos e Salários") —
// setor Gestão (decisão do usuário, 2026-07-10). Cargo já existe como model
// escopado por empresa (src/app/(app)/empresas/[id]/cargos); esta tela é a
// visão cross-empresa pedida no levantamento, sem duplicar o CRUD.
//
// Era uma lista plana paginada; virou matriz agrupada por família + trilha de
// senioridade, que é o que o escopo chama de "organização por família, área ou
// hierarquia" e "matriz simples de cargos e salários". Sem paginação de
// propósito: a matriz só faz sentido inteira (é o retrato da estrutura).
export default async function CargosSalariosPage() {
  const ctx = await getAuthContext();
  const prisma = getPrisma();
  const canViewSalary = await canViewSensitiveField(ctx, "SALARIO");

  const cargos = await prisma.cargo.findMany({
    where: { tenantId: ctx.tenantId, active: true },
    orderBy: [{ family: "asc" }, { name: "asc" }],
    include: {
      company: { select: { id: true, name: true } },
      _count: { select: { people: true } },
    },
  });

  const rows: CargoLike[] = cargos.map((c) => ({
    id: c.id,
    name: c.name,
    family: c.family,
    seniority: c.seniority,
    area: c.area,
    companyName: c.company.name,
    peopleCount: c._count.people,
    salaryRangeMin: c.salaryRangeMin != null ? Number(c.salaryRangeMin) : null,
    salaryRangeMid: c.salaryRangeMid != null ? Number(c.salaryRangeMid) : null,
    salaryRangeMax: c.salaryRangeMax != null ? Number(c.salaryRangeMax) : null,
  }));

  const grupos = agruparPorFamilia(rows);
  const divergencias = detectarDivergenciasNome(cargos.map((c) => ({ name: c.name, companyName: c.company.name })));
  const totalDegraus = grupos.reduce((sum, g) => sum + g.degrausInvertidos.length, 0);
  const semClassificacao = rows.filter((r) => !r.family || !r.seniority).length;

  const fmt = (v: number | null) =>
    v == null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  const companyIdByCargo = new Map(cargos.map((c) => [c.id, c.company.id]));

  return (
    <PageContainer>
      <PageHeader
        title="Cargos e Salários"
        subtitle={
          <>
            {rows.length} cargo{rows.length !== 1 ? "s" : ""} em {grupos.length} família
            {grupos.length !== 1 ? "s" : ""} — matriz de cargos, trilha de senioridade e faixas salariais.
          </>
        }
      />

      {/* Achados estruturais primeiro: é o que a implantação precisa corrigir. */}
      {(totalDegraus > 0 || divergencias.length > 0 || semClassificacao > 0) && (
        <Card className="p-5 mb-4 border-warning/30">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-warning" />
            <h2 className="text-[14px] font-semibold text-fg">Pontos de atenção da estrutura</h2>
          </div>
          <ul className="space-y-2">
            {totalDegraus > 0 && canViewSalary && (
              <li className="text-[13px] text-fg-secondary">
                <strong className="text-fg">{totalDegraus} degrau(s) invertido(s)</strong> — nível mais alto com faixa
                inicial menor que a do nível anterior na mesma família (detalhado abaixo).
              </li>
            )}
            {divergencias.length > 0 && (
              <li className="text-[13px] text-fg-secondary">
                <strong className="text-fg">{divergencias.length} nome(s) com grafia divergente</strong> — mesmo cargo
                escrito de formas diferentes:{" "}
                {divergencias
                  .slice(0, 3)
                  .map((d) => d.variantes.map((v) => `"${v.nome}"`).join(" / "))
                  .join("; ")}
                {divergencias.length > 3 && "…"}
              </li>
            )}
            {semClassificacao > 0 && (
              <li className="text-[13px] text-fg-secondary">
                <strong className="text-fg">{semClassificacao} cargo(s) sem família ou nível</strong> — classifique na
                ficha do cargo para entrarem na trilha.
              </li>
            )}
          </ul>
        </Card>
      )}

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IdCard />}
            title="Nenhum cargo cadastrado ainda."
            description="Cadastre cargos na ficha de cada empresa."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {grupos.map((g) => {
            const invertidoIds = new Set(g.degrausInvertidos.map((d) => d.cargo.id));
            return (
              <Card key={g.family} className="overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-surface-2 flex-wrap">
                  <h2 className="text-[13px] font-semibold text-fg">{g.label}</h2>
                  <span className="text-[12px] text-fg-muted">
                    {g.cargos.length} cargo{g.cargos.length !== 1 ? "s" : ""} · {g.totalPessoas} colaborador
                    {g.totalPessoas !== 1 ? "es" : ""}
                  </span>
                </div>

                <div className="scroll-x overflow-x-auto">
                  <table className="w-full text-[13px]" style={{ minWidth: "760px" }}>
                    <thead>
                      <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-fg-muted">
                        <th scope="col" className="px-4 py-2.5 font-medium sticky left-0 bg-surface">Nível</th>
                        <th scope="col" className="px-4 py-2.5 font-medium">Cargo</th>
                        <th scope="col" className="px-4 py-2.5 font-medium">Empresa</th>
                        <th scope="col" className="px-4 py-2.5 font-medium">Área</th>
                        <th scope="col" className="px-4 py-2.5 font-medium text-right">Pessoas</th>
                        {canViewSalary && <th scope="col" className="px-4 py-2.5 font-medium text-right">Faixa salarial</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {g.cargos.map((c) => (
                        <tr key={c.id} className="hover:bg-surface-2 transition-colors">
                          <td className="px-4 py-2.5 sticky left-0 bg-surface">
                            {c.seniority ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border bg-brand/10 text-brand border-brand/25 whitespace-nowrap">
                                {SENIORITY_LABEL[c.seniority]}
                              </span>
                            ) : (
                              <span className="text-[12px] text-fg-muted">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-fg font-medium">
                            <Link
                              href={`/empresas/${companyIdByCargo.get(c.id)}/cargos/${c.id}/editar`}
                              className="hover:text-brand transition-colors"
                            >
                              {c.name}
                            </Link>
                            {invertidoIds.has(c.id) && canViewSalary && (
                              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-warning/10 text-warning border-warning/25">
                                degrau invertido
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-fg-muted">{c.companyName}</td>
                          <td className="px-4 py-2.5 text-fg-muted">{c.area ?? "—"}</td>
                          <td className="px-4 py-2.5 text-fg-muted tnum text-right">{c.peopleCount}</td>
                          {canViewSalary && (
                            <td className="px-4 py-2.5 text-fg-muted tnum text-right whitespace-nowrap">
                              {fmt(c.salaryRangeMin)} – {fmt(c.salaryRangeMax)}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
