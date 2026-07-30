import Link from "next/link";
import { notFound } from "next/navigation";
import { UsuarioForm } from "@/components/admin/UsuarioForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { criarUsuario } from "../actions";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { assignableRoles, ROLE_OPTIONS } from "@/lib/roles";
import { getSectorMaps } from "@/lib/sectors";
import { canAddUser } from "@/lib/subscriptions";

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
      <PageContainer variant="narrow">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/admin/usuarios" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
            Usuários
          </Link>
          <span className="text-fg-muted">/</span>
          <span className="text-[13px] text-fg">Novo Usuário</span>
        </div>

        <div className="rounded-lg border border-warning/30 bg-warning-bg px-4 py-3">
          <p className="text-[13px] text-fg">{seatCheck.reason}</p>
        </div>

        <Link
          href="/admin/usuarios"
          className="inline-flex items-center h-9 px-4 mt-4 rounded-md border border-border text-[13px] text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors"
        >
          Voltar para Usuários
        </Link>
      </PageContainer>
    );
  }

  return (
    <PageContainer variant="narrow">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/admin/usuarios" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Usuários
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Novo Usuário</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Novo Usuário</h1>

      <div className="bg-surface border border-border rounded-lg p-6">
        <UsuarioForm
          action={criarUsuario}
          cancelHref="/admin/usuarios"
          roleOptions={roleOptions}
          sectorOptions={sectorOptions}
        />
      </div>
    </PageContainer>
  );
}
