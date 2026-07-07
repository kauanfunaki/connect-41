import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { TrainingForm } from "@/components/treinamentos/TrainingForm";
import { criarTreinamento } from "../actions";

export default async function NovoTreinamentoPage() {
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/treinamentos" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Treinamentos</Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Novo</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Novo Treinamento</h1>

      <div className="bg-surface border border-border rounded-lg p-6">
        <TrainingForm action={criarTreinamento} cancelHref="/treinamentos" />
      </div>
    </div>
  );
}
