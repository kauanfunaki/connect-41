import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { UsuarioForm } from "@/components/admin/UsuarioForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { criarUsuario } from "../actions";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { assignableRoles, ROLE_OPTIONS } from "@/lib/roles";
import { getSectorMaps } from "@/lib/sectors";
import { canAddUser } from "@/lib/subscriptions";
import { Aviso } from "@/components/ui/Aviso";

export default async function NovoUsuarioPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  const allowed = assignableRoles(ctx.role);
  const roleOptions = ROLE_OPTIONS.filter((r) => allowed.includes(r.value));
  const { options: sectorOptions } = await getSectorMaps(ctx.tenantId);

  // A listagem já esconde o botão quando o limite estourou; isto cobre quem
  // chega por URL direta, pra não preencher um formulário que não salva.
  const seatCheck = await canAddUser(ctx.tenantId);
  if (!seatCheck.allowed) {
    return (
      <PageContainer>
        <Breadcrumb items={[{ label: "Usuários", href: "/admin/usuarios" }, { label: "Novo Usuário" }]} />

        <Aviso tom="atencao">
          <p className="text-fg">{seatCheck.reason}</p>
        </Aviso>

        <Button href="/admin/usuarios" variant="secondary" className="mt-4">
          <ArrowLeft size={14} /> Voltar para Usuários
        </Button>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Usuários", href: "/admin/usuarios" }, { label: "Novo Usuário" }]} />
      <PageHeader title="Novo Usuário" />

      <div className="max-w-[720px]">
        <Card className="p-6">
          <UsuarioForm
            action={criarUsuario}
            cancelHref="/admin/usuarios"
            roleOptions={roleOptions}
            sectorOptions={sectorOptions}
          />
        </Card>
      </div>
    </PageContainer>
  );
}
