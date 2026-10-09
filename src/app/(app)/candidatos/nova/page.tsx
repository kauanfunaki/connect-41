import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { CandidatoForm } from "@/components/candidatos/CandidatoForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { criarCandidato } from "../actions";
import { canManageSector } from "@/lib/auth/context";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";

export default async function NovoCandidatoPage() {
  const { ctx, setor } = await abrirTelaDoModulo("recrutamento_candidatos");
  if (!canManageSector(ctx, setor)) notFound();

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Candidatos", href: "/candidatos" }, { label: "Novo candidato" }]} />
      <PageHeader title="Novo candidato" />

      <Card className="p-6">
        <CandidatoForm action={criarCandidato} cancelHref="/candidatos" />
      </Card>
    </PageContainer>
  );
}
