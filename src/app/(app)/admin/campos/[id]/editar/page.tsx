import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { CampoForm } from "@/components/admin/CampoForm";
import { atualizarCampo } from "../../actions";
import { getAuthContext, canManageSector } from "@/lib/auth/context";

export default async function EditarCampoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();

  const prisma = getPrisma();
  const field = await prisma.customField.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!field) notFound();
  if (!canManageSector(ctx, field.sectorCode)) notFound();

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/admin/campos" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Campos Customizados
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Editar</span>
      </div>

      <h1 className="text-[20px] font-semibold text-fg tracking-[-0.01em] mb-6">Editar Campo</h1>

      <div className="bg-surface border border-border rounded-lg p-6">
        <CampoForm
          action={atualizarCampo}
          cancelHref="/admin/campos"
          sectorOptions={[]}
          defaultValues={{
            id: field.id,
            sectorCode: field.sectorCode,
            entityType: field.entityType,
            label: field.label,
            fieldType: field.fieldType,
            options: Array.isArray(field.options) ? (field.options as string[]) : [],
            required: field.required,
            order: field.order,
          }}
        />
      </div>
    </div>
  );
}
