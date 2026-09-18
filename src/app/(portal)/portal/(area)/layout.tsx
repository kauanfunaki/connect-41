import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getPortalSession } from "@/lib/auth/portal";
import { getEnabledModuleCodes } from "@/lib/modules";
import { PortalShell } from "@/components/portal/PortalShell";

// A moldura de quem já entrou no portal: sidebar com as telas, o grupo do
// cliente e o sair.
//
// Num grupo de rotas, `(area)`, para o login, o esqueci-senha e o
// redefinir-senha ficarem de fora sem condicional nenhuma — e sem depender de o
// layout compartilhado re-renderizar no logout para a sidebar sumir. O grupo
// não entra na URL: as telas continuam em /portal/...
export default async function AreaDoClienteLayout({ children }: { children: React.ReactNode }) {
  const sessao = await getPortalSession();
  if (!sessao) redirect("/portal/login");

  const prisma = getPrisma();
  const [grupo, modulos] = await Promise.all([
    prisma.clientGroup.findUnique({ where: { id: sessao.clientGroupId }, select: { name: true } }),
    getEnabledModuleCodes(sessao.tenantId),
  ]);

  return (
    <PortalShell grupoNome={grupo?.name ?? null} modulos={[...modulos]}>
      {children}
    </PortalShell>
  );
}
