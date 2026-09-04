import { redirect } from "next/navigation";
import { getPortalSession } from "@/lib/auth/portal";
import { entrarNoPortal } from "./actions";
import { PortalLoginForm } from "@/components/portal/PortalLoginForm";

export default async function PortalLoginPage() {
  // Já logado não vê a tela de login de novo.
  if (await getPortalSession()) redirect("/portal");

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[380px]">
        <h1 className="text-[length:var(--fs-title)] font-semibold text-fg">Portal do Cliente</h1>
        <p className="text-[length:var(--fs-helper)] text-fg-muted mt-1 mb-6">
          Acesse os documentos fiscais da sua empresa.
        </p>
        <PortalLoginForm action={entrarNoPortal} />
      </div>
    </div>
  );
}
