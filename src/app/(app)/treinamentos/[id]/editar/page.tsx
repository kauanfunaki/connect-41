import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { TrainingForm } from "@/components/treinamentos/TrainingForm";
import { atualizarTreinamento } from "../../actions";

export default async function EditarTreinamentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const training = await prisma.training.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!training) notFound();

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/treinamentos" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Treinamentos</Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/treinamentos/${id}`} className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[200px]">{training.name}</Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Editar</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Editar Treinamento</h1>

      <div className="bg-surface border border-border rounded-lg p-6">
        <TrainingForm
          action={atualizarTreinamento}
          cancelHref={`/treinamentos/${id}`}
          defaultValues={{
            id: training.id,
            name: training.name,
            description: training.description ?? undefined,
            workloadHours: training.workloadHours?.toString(),
            validityMonths: training.validityMonths ?? undefined,
          }}
        />
      </div>
    </div>
  );
}
