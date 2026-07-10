import Link from "next/link";
import { ArrowRight, UserPlus, UserMinus, Palmtree } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";

// Hub que une Admissão (bloco 1), Rescisão/Desligamento (bloco 2) e Férias
// (bloco 3) do levantamento de DP/RH — mesma decisão de agrupamento do
// usuário (2026-07-10). Cada seção continua na sua própria rota/tela
// dedicada; esta página só concentra o resumo e o ponto de entrada único.
export default async function ColaboradoresPage() {
  const ctx = await getAuthContext();
  const prisma = getPrisma();

  const [admissoes, desligamentos, ferias] = await Promise.all([
    prisma.person.count({
      where: { tenantId: ctx.tenantId, type: "COLABORADOR", employmentStatus: "ADMISSAO_EM_ANDAMENTO" },
    }),
    prisma.termination.count({
      where: { tenantId: ctx.tenantId, status: { notIn: ["FINALIZADO", "CANCELADO"] } },
    }),
    prisma.vacation.count({
      where: {
        tenantId: ctx.tenantId,
        status: { in: ["PLANEJADA", "SOLICITADA", "EM_ANALISE", "APROVADA", "PROGRAMADA", "EM_GOZO"] },
      },
    }),
  ]);

  const sections = [
    {
      href: "/admissoes",
      icon: <UserPlus size={20} />,
      label: "Admissões",
      count: admissoes,
      hint: `${admissoes} em andamento`,
    },
    {
      href: "/desligamentos",
      icon: <UserMinus size={20} />,
      label: "Rescisões",
      count: desligamentos,
      hint: `${desligamentos} em processo`,
    },
    {
      href: "/ferias",
      icon: <Palmtree size={20} />,
      label: "Férias",
      count: ferias,
      hint: `${ferias} em aberto`,
    },
  ];

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Colaboradores</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          Admissões, rescisões e férias — ciclo de vida do colaborador em um só lugar.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group bg-surface border border-border rounded-2xl p-5 hover:border-border-strong hover:bg-surface-hover hover:shadow-[var(--c41-shadow-sm)] transition-all"
          >
            <span className="inline-flex w-10 h-10 rounded-xl items-center justify-center mb-4 bg-brand-500/10 text-brand-500">
              {s.icon}
            </span>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[14px] font-semibold text-fg">{s.label}</p>
              <ArrowRight
                size={15}
                className="text-fg-muted flex-shrink-0 -translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all"
              />
            </div>
            <p className="text-[20px] font-semibold text-fg tnum mt-2">{s.count}</p>
            <p className="text-[12.5px] text-fg-muted mt-0.5">{s.hint}</p>
          </Link>
        ))}
      </div>
    </PageContainer>
  );
}
