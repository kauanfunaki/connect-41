import { MolduraDaEquipe } from "@/components/login/MolduraDaEquipe";
import { MolduraDoPortal } from "@/components/portal/MolduraDoPortal";
import { Card } from "@/components/ui/Card";
import { EsqueciSenhaForm } from "@/components/login/EsqueciSenhaForm";
import { solicitarRedefinicaoSenha } from "./actions";

// O cliente do portal chega aqui por /portal/esqueci-senha, com `?de=portal`,
// para o "Voltar para o login" devolvê-lo ao login dele, e não ao da equipe.
export default async function EsqueciSenhaPage({ searchParams }: { searchParams: Promise<{ de?: string }> }) {
  const { de } = await searchParams;
  // O cliente vê a moldura do portal (02/10/2026); a equipe, a dela (06/10/2026).
  // O desenho é o mesmo — muda o rótulo e o carrossel, que no portal fala do
  // que o cliente encontra lá dentro.
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
    <MolduraDaEquipe titulo="Esqueci minha senha" subtitulo="Informe o seu e-mail e enviamos um link para criar uma senha nova.">
      <Card className="p-6">
        <EsqueciSenhaForm action={solicitarRedefinicaoSenha} voltarPara="/login" />
      </Card>
    </MolduraDaEquipe>
  );
}
