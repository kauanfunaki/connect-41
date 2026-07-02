import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { TagForm } from "@/components/admin/TagForm";
import { atualizarTag } from "../../actions";
import { getAuthContext, canManageSector } from "@/lib/auth/context";

export default async function EditarTagPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();

  const prisma = getPrisma();
  const tag = await prisma.tag.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!tag) notFound();
  if (!canManageSector(ctx, tag.sectorCode)) notFound();

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/admin/tags" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Tags
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Editar</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Editar Tag</h1>

      <div className="bg-surface border border-border rounded-lg p-6">
        <TagForm
          action={atualizarTag}
          cancelHref="/admin/tags"
          sectorOptions={[]}
          defaultValues={{ id: tag.id, sectorCode: tag.sectorCode, name: tag.name, color: tag.color }}
        />
      </div>
    </div>
  );
}
