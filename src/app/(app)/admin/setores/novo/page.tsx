import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { SetorForm } from "@/components/admin/SetorForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { criarSetor } from "../actions";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";

export default async function NovoSetorPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  return (
    <PageContainer variant="narrow">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/admin/setores" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Setores
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Novo Setor</span>
      </div>
      <PageHeader title="Novo Setor" />

      <Card className="p-6">
        <SetorForm action={criarSetor} cancelHref="/admin/setores" />
      </Card>
    </PageContainer>
  );
}
