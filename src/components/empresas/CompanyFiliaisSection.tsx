import Link from "next/link";
import { Building2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusDot } from "@/components/shared/StatusDot";
import { formatCnpj } from "@/lib/format";
import { nomeExibicao } from "@/lib/companyName";
import type { CompanyStatus } from "@/generated/prisma/enums";

type Empresa = {
  id: string;
  name: string;
  displayName: string | null;
  cnpj: string | null;
  status: CompanyStatus;
  city: string | null;
  stateCode: string | null;
};

type Props = {
  /** A matriz desta empresa, quando ela própria é filial. */
  matriz: { id: string; name: string; displayName: string | null; cnpj: string | null } | null;
  filiais: Empresa[];
  statusLabel: Record<CompanyStatus, string>;
  statusColor: Record<CompanyStatus, string>;
};

export function CompanyFiliaisSection({ matriz, filiais, statusLabel, statusColor }: Props) {
  // Uma empresa é uma coisa ou outra, nunca as duas ao mesmo tempo na prática —
  // mas o schema permite os dois níveis, então a tela mostra o que existir.
  if (!matriz && filiais.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Building2 />}
          title="Sem filiais"
          description="Esta empresa não é filial de nenhuma outra e não tem filiais cadastradas. O vínculo é definido no campo “Empresa matriz”, ao editar."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {matriz && (
        <Card className="p-5">
          <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-3">Esta empresa é filial de</h2>
          <Link href={`/empresas/${matriz.id}`} className="font-medium text-fg hover:text-brand transition-colors">
            {nomeExibicao(matriz)}
          </Link>
          {matriz.cnpj && (
            <span className="ml-2 text-[length:var(--fs-helper)] text-fg-muted tnum">{formatCnpj(matriz.cnpj)}</span>
          )}
        </Card>
      )}

      {filiais.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <h2 className="text-[length:var(--fs-section)] font-semibold text-fg px-5 pt-5 pb-3">
            Filiais ({filiais.length})
          </h2>
          <div className="scroll-x overflow-x-auto">
            <table className="w-full min-w-[560px] text-[length:var(--fs-body)]">
              <thead>
                <tr className="border-y border-border bg-table-header-bg">
                  <th className="text-left px-5 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Nome</th>
                  <th className="text-left px-5 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">CNPJ</th>
                  <th className="text-left px-5 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Status</th>
                  <th className="text-left px-5 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Localização</th>
                </tr>
              </thead>
              <tbody>
                {filiais.map((f) => (
                  <tr key={f.id} className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/empresas/${f.id}`} className="font-medium text-fg hover:text-brand transition-colors">
                        {nomeExibicao(f)}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-fg-secondary tnum">{formatCnpj(f.cnpj)}</td>
                    <td className="px-5 py-3">
                      <StatusDot color={statusColor[f.status]} label={statusLabel[f.status]} />
                    </td>
                    <td className="px-5 py-3 text-fg-secondary">
                      {f.city && f.stateCode ? `${f.city}/${f.stateCode}` : f.city ?? f.stateCode ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
