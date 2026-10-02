import { RedefinirSenhaPortalForm } from "@/components/portal/RedefinirSenhaPortalForm";
import { redefinirSenhaDoPortal } from "./actions";
import { MolduraDoPortal } from "@/components/portal/MolduraDoPortal";

export default async function RedefinirSenhaDoPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <MolduraDoPortal titulo="Nova senha" subtitulo="Escolha uma senha para acessar o portal.">
      <RedefinirSenhaPortalForm token={token ?? ""} action={redefinirSenhaDoPortal} />
    </MolduraDoPortal>
  );
}
