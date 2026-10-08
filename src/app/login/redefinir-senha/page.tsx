import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MolduraDaEquipe } from "@/components/login/MolduraDaEquipe";
import { RedefinirSenhaForm } from "@/components/login/RedefinirSenhaForm";
import { redefinirSenha } from "./actions";

export default async function RedefinirSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <MolduraDaEquipe titulo="Link inválido" subtitulo="Peça um link novo para criar a sua senha.">
        <Card className="p-6">
          <p className="text-ui text-fg-muted text-center leading-relaxed">
            Este link de redefinição de senha é inválido ou incompleto.
          </p>
          {/* Revisão de 05/10: botão não é link — pedir outro link é ação. */}
          <div className="mt-3 text-center">
            <Button href="/login/esqueci-senha" variant="secondary" size="sm">
              Pedir novo link
            </Button>
          </div>
        </Card>
      </MolduraDaEquipe>
    );
  }

  return (
    <MolduraDaEquipe titulo="Nova senha" subtitulo="Escolha uma senha para acessar o Connect.">
      <Card className="p-6">
        <RedefinirSenhaForm action={redefinirSenha} token={token} />
      </Card>
    </MolduraDaEquipe>
  );
}
