import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { UsuarioForm } from "@/components/admin/UsuarioForm";
import { atualizarUsuario } from "../../actions";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { assignableRoles, ROLE_OPTIONS } from "@/lib/roles";
import { getSectorMaps } from "@/lib/sectors";

export default async function EditarUsuarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const user = await prisma.user.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { sectors: true },
  });

  if (!user) notFound();
  if (user.role === "SUPER_ADMIN" && ctx.role !== "SUPER_ADMIN") notFound();

  const isSelf = user.id === ctx.userId;
  const allowed = assignableRoles(ctx.role);
  const roleOptions = ROLE_OPTIONS.filter((r) => allowed.includes(r.value) || r.value === user.role);
  const { options: sectorOptions } = await getSectorMaps(ctx.tenantId);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/admin/usuarios" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Usuários
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Editar</span>
      </div>

      <h1 className="text-[20px] font-semibold text-fg tracking-[-0.01em] mb-6">
        Editar Usuário
      </h1>

      <div className="bg-surface border border-border rounded-lg p-6">
        <UsuarioForm
          action={atualizarUsuario}
          cancelHref="/admin/usuarios"
          roleOptions={roleOptions}
          sectorOptions={sectorOptions}
          isSelf={isSelf}
          defaultValues={{
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            active: user.active,
            sectors: user.sectors.map((s) => s.sectorCode),
          }}
        />
      </div>
    </div>
  );
}
