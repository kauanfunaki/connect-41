import { redirect } from "next/navigation";
import { getPortalSession } from "@/lib/auth/portal";
import { entrarNoPortal } from "./actions";
import { PortalLoginForm } from "@/components/portal/PortalLoginForm";
import { MolduraDoPortal } from "@/components/portal/MolduraDoPortal";
import { escritorioDaFicha } from "@/lib/leads/servidor";

export default async function PortalLoginPage() {
  // Já logado não vê a tela de login de novo.
  if (await getPortalSession()) redirect("/portal");

  // O "Não possui conta?" só aparece com a ficha recebendo — botão para uma
  // ficha fora do ar é pior que botão nenhum.
  const ficha = await escritorioDaFicha();

  return (
    <MolduraDoPortal
      titulo="Bem-vindo de volta"
      subtitulo="Acompanhe a sua empresa com o escritório: documentos, pendências, aprovações e processos."
    >
      <PortalLoginForm action={entrarNoPortal} fichaDisponivel={ficha !== null} />
    </MolduraDoPortal>
  );
}
