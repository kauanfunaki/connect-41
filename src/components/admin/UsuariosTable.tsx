"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { StatusDot } from "@/components/shared/StatusDot";
import { ToggleActiveButton } from "@/components/admin/ToggleActiveButton";

type SectorTag = { code: string; label: string; color: string };
type Row = {
  id: string;
  name: string;
  email: string;
  roleLabel: string;
  active: boolean;
  sectors: SectorTag[];
};

type Props = {
  users: Row[];
  currentUserId: string;
  sectorOptions: { value: string; label: string }[];
  alternarAtivoUsuario: (id: string, novoStatus: boolean) => Promise<void>;
  alternarAtivoEmMassa: (ids: string[], novoStatus: boolean) => Promise<void>;
  atribuirSetorEmMassa: (ids: string[], sectorCode: string) => Promise<void>;
};

export function UsuariosTable({
  users,
  currentUserId,
  sectorOptions,
  alternarAtivoUsuario,
  alternarAtivoEmMassa,
  atribuirSetorEmMassa,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkSector, setBulkSector] = useState(sectorOptions[0]?.value ?? "");
  const [, startTransition] = useTransition();

  const selectableUsers = users.filter((u) => u.id !== currentUserId);
  const allSelected = selectableUsers.length > 0 && selected.size === selectableUsers.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableUsers.map((u) => u.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyToggle(novoStatus: boolean) {
    const ids = Array.from(selected);
    setSelected(new Set());
    startTransition(() => {
      alternarAtivoEmMassa(ids, novoStatus);
    });
  }

  function applySector() {
    if (!bulkSector) return;
    const ids = Array.from(selected);
    setSelected(new Set());
    startTransition(() => {
      atribuirSetorEmMassa(ids, bulkSector);
    });
  }

  return (
    <>
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        {users.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-fg-muted">Nenhum usuário cadastrado ainda.</div>
        ) : (
          <table className="w-full text-[length:var(--fs-body)]">
            <thead>
              <tr className="border-b border-border bg-table-header-bg">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="c41-checkbox"
                  />
                </th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Nome</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">E-mail</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Papel</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Setores</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === currentUserId;
                const toggleAction = alternarAtivoUsuario.bind(null, u.id, !u.active);
                return (
                  <tr
                    key={u.id}
                    className={`border-b border-border last:border-0 transition-colors ${
                      selected.has(u.id) ? "bg-selected-bg" : "hover:bg-surface-hover"
                    }`}
                  >
                    <td className="px-4 py-3">
                      {!isSelf && (
                        <input
                          type="checkbox"
                          checked={selected.has(u.id)}
                          onChange={() => toggleOne(u.id)}
                          className="c41-checkbox"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/usuarios/${u.id}/editar`} className="font-medium text-fg hover:text-brand transition-colors">
                        {u.name}
                      </Link>
                      {isSelf && <span className="text-[12px] text-fg-muted ml-1.5">(você)</span>}
                    </td>
                    <td className="px-4 py-3 text-fg-secondary">{u.email}</td>
                    <td className="px-4 py-3 text-fg-secondary">{u.roleLabel}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {u.sectors.length === 0 ? (
                          <span className="text-fg-muted">—</span>
                        ) : (
                          u.sectors.map((s) => (
                            <span
                              key={s.code}
                              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium bg-surface-hover text-fg-secondary border border-border"
                            >
                              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                              {s.label}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusDot
                        color={u.active ? "var(--c41-success)" : "var(--c41-fg-muted)"}
                        label={u.active ? "Ativo" : "Inativo"}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/admin/usuarios/${u.id}/editar`} className="text-[13px] font-medium text-fg-muted hover:text-fg transition-colors">
                          Editar
                        </Link>
                        {!isSelf && <ToggleActiveButton action={toggleAction} ativo={u.active} nome={u.name} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <button
          type="button"
          onClick={() => applyToggle(true)}
          className="h-8 px-3 rounded-md border border-success/30 text-[13px] font-semibold text-success hover:bg-success-bg transition-colors"
        >
          Ativar
        </button>
        <button
          type="button"
          onClick={() => applyToggle(false)}
          className="h-8 px-3 rounded-md border border-danger/30 text-[13px] font-semibold text-danger hover:bg-danger-bg transition-colors"
        >
          Desativar
        </button>
        {sectorOptions.length > 0 && (
          <>
            <select
              value={bulkSector}
              onChange={(e) => setBulkSector(e.target.value)}
              className="h-8 px-2 rounded-md border border-border bg-canvas text-[12px] text-fg outline-none"
            >
              {sectorOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={applySector}
              className="h-8 px-3 rounded-md bg-brand text-on-brand text-[12px] font-medium hover:bg-brand-hover transition-colors"
            >
              Atribuir setor
            </button>
          </>
        )}
      </BulkActionBar>
    </>
  );
}
