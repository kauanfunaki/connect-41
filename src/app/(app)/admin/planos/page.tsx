import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { TogglePlanoButton } from "@/components/admin/TogglePlanoButton";
import { MANAGEMENT_MODE_LABEL, BILLING_TYPE_LABEL } from "@/lib/subscriptions";
import { NovoPlanoForm } from "@/components/admin/NovoPlanoForm";
import { alternarPlano } from "./actions";

export default async function PlanosPage() {
  const ctx = await getAuthContext();
  if (ctx.role !== "SUPER_ADMIN") notFound();

  const prisma = getPrisma();
  const plans = await prisma.subscriptionPlan.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { _count: { select: { subscriptions: true } } },
  });

  const fmt = (v: unknown) => `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Planos</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          Catálogo comercial — frente 1 (gerenciado pela 41 Tech, valor fixo) e frente 2
          (autoatendimento, por usuário). Implantação é cobrada nos dois cenários.
        </p>
      </div>

      <NovoPlanoForm />

      {plans.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg py-16 text-center text-[13px] text-fg-muted mt-6">
          Nenhum plano cadastrado ainda.
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border mt-6">
          {plans.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-4 py-3 gap-4">
              <div className="min-w-0">
                <p className="text-[13px] text-fg font-medium">
                  {p.name} {!p.active && <span className="text-fg-muted font-normal">(inativo)</span>}
                </p>
                <p className="text-[11px] text-fg-muted mt-0.5">
                  {MANAGEMENT_MODE_LABEL[p.managementMode]} · {BILLING_TYPE_LABEL[p.billingType]} ·{" "}
                  {p.billingType === "FLAT_MONTHLY" ? `${fmt(p.basePrice)}/mês` : `${fmt(p.pricePerUser)}/usuário/mês`}
                  {" · "}implantação {fmt(p.setupFee)}
                  {" · "}{p._count.subscriptions} assinatura{p._count.subscriptions !== 1 ? "s" : ""}
                </p>
              </div>
              <TogglePlanoButton action={alternarPlano.bind(null, p.id, !p.active)} active={p.active} nome={p.name} />
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
