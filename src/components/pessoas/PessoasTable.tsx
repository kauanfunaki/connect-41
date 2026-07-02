"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import type { PersonType } from "@/generated/prisma/enums";

type Row = {
  id: string;
  name: string;
  type: PersonType;
  active: boolean;
  cpf: string | null;
  email: string | null;
  companyName: string | null;
  companyId: string | null;
  createdAtLabel: string;
};

type Props = {
  people: Row[];
  canCreate: boolean;
  typeLabel: Record<PersonType, string>;
  typeStyle: Record<PersonType, string>;
  inativarPessoasEmMassa: (ids: string[]) => Promise<void>;
};

export function PessoasTable({ people, canCreate, typeLabel, typeStyle, inativarPessoasEmMassa }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const allSelected = people.length > 0 && selected.size === people.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(people.map((p) => p.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyInativar() {
    if (!confirm(`Inativar ${selected.size} pessoa(s) selecionada(s)?`)) return;
    const ids = Array.from(selected);
    setSelected(new Set());
    startTransition(() => {
      inativarPessoasEmMassa(ids);
    });
  }

  return (
    <>
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        {people.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-fg-muted">Nenhuma pessoa encontrada.</div>
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
                <th className="text-left px-4 py-2.5 text-[12px] font-medium text-fg-muted">Tipo</th>
                <th className="text-left px-4 py-2.5 text-[12px] font-medium text-fg-muted">Status</th>
                <th className="text-left px-4 py-2.5 text-[12px] font-medium text-fg-muted">CPF</th>
                <th className="text-left px-4 py-2.5 text-[12px] font-medium text-fg-muted">E-mail</th>
                <th className="text-left px-4 py-2.5 text-[12px] font-medium text-fg-muted">Empresa</th>
                <th className="text-left px-4 py-2.5 text-[12px] font-medium text-fg-muted">Criada em</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface-2 transition-colors">
                  {canCreate && (
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleOne(p.id)}
                        className="w-3.5 h-3.5 rounded border-border"
                      />
                    </td>
                  )}
                  <td className="px-4 py-2.5">
                    <Link href={`/pessoas/${p.id}`} className="font-medium text-fg hover:text-brand transition-colors">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${typeStyle[p.type]}`}>
                      {typeLabel[p.type]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                        p.active
                          ? "bg-success/10 text-success border-success/25"
                          : "bg-surface-2 text-fg-muted border-border"
                      }`}
                    >
                      {p.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-fg-muted tnum">{p.cpf ?? "—"}</td>
                  <td className="px-4 py-2.5 text-fg-muted">{p.email ?? "—"}</td>
                  <td className="px-4 py-2.5 text-fg-muted">
                    {p.companyId ? (
                      <Link href={`/empresas/${p.companyId}`} className="hover:text-brand transition-colors">
                        {p.companyName}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-fg-muted tnum">{p.createdAtLabel}</td>
                  <td className="px-4 py-2.5 text-right">
                    {canCreate && (
                      <Link href={`/pessoas/${p.id}/editar`} className="text-[12px] text-fg-muted hover:text-fg transition-colors">
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
        <button
          type="button"
          onClick={applyInativar}
          className="h-8 px-3 rounded-md border border-danger/30 text-[12px] font-medium text-danger hover:bg-danger/8 transition-colors"
        >
          Inativar
        </button>
      </BulkActionBar>
    </>
  );
}
