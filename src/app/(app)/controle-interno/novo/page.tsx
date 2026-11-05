import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { MODULO_TECH_INTERNO, destinoDeVolta } from "@/lib/tech-interno/regras";
import { opcoesTech } from "@/lib/tech-interno/servidor";
import { FormularioItem } from "@/components/tech-interno/FormularioItem";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";

export default async function NovoItemTechPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo(MODULO_TECH_INTERNO), voltar = destinoDeVolta((await searchParams).voltar);
  if (!await podeNoModulo(ctx, MODULO_TECH_INTERNO, "agir")) notFound();
  const [opcoes, podeDefinirTamanho] = await Promise.all([opcoesTech(ctx), podeNoModulo(ctx, MODULO_TECH_INTERNO, "gerir")]);
  return <PageContainer><PageHeader title="Novo item" subtitle="Registre o que precisa ser feito pela equipe Tech." action={<Button variant="secondary" href={voltar}><ArrowLeft size={14} aria-hidden />Voltar para a lista</Button>} />
    {/* A largura toda, em duas colunas: o texto à esquerda, os detalhes ao
        lado (05/11/2026, opção A). Os cartões são do próprio formulário. */}
    <FormularioItem {...opcoes} podeEditar podeDefinirTamanho={podeDefinirTamanho} voltar={voltar} />
  </PageContainer>;
}
