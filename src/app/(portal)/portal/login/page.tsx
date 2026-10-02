import { redirect } from "next/navigation";
import { getPortalSession } from "@/lib/auth/portal";
import { entrarNoPortal } from "./actions";
import { PortalLoginForm } from "@/components/portal/PortalLoginForm";
import { MolduraDoPortal } from "@/components/portal/MolduraDoPortal";

export default async function PortalLoginPage() {
  // Já logado não vê a tela de login de novo.
  if (await getPortalSession()) redirect("/portal");

  return (
    <MolduraDoPortal
      titulo="Bem-vindo de volta"
      subtitulo="Acompanhe a sua empresa com o escritório: documentos, pendências, aprovações e processos."
    >
      <PortalLoginForm action={entrarNoPortal} />
    </MolduraDoPortal>
  );
}
