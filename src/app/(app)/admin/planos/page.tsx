import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Globe, Package } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { baseDomain } from "@/lib/auth/activeSector";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { NovoPlanoForm } from "@/components/admin/NovoPlanoForm";
import { CartaoDoPlano } from "@/components/admin/planos/CartaoDoPlano";
import { PrecosNoSite } from "@/components/admin/planos/PrecosNoSite";
import { lerAjustesDoSite } from "@/lib/planos/site";
import { CAMPOS_DO_SITE_PADRAO } from "@/lib/planos/site-regras";
import { lerModulosDoPlano } from "@/lib/planos/modulosPorSetor";
import { valorParaOCampo } from "@/lib/planos/edicao";
import { alternarPlano, atualizarModulosPlano } from "./actions";

// O catálogo comercial em cartões (escolha A do Kauan, 14/10/2026): um cartão
// por plano, como numa página de preços, com os módulos por setor — e o que vai
// para a seção Planos do site (o interruptor dos preços no topo, os campos de
// cada plano em "Editar"). Só o Super Admin.
export default async function PlanosPage() {
  const ctx = await getAuthContext();
  if (ctx.role !== "SUPER_ADMIN") notFound();

  const prisma = getPrisma();
  const [plans, ajustes] = await Promise.all([
    prisma.subscriptionPlan.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { _count: { select: { subscriptions: true } } },
    }),
    lerAjustesDoSite(),
  ]);

  const semTabela = ajustes.situacao !== "ok";
  const noSite = plans.filter((p) => p.active && ajustes.porPlano.get(p.id)?.mostrarNoSite).length;
  // O site mora no endereço principal (app/page.tsx); sem APP_DOMAIN não há site.
  const dominio = baseDomain();

  return (
    <PageContainer>
      <PageHeader
        title="Planos"
        subtitle="O que a 41 Tech vende: quem administra, como cobra e o que cada plano libera."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {dominio && (
              <Button href={`https://${dominio}/#planos`} nativo target="_blank" rel="noopener" variant="secondary">
                <Globe size={14} /> Como aparece no site
              </Button>
            )}
            <NovoPlanoForm />
          </div>
        }
      />

      <PrecosNoSite ligado={ajustes.mostrarPrecos} sobMedida={ajustes.cartaoSobMedida} noSite={noSite} semTabela={semTabela} />

      {plans.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Package />}
            title="Nenhum plano cadastrado"
            description="Crie em “Novo plano” o primeiro plano do catálogo comercial."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {plans.map((p) => {
            const porUsuario = p.billingType === "PER_USER_MONTHLY";
            const valor = porUsuario ? p.pricePerUser : p.basePrice;
            return (
              <CartaoDoPlano
                key={p.id}
                plano={{
                  id: p.id,
                  nome: p.name,
                  modo: p.managementMode,
                  cobranca: p.billingType,
                  valor: valorParaOCampo(valor),
                  implantacao: valorParaOCampo(p.setupFee),
                  valorEmReais: Number(valor ?? 0),
                  implantacaoEmReais: Number(p.setupFee),
                  ativo: p.active,
                  clientes: p._count.subscriptions,
                  modulos: lerModulosDoPlano(p.allowedModuleCodes),
                }}
                site={semTabela ? null : (ajustes.porPlano.get(p.id) ?? CAMPOS_DO_SITE_PADRAO)}
                alternar={alternarPlano.bind(null, p.id, !p.active)}
                atualizarModulos={atualizarModulosPlano}
              />
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
