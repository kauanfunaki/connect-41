"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import type { CompanyStatus } from "@/generated/prisma/enums";

type Row = {
  id: string;
  name: string;
  cnpj: string | null;
  status: CompanyStatus;
  email: string | null;
  createdAtLabel: string;
};

type Props = {
  companies: Row[];
  canCreate: boolean;
  isSuperAdmin: boolean;
  statusLabel: Record<CompanyStatus, string>;
  statusStyle: Record<CompanyStatus, string>;
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
  statusStyle,
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
          <div className="py-16 text-center text-[13px] text-fg-muted">
            Nenhuma empresa encontrada.
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                {canCreate && (
                  <th className="w-10 px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="w-3.5 h-3.5 rounded border-border"
                    />
                  </th>
                )}
                <th className="text-left px-4 py-2.5 text-[12px] font-medium text-fg-muted">Nome</th>
                <th className="text-left px-4 py-2.5 text-[12px] font-medium text-fg-muted">CNPJ</th>
                <th className="text-left px-4 py-2.5 text-[12px] font-medium text-fg-muted">Status</th>
                <th className="text-left px-4 py-2.5 text-[12px] font-medium text-fg-muted">E-mail</th>
                <th className="text-left px-4 py-2.5 text-[12px] font-medium text-fg-muted">Criada em</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border last:border-0 hover:bg-surface-2 transition-colors"
                >
                  {canCreate && (
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleOne(c.id)}
                        className="w-3.5 h-3.5 rounded border-border"
                      />
                    </td>
                  )}
                  <td className="px-4 py-2.5">
                    <Link href={`/empresas/${c.id}`} className="font-medium text-fg hover:text-brand transition-colors">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-fg-muted tnum">{c.cnpj ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusStyle[c.status]}`}>
                      {statusLabel[c.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-fg-muted">{c.email ?? "—"}</td>
                  <td className="px-4 py-2.5 text-fg-muted tnum">{c.createdAtLabel}</td>
                  <td className="px-4 py-2.5 text-right">
                    {canCreate && (
                      <Link href={`/empresas/${c.id}/editar`} className="text-[12px] text-fg-muted hover:text-fg transition-colors">
                        Editar
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <select
          value={bulkStatus}
          onChange={(e) => setBulkStatus(e.target.value as CompanyStatus)}
          className="h-8 px-2 rounded-md border border-border bg-canvas text-[12px] text-fg outline-none"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
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
