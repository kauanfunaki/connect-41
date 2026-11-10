import { notFound } from "next/navigation";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { MODULO_TECH_INTERNO } from "@/lib/tech-interno/regras";
import { opcoesTech } from "@/lib/tech-interno/servidor";
import { FormularioItem } from "@/components/tech-interno/FormularioItem";
import { VoltarParaALista } from "@/components/tech-interno/VoltaDaLista";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";

// A volta para a lista vem da aba do navegador, não mais do `?voltar=` do
// endereço (10/11/2026): um `?voltar=` de um link antigo é só ignorado.
export default async function NovoItemTechPage() {
  const { ctx } = await abrirTelaDoModulo(MODULO_TECH_INTERNO);
  if (!await podeNoModulo(ctx, MODULO_TECH_INTERNO, "agir")) notFound();
  const [opcoes, podeDefinirTamanho] = await Promise.all([opcoesTech(ctx), podeNoModulo(ctx, MODULO_TECH_INTERNO, "gerir")]);
  return <PageContainer><PageHeader title="Novo item" subtitle="Registre o que precisa ser feito pela equipe Tech." action={<VoltarParaALista />} />
    {/* A largura toda, em duas colunas: o texto à esquerda, os detalhes ao
        lado (05/11/2026, opção A). Os cartões são do próprio formulário. */}
    <FormularioItem {...opcoes} podeEditar podeDefinirTamanho={podeDefinirTamanho} />
  </PageContainer>;
}
