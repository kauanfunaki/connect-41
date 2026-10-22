import { notFound } from "next/navigation";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { MODULO_TECH_INTERNO, ROTA_TECH_INTERNO } from "@/lib/tech-interno/regras";
import { opcoesTech } from "@/lib/tech-interno/servidor";
import { FormularioItem } from "@/components/tech-interno/FormularioItem";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";

export default async function NovoItemTechPage() {
  const { ctx } = await abrirTelaDoModulo(MODULO_TECH_INTERNO);
  if (!await podeNoModulo(ctx, MODULO_TECH_INTERNO, "agir")) notFound();
  const opcoes = await opcoesTech(ctx);
  return <PageContainer><PageHeader title="Novo item" subtitle="Registre o que precisa ser feito pela equipe Tech." action={<Button variant="secondary" href={ROTA_TECH_INTERNO}>Voltar para a lista</Button>} />
    <div className="bg-surface border border-border rounded-lg p-5 max-w-3xl"><FormularioItem {...opcoes} podeEditar /></div>
  </PageContainer>;
}
