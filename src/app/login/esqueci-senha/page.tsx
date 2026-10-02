import { AuthShell } from "@/components/login/AuthShell";
import { MolduraDoPortal } from "@/components/portal/MolduraDoPortal";
import { Card } from "@/components/ui/Card";
import { EsqueciSenhaForm } from "@/components/login/EsqueciSenhaForm";
import { solicitarRedefinicaoSenha } from "./actions";

// O cliente do portal chega aqui por /portal/esqueci-senha, com `?de=portal`,
// para o "Voltar para o login" devolvê-lo ao login dele, e não ao da equipe.
export default async function EsqueciSenhaPage({ searchParams }: { searchParams: Promise<{ de?: string }> }) {
  const { de } = await searchParams;
  // O cliente vê a moldura do portal (02/10/2026), e não a da equipe, que fala
  // de "Contábil, Fiscal, Societário, DP/RH…".
  if (de === "portal") {
    return (
      <MolduraDoPortal titulo="Esqueci minha senha" subtitulo="Informe o seu e-mail e enviamos um link para criar uma senha nova.">
        <Card className="p-6">
          <EsqueciSenhaForm action={solicitarRedefinicaoSenha} voltarPara="/portal/login" />
        </Card>
      </MolduraDoPortal>
    );
  }
  return (
    <AuthShell subtitle="Informe o seu e-mail e enviamos um link para criar uma senha nova">
      <EsqueciSenhaForm action={solicitarRedefinicaoSenha} voltarPara="/login" />
    </AuthShell>
  );
}
