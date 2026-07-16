import Link from "next/link";
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
          Este link de redefinição de senha é inválido ou incompleto. Solicite um novo em{" "}
          <Link href="/login/esqueci-senha" className="font-medium text-brand hover:underline">
            Esqueci minha senha
          </Link>
          .
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell subtitle="Defina sua nova senha">
      <RedefinirSenhaForm action={redefinirSenha} token={token} />
    </AuthShell>
  );
}
