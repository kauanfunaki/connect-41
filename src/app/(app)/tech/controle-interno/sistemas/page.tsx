import { notFound } from "next/navigation";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { MODULO_TECH_INTERNO, ROTA_TECH_INTERNO } from "@/lib/tech-interno/regras";
import { opcoesTech } from "@/lib/tech-interno/servidor";
import { CadastroSistemas } from "@/components/tech-interno/CadastroSistemas";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";

export default async function SistemasTechPage() {
  const { ctx } = await abrirTelaDoModulo(MODULO_TECH_INTERNO);
  if (!await podeNoModulo(ctx, MODULO_TECH_INTERNO, "gerir")) notFound();
  const { tools } = await opcoesTech(ctx);
  return <PageContainer><PageHeader title="Sistemas" subtitle="Os sistemas e ferramentas usados no controle interno do Tech." action={<Button variant="secondary" href={ROTA_TECH_INTERNO}>Voltar para a lista</Button>} />
    <section className="bg-surface border border-border rounded-lg p-5 max-w-3xl"><CadastroSistemas tools={tools} /></section>
  </PageContainer>;
}
