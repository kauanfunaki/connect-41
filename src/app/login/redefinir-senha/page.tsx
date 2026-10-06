import { Button } from "@/components/ui/Button";
import { AuthShell } from "@/components/login/AuthShell";
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
      <AuthShell subtitle="Link inválido">
        <p className="text-[13px] text-fg-muted text-center leading-relaxed">
          Este link de redefinição de senha é inválido ou incompleto.
        </p>
        {/* Revisão de 05/10: botão não é link — pedir outro link é ação. */}
        <div className="mt-3 text-center">
          <Button href="/login/esqueci-senha" variant="secondary" size="sm">
            Pedir novo link
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell subtitle="Defina sua nova senha">
      <RedefinirSenhaForm action={redefinirSenha} token={token} />
    </AuthShell>
  );
}
