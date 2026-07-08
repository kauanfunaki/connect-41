"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { StatusDot } from "@/components/shared/StatusDot";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";

type Row = {
  id: string;
  name: string;
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
  inativarPessoasEmMassa: (ids: string[]) => Promise<void>;
};

export function PessoasTable({ people, canCreate, inativarPessoasEmMassa }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

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
    const count = selected.size;
    const ids = Array.from(selected);
    startTransition(async () => {
      await inativarPessoasEmMassa(ids);
      setSelected(new Set());
      setConfirmOpen(false);
      toast.success(`${count} pessoa(s) inativada(s).`);
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
                      className="c41-checkbox"
                    />
                  </th>
                )}
                <th className="text-left px-4 py-2.5 text-[12px] font-medium text-fg-muted">Nome</th>
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
                <tr
                  key={p.id}
                  className={`border-b border-border last:border-0 transition-colors ${
                    selected.has(p.id) ? "bg-brand/[0.06] hover:bg-brand/[0.09]" : "hover:bg-surface-2"
                  }`}
                >
                  {canCreate && (
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleOne(p.id)}
                        className="c41-checkbox"
                      />
                    </td>
                  )}
                  <td className="px-4 py-2.5">
                    <Link href={`/pessoas/${p.id}`} className="font-medium text-fg hover:text-brand transition-colors">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusDot
                      color={p.active ? "var(--c41-success)" : "var(--c41-neutral-400)"}
                      label={p.active ? "Ativo" : "Inativo"}
                    />
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
          onClick={() => setConfirmOpen(true)}
          className="h-8 px-3 rounded-md border border-danger/30 text-[12px] font-medium text-danger hover:bg-danger/8 transition-colors"
        >
          Inativar
        </button>
      </BulkActionBar>

      <ConfirmDialog
        open={confirmOpen}
        title={`Inativar ${selected.size} pessoa(s)?`}
        description="As pessoas selecionadas serão arquivadas (não excluídas) e deixam de aparecer como ativas."
        confirmLabel="Inativar"
        destructive
        pending={pending}
        onConfirm={applyInativar}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
