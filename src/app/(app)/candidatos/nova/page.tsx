import Link from "next/link";
import { notFound } from "next/navigation";
import { CandidatoForm } from "@/components/candidatos/CandidatoForm";
import { criarCandidato } from "../actions";
import { getAuthContext, canWrite } from "@/lib/auth/context";

export default async function NovoCandidatoPage() {
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/candidatos" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Candidatos
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Novo Candidato</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Novo Candidato</h1>

      <div className="bg-surface border border-border rounded-lg p-6">
        <CandidatoForm action={criarCandidato} cancelHref="/candidatos" />
      </div>
    </div>
  );
}
