import { RedefinirSenhaPortalForm } from "@/components/portal/RedefinirSenhaPortalForm";
import { redefinirSenhaDoPortal } from "./actions";

export default async function RedefinirSenhaDoPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[380px]">
        <h1 className="text-[length:var(--fs-title)] font-semibold text-fg">Nova senha</h1>
        <p className="text-[length:var(--fs-helper)] text-fg-muted mt-1 mb-6">
          Escolha uma senha para acessar o portal.
        </p>
        <RedefinirSenhaPortalForm token={token ?? ""} action={redefinirSenhaDoPortal} />
      </div>
    </div>
  );
}
