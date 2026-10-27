import { notFound } from "next/navigation";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { MODULO_TECH_INTERNO, destinoDeVolta } from "@/lib/tech-interno/regras";
import { opcoesTech } from "@/lib/tech-interno/servidor";
import { CadastroSistemas } from "@/components/tech-interno/CadastroSistemas";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default async function SistemasTechPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo(MODULO_TECH_INTERNO), voltar = destinoDeVolta((await searchParams).voltar);
  if (!await podeNoModulo(ctx, MODULO_TECH_INTERNO, "gerir")) notFound();
  const { tools } = await opcoesTech(ctx);
  return <PageContainer><PageHeader title="Sistemas" subtitle="Os sistemas e ferramentas usados no controle interno do Tech." action={<Button variant="secondary" href={voltar}>Voltar para a lista</Button>} />
    <Card as="section" className="p-5 max-w-3xl"><CadastroSistemas tools={tools} /></Card>
  </PageContainer>;
}
