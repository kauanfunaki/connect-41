import { redirect } from "next/navigation";
import { getEnabledModuleCodes } from "@/lib/modules";
import { nomeDoAcessoNoPortal } from "@/lib/portal/empresasDaContaDb";
import { telasBloqueadasDoPortal } from "@/lib/portal/telasBloqueadas";
import { sessaoAtivaDoPortal } from "@/app/(portal)/usuario";
import { PortalShell } from "@/components/portal/PortalShell";
import { ToastProvider } from "@/components/ui/Toast";
import { TutorialDoPortal } from "@/components/tutorial/TutorialDoPortal";
import { EstiloDaAparencia } from "@/components/aparencia/EstiloDaAparencia";
import { aparenciaDoEscritorio } from "@/lib/aparencia/leitura";
import { CeciDoPortal } from "@/components/portal/CeciDoPortal";
import { ceciNoPortalDaConta } from "@/lib/portal/ceci";
import { primeiroNomeParaOPrompt } from "@/lib/ia/ceci";
import { getPrisma } from "@/lib/prisma";
import { sugestaoLigada } from "@/lib/solicitacoes/sugestaoServidor";

// A moldura de quem já entrou no portal: sidebar com as telas, o nome do
// acesso (a empresa, ou a primeira e quantas mais — era o nome do Cliente até
// 14/10/2026) e o sair.
//
// Num grupo de rotas, `(area)`, para o login, o esqueci-senha e o
// redefinir-senha ficarem de fora sem condicional nenhuma — e sem depender de o
// layout compartilhado re-renderizar no logout para a sidebar sumir. O grupo
// não entra na URL: as telas continuam em /portal/...
//
// O `ToastProvider` é o mesmo da área da equipe: componente compartilhado que
// avisa o resultado de uma ação (o `ConfirmActionButton` do "Cancelar
// solicitação", por exemplo) chama `useToast`, que lança sem o provedor. Sem
// ele aqui, a tela da solicitação dava 500 para o cliente (achado em 01/10).
export default async function AreaDoClienteLayout({ children }: { children: React.ReactNode }) {
  // Conta desativada volta ao login mesmo com token válido — com o "lembrar de
  // mim" (05/10/2026) o token vive 30 dias. O login também confere, então não
  // há laço entre os dois.
  const sessao = await sessaoAtivaDoPortal();
  if (!sessao) redirect("/portal/login");

  // As telas que o escritório ainda não liberou (14/10/2026) saem do menu. O
  // layout não roda de novo a cada navegação: quem barra o endereço direto é
  // cada tela (`telaBloqueadaNoPortal`).
  //
  // As cores e o logo do escritório (21/10/2026, Administração › Empresa ›
  // Aparência do portal). Sem nada escolhido, o `EstiloDaAparencia` não
  // escreve nada e o portal é o de sempre.
  // A Ceci (21/10/2026) só aparece quando o escritório a ligou para alguma
  // empresa do acesso, com o agente ligado e chave de IA. A rota da pergunta
  // confere tudo de novo — isto só desenha o botão.
  const [nome, modulos, bloqueadas, { aparencia, escritorio }, comCeci, conta] = await Promise.all([
    nomeDoAcessoNoPortal(sessao.tenantId, sessao.sub),
    getEnabledModuleCodes(sessao.tenantId),
    telasBloqueadasDoPortal(sessao.tenantId),
    aparenciaDoEscritorio(sessao.tenantId),
    ceciNoPortalDaConta(sessao.tenantId, sessao.sub).catch((err) => {
      console.error("[portal] Ceci", err);
      return false;
    }),
    getPrisma().portalUser.findFirst({ where: { id: sessao.sub, tenantId: sessao.tenantId }, select: { name: true } }),
  ]);
  const logo = aparencia.logoNoPortal && escritorio.logoUrl ? { src: escritorio.logoUrl, nome: escritorio.nome } : null;
  // "Sugestão ou problema" no rodapé do menu (21/10/2026). Falha aqui não
  // derruba o portal: o botão só não aparece.
  const comSugestao = await sugestaoLigada(sessao.tenantId, modulos, bloqueadas).catch((err) => {
    console.error("[portal] sugestão", err);
    return false;
  });

  return (
    <ToastProvider>
      <EstiloDaAparencia aparencia={aparencia} />
      <PortalShell grupoNome={nome} modulos={[...modulos]} bloqueadas={[...bloqueadas]} logo={logo} sugestao={comSugestao}>
        {children}
      </PortalShell>
      <TutorialDoPortal />
      {comCeci && <CeciDoPortal primeiroNome={primeiroNomeParaOPrompt(conta?.name)} />}
    </ToastProvider>
  );
}

