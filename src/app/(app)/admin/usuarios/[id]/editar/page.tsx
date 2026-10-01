import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { UsuarioForm } from "@/components/admin/UsuarioForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
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
    <PageContainer>
      <Breadcrumb items={[{ label: "Usuários", href: "/admin/usuarios" }, { label: "Editar" }]} />
      <PageHeader title="Editar Usuário" />

      <div className="max-w-[720px]">
        <Card className="p-6">
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
        </Card>
      </div>
    </PageContainer>
  );
}
