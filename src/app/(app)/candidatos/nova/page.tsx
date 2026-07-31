import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { CandidatoForm } from "@/components/candidatos/CandidatoForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { criarCandidato } from "../actions";
import { getAuthContext, canWrite } from "@/lib/auth/context";

export default async function NovoCandidatoPage() {
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  return (
    <PageContainer variant="narrow">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/candidatos" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Candidatos
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Novo Candidato</span>
      </div>
      <PageHeader title="Novo Candidato" />

      <div className="bg-surface border border-border rounded-lg p-6">
        <CandidatoForm action={criarCandidato} cancelHref="/candidatos" />
      </div>
    </PageContainer>
  );
}
