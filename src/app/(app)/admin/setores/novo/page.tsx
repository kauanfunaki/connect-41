import Link from "next/link";
import { notFound } from "next/navigation";
import { SetorForm } from "@/components/admin/SetorForm";
import { criarSetor } from "../actions";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";

export default async function NovoSetorPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/admin/setores" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Setores
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Novo Setor</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Novo Setor</h1>

      <div className="bg-surface border border-border rounded-lg p-6">
        <SetorForm action={criarSetor} cancelHref="/admin/setores" />
      </div>
    </div>
  );
}
