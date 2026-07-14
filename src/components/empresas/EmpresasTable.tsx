"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { StatusDot } from "@/components/shared/StatusDot";
import { EmptyState } from "@/components/ui/EmptyState";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select } from "@/components/ui/Select";
import { AvatarImage } from "@/components/shared/AvatarImage";
import type { CompanyStatus } from "@/generated/prisma/enums";

type Tag = { sectorCode: string; label: string; color: string; responsibleName: string };

type Row = {
  id: string;
  name: string;
  cnpj: string | null;
  status: CompanyStatus;
  email: string | null;
  taxRegime: string | null;
  createdAtLabel: string;
  logoUrl: string | null;
  tags: Tag[];
};

type Props = {
  companies: Row[];
  canCreate: boolean;
  isSuperAdmin: boolean;
  statusLabel: Record<CompanyStatus, string>;
  statusColor: Record<CompanyStatus, string>;
  atualizarStatusEmMassa: (ids: string[], status: CompanyStatus) => Promise<void>;
  excluirEmpresasEmMassa: (ids: string[]) => Promise<void>;
};

const STATUS_OPTIONS: { value: CompanyStatus; label: string }[] = [
  { value: "PROSPECT", label: "Prospecto" },
  { value: "ACTIVE", label: "Ativo" },
  { value: "INACTIVE", label: "Inativo" },
  { value: "CHURNED", label: "Cancelado" },
];

export function EmpresasTable({
  companies,
  canCreate,
  isSuperAdmin,
  statusLabel,
  statusColor,
  atualizarStatusEmMassa,
  excluirEmpresasEmMassa,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<CompanyStatus>("ACTIVE");
  const [, startTransition] = useTransition();

  const allSelected = companies.length > 0 && selected.size === companies.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(companies.map((c) => c.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyStatus() {
    const ids = Array.from(selected);
    setSelected(new Set());
    startTransition(() => {
      atualizarStatusEmMassa(ids, bulkStatus);
    });
  }

  function applyDelete() {
    if (!confirm(`Excluir ${selected.size} empresa(s) selecionada(s)? Esta ação não pode ser desfeita.`)) return;
    const ids = Array.from(selected);
    setSelected(new Set());
    startTransition(() => {
      excluirEmpresasEmMassa(ids);
    });
  }

  return (
    <>
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        {companies.length === 0 ? (
          <EmptyState icon={<Building2 />} title="Nenhuma empresa encontrada" />
        ) : (
          <div className="scroll-x overflow-x-auto">
          <table className="w-full min-w-[860px] text-[length:var(--fs-body)]">
            <thead>
              <tr className="border-b border-border bg-table-header-bg">
                {canCreate && (
                  <th className="w-10 px-4 py-3">
                    <Checkbox checked={allSelected} onChange={toggleAll} />
                  </th>
                )}
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Nome</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">CNPJ</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Status</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Regime</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Responsáveis</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Criada em</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr
                  key={c.id}
                  className={`border-b border-border last:border-0 transition-colors ${
                    selected.has(c.id) ? "bg-selected-bg" : "hover:bg-surface-hover"
                  }`}
                >
                  {canCreate && (
                    <td className="px-4 py-3">
                      <Checkbox checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <Link href={`/empresas/${c.id}`} className="flex items-center gap-2.5 font-medium text-fg hover:text-brand transition-colors">
                      <AvatarImage src={c.logoUrl} name={c.name} size={28} shape="lg" fontSize={11} />
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-fg-secondary tnum">{c.cnpj ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusDot color={statusColor[c.status]} label={statusLabel[c.status]} />
                  </td>
                  <td className="px-4 py-3 text-fg-secondary">{c.taxRegime ?? "—"}</td>
                  <td className="px-4 py-3">
                    {c.tags.length === 0 ? (
                      <span className="text-fg-muted">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {c.tags.map((t) => (
                          <span
                            key={t.sectorCode}
                            title={`${t.label}: ${t.responsibleName}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface-hover text-fg-secondary border border-border whitespace-nowrap"
                          >
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: t.color }} />
                            {t.label}: {t.responsibleName}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-fg-secondary tnum">{c.createdAtLabel}</td>
                  <td className="px-4 py-3 text-right">
                    {canCreate && (
                      <Link href={`/empresas/${c.id}/editar`} className="text-[13px] font-medium text-fg-muted hover:text-fg transition-colors">
                        Editar
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <div className="w-40">
          <Select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value as CompanyStatus)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>
        <button
          type="button"
          onClick={applyStatus}
          className="h-8 px-3 rounded-md bg-brand text-on-brand text-[12px] font-medium hover:bg-brand-hover transition-colors"
        >
          Alterar status
        </button>
        {isSuperAdmin && (
          <button
            type="button"
            onClick={applyDelete}
            className="h-8 px-3 rounded-md border border-danger/30 text-[12px] font-medium text-danger hover:bg-danger/8 transition-colors"
          >
            Excluir
          </button>
        )}
      </BulkActionBar>
    </>
  );
}
