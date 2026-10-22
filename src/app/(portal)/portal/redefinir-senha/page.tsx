import { RedefinirSenhaPortalForm } from "@/components/portal/RedefinirSenhaPortalForm";
import { redefinirSenhaDoPortal } from "./actions";
import { MolduraDoPortal } from "@/components/portal/MolduraDoPortal";
import { marcaDaEntradaDoPortal } from "@/lib/portal/marcaNaEntrada";

export default async function RedefinirSenhaDoPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  // A marca do escritório da conta do link (22/10/2026) — o link não é gasto aqui.
  const marca = await marcaDaEntradaDoPortal({ token });

  return (
    <MolduraDoPortal titulo="Nova senha" subtitulo="Escolha uma senha para acessar o portal." marca={marca}>
      <RedefinirSenhaPortalForm token={token ?? ""} action={redefinirSenhaDoPortal} />
    </MolduraDoPortal>
  );
}
