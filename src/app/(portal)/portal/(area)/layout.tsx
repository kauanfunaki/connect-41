import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getEnabledModuleCodes } from "@/lib/modules";
import { sessaoAtivaDoPortal } from "@/app/(portal)/usuario";
import { PortalShell } from "@/components/portal/PortalShell";
import { ToastProvider } from "@/components/ui/Toast";

// A moldura de quem já entrou no portal: sidebar com as telas, o grupo do
// cliente e o sair.
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

  const prisma = getPrisma();
  const [grupo, modulos] = await Promise.all([
    prisma.clientGroup.findUnique({ where: { id: sessao.clientGroupId }, select: { name: true } }),
    getEnabledModuleCodes(sessao.tenantId),
  ]);

  return (
    <ToastProvider>
      <PortalShell grupoNome={grupo?.name ?? null} modulos={[...modulos]}>
        {children}
      </PortalShell>
    </ToastProvider>
  );
}
