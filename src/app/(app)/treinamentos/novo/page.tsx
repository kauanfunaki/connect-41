import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { canManageSector } from "@/lib/auth/context";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { TrainingForm } from "@/components/treinamentos/TrainingForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { criarTreinamento } from "../actions";

export default async function NovoTreinamentoPage() {
  const { ctx, setor } = await abrirTelaDoModulo("dp_treinamentos");
  if (!canManageSector(ctx, setor)) notFound();

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Treinamentos", href: "/treinamentos" }, { label: "Novo" }]} />
      <PageHeader title="Novo treinamento" />

      <Card className="p-6">
        <TrainingForm action={criarTreinamento} cancelHref="/treinamentos" />
      </Card>
    </PageContainer>
  );
}
