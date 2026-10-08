import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
import { TituloDeSecao } from "@/components/portal/TituloDeSecao";
import { SenhaDaConta } from "@/components/portal/SenhaDaConta";
import { TemaDoPortal } from "@/components/portal/TemaDoPortal";
import { getPrisma } from "@/lib/prisma";
import { getPortalSession } from "@/lib/auth/portal";
import { nomeExibicao, razaoSocialSecundaria } from "@/lib/companyName";
import { rotuloDoDocumento } from "@/lib/companyTaxId";
import { formatDocumento } from "@/lib/format";
import { enviarLinkParaCriarSenha, trocarSenhaDoPortal } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Minha conta do cliente (12A da página de decisões, 08/10/2026): a senha, as
 * empresas que o acesso enxerga e o tema do portal. Antes não havia onde trocar
 * a senha estando logado (só pelo "Esqueci"), ver as empresas do acesso nem
 * escolher o tema.
 *
 * As empresas são as do grupo do acesso, a mesma régua de `alcanceDoCliente`:
 * o que aparece aqui é exatamente o que as outras telas mostram. Só leitura —
 * incluir ou tirar empresa é com o escritório.
 */
export default async function MinhaContaDoPortalPage() {
  const sessao = await getPortalSession();
  if (!sessao) redirect("/portal/login");

  const prisma = getPrisma();
  const [conta, empresas] = await Promise.all([
    prisma.portalUser.findFirst({
      where: { id: sessao.sub, tenantId: sessao.tenantId, clientGroupId: sessao.clientGroupId, active: true },
      select: { email: true },
    }),
    prisma.company.findMany({
      where: { tenantId: sessao.tenantId, clientGroupId: sessao.clientGroupId },
      select: { id: true, name: true, displayName: true, kind: true, cnpj: true, cpf: true },
    }),
  ]);
  if (!conta) redirect("/portal/login");

  const lista = empresas
    .map((e) => ({
      id: e.id,
      nome: nomeExibicao(e),
      razaoSocial: razaoSocialSecundaria(e),
      documento: `${rotuloDoDocumento(e.kind)} ${formatDocumento(e.kind, e.cnpj, e.cpf)}`,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <PageContainer>
      <PortalCabecalho
        titulo="Minha conta"
        descricao="A sua senha, as empresas do seu acesso e o tema do portal."
        somenteLeitura={false}
      />

      <section aria-labelledby="conta-senha" className="mb-8 max-w-3xl">
        <TituloDeSecao id="conta-senha">Senha</TituloDeSecao>
        <Card className="p-5">
          <SenhaDaConta email={conta.email} trocar={trocarSenhaDoPortal} enviarLink={enviarLinkParaCriarSenha} />
        </Card>
      </section>

      <section aria-labelledby="conta-empresas" className="mb-8 max-w-3xl">
        <TituloDeSecao id="conta-empresas">Empresas</TituloDeSecao>
        <Card>
          {lista.length === 0 ? (
            <EmptyState
              icon={<Building2 />}
              title="Nenhuma empresa neste acesso"
              description="Quando o escritório ligar uma empresa ao seu acesso, ela aparece aqui e nas outras telas do portal."
            />
          ) : (
            <ul className="divide-y divide-border-soft">
              {lista.map((e) => (
                <li key={e.id} className="flex items-start gap-3 px-4 py-3">
                  <span aria-hidden className="mt-0.5 inline-flex size-8 flex-shrink-0 items-center justify-center rounded-md bg-surface-2 text-fg-secondary [&>svg]:size-4">
                    <Building2 />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-body font-medium text-fg break-words">{e.nome}</span>
                    <span className="block text-ui text-fg-muted break-words tabular-nums">
                      {e.razaoSocial ? `${e.razaoSocial} · ` : ""}
                      {e.documento}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {lista.length > 0 && (
          <p className="mt-2 text-helper text-fg-muted">Para incluir ou tirar uma empresa do seu acesso, fale com o escritório.</p>
        )}
      </section>

      <section aria-labelledby="conta-tema" className="max-w-3xl">
        <TituloDeSecao id="conta-tema">Tema</TituloDeSecao>
        <Card className="p-5 flex flex-col gap-3">
          <p className="text-helper text-fg-muted">
            &ldquo;Do aparelho&rdquo; segue o claro ou o escuro do seu celular ou computador. A escolha vale para este navegador.
          </p>
          <TemaDoPortal />
        </Card>
      </section>
    </PageContainer>
  );
}
