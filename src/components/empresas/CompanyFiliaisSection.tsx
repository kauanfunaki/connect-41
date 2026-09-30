import Link from "next/link";
import { Building2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusDot } from "@/components/shared/StatusDot";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
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

/** "Cidade/UF", ou o que houver dos dois — o mesmo texto na célula e no funil. */
function localDe(f: Empresa): string | null {
  if (f.city && f.stateCode) return `${f.city}/${f.stateCode}`;
  return f.city ?? f.stateCode ?? null;
}

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

      {/* Tabela no casco padrão (30/09), com o título fora dela: dentro de um
          Card eram duas bordas. Todas as filiais já vêm, então o funil de
          status e de localização filtra no navegador. */}
      {filiais.length > 0 && (
        <section>
          <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-3">Filiais ({filiais.length})</h2>
          <TabelaFiltravel
            linhas={filiais.map((f) => ({
              id: f.id,
              valores: { status: statusLabel[f.status], local: localDe(f) ?? "" },
            }))}
          >
            <div className="c41-tabela scroll-x overflow-x-auto bg-surface border border-border rounded-lg">
              <table className="w-full min-w-[560px] text-[length:var(--fs-body)]">
                <thead>
                  <tr className="border-b border-border text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">
                    <th className="px-5 py-3">Nome</th>
                    <th className="px-5 py-3">CNPJ</th>
                    <th className="px-5 py-3">
                      <FiltroDaColuna rotulo="Status" chave="status" />
                    </th>
                    <th className="px-5 py-3">
                      <FiltroDaColuna rotulo="Localização" chave="local" align="right" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filiais.map((f) => (
                    <LinhaFiltravel key={f.id} id={f.id} className="border-b border-border">
                      <td className="px-5 py-3">
                        <Link href={`/empresas/${f.id}`} className="font-medium text-fg hover:text-brand transition-colors">
                          {nomeExibicao(f)}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-fg-secondary tnum">{formatCnpj(f.cnpj)}</td>
                      <td className="px-5 py-3">
                        <StatusDot color={statusColor[f.status]} label={statusLabel[f.status]} />
                      </td>
                      <td className="px-5 py-3 text-fg-secondary">{localDe(f) ?? "—"}</td>
                    </LinhaFiltravel>
                  ))}
                </tbody>
              </table>
            </div>
          </TabelaFiltravel>
        </section>
      )}
    </div>
  );
}
