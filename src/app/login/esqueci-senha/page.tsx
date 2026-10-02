import { AuthShell } from "@/components/login/AuthShell";
import { EsqueciSenhaForm } from "@/components/login/EsqueciSenhaForm";
import { solicitarRedefinicaoSenha } from "./actions";

// O cliente do portal chega aqui por /portal/esqueci-senha, com `?de=portal`,
// para o "Voltar para o login" devolvê-lo ao login dele, e não ao da equipe.
export default async function EsqueciSenhaPage({ searchParams }: { searchParams: Promise<{ de?: string }> }) {
  const { de } = await searchParams;
  return (
    <AuthShell subtitle="Informe o seu e-mail e enviamos um link para criar uma senha nova">
      <EsqueciSenhaForm action={solicitarRedefinicaoSenha} voltarPara={de === "portal" ? "/portal/login" : "/login"} />
    </AuthShell>
  );
}
