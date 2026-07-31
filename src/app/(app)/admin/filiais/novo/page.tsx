import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { FilialForm } from "@/components/admin/FilialForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { criarFilial } from "../actions";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";

export default async function NovaFilialPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  return (
    <PageContainer variant="narrow">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/admin/filiais" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Filiais
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Nova Filial</span>
      </div>
      <PageHeader title="Nova Filial" />

      <div className="bg-surface border border-border rounded-lg p-6">
        <FilialForm action={criarFilial} cancelHref="/admin/filiais" />
      </div>
    </PageContainer>
  );
}
