import { RedefinirSenhaPortalForm } from "@/components/portal/RedefinirSenhaPortalForm";
import { redefinirSenhaDoPortal } from "./actions";
import { MolduraDoPortal } from "@/components/portal/MolduraDoPortal";
import { marcaDaEntradaDoPortal } from "@/lib/portal/marcaNaEntrada";
import { donoDoTokenDeRedefinicao } from "@/lib/auth/passwordReset";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";

export default async function RedefinirSenhaDoPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  // A marca do escritório da conta do link (22/10/2026) — o link não é gasto aqui.
  const marca = await marcaDaEntradaDoPortal({ token });
  // O link é conferido ao abrir, sem gastá-lo (auditoria de UX, 30/10/2026):
  // antes o cliente só descobria que tinha vencido depois de digitar as duas
  // senhas, e a mensagem não levava a lugar nenhum. Quem troca a senha continua
  // sendo a action, que confere de novo e consome o token.
  const dono = token ? await donoDoTokenDeRedefinicao(token).catch(() => null) : null;
  const valido = dono?.subject === "PORTAL_USER";

  if (!valido) {
    return (
      <MolduraDoPortal titulo="Link vencido" subtitulo="Este link de nova senha não vale mais." marca={marca}>
        <div className="flex flex-col gap-4">
          <Aviso tom="atencao">
            O link expirou, já foi usado ou veio incompleto. Peça outro: ele chega no seu e-mail em alguns minutos.
          </Aviso>
          <Button href="/portal/esqueci-senha" className="w-full">
            Pedir novo link
          </Button>
          <Button href="/portal/login" variant="secondary" className="w-full">
            Voltar para o login
          </Button>
        </div>
      </MolduraDoPortal>
    );
  }

  return (
    <MolduraDoPortal titulo="Nova senha" subtitulo="Escolha uma senha para acessar o portal." marca={marca}>
      <RedefinirSenhaPortalForm token={token ?? ""} action={redefinirSenhaDoPortal} />
    </MolduraDoPortal>
  );
}
