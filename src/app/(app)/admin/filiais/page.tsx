import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { Building2 } from "lucide-react";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getAllBranches } from "@/lib/branches";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function FiliaisPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  const branches = await getAllBranches(ctx.tenantId);

  return (
    <PageContainer>
      <PageHeader
        title="Filiais"
        subtitle={<>{branches.length} filial{branches.length !== 1 ? "is" : ""} cadastrada{branches.length !== 1 ? "s" : ""} —
            organizacional apenas, não isola dados entre elas.</>}
        action={<><Button
          href="/admin/filiais/novo"
          variant="primary" className="font-medium"
        >
          + Nova Filial
        </Button></>}
      />
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        {branches.length === 0 ? (
          <EmptyState
            icon={<Building2 />}
            title="Nenhuma filial cadastrada"
            description="Cadastre as filiais do tenant — é só organizacional, não isola dados entre elas."
            action={
              <Button
                href="/admin/filiais/novo"
                variant="primary" className="font-medium"
              >
                + Nova Filial
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-border">
            {branches.map((b) => (
              <div key={b.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <p className="text-[13px] font-medium text-fg truncate">{b.name}</p>
                  {!b.active && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface-2 text-fg-muted border border-border flex-shrink-0">
                      Inativa
                    </span>
                  )}
                </div>
                <Link
                  href={`/admin/filiais/${b.id}/editar`}
                  className="text-[12px] text-fg-muted hover:text-fg transition-colors flex-shrink-0"
                >
                  Editar
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
