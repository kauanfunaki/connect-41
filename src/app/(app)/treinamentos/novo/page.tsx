import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { TrainingForm } from "@/components/treinamentos/TrainingForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { criarTreinamento } from "../actions";

export default async function NovoTreinamentoPage() {
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  return (
    <PageContainer variant="narrow">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/treinamentos" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Treinamentos</Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Novo</span>
      </div>
      <PageHeader title="Novo Treinamento" />

      <Card className="p-6">
        <TrainingForm action={criarTreinamento} cancelHref="/treinamentos" />
      </Card>
    </PageContainer>
  );
}
