import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { CandidatoForm } from "@/components/candidatos/CandidatoForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { criarCandidato } from "../actions";
import { getAuthContext, canWrite } from "@/lib/auth/context";

export default async function NovoCandidatoPage() {
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Candidatos", href: "/candidatos" }, { label: "Novo Candidato" }]} />
      <PageHeader title="Novo Candidato" />

      <Card className="p-6">
        <CandidatoForm action={criarCandidato} cancelHref="/candidatos" />
      </Card>
    </PageContainer>
  );
}
