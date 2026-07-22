"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { UserSearch } from "lucide-react";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { Checkbox } from "@/components/ui/Checkbox";
import { maskCpf } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";

type Row = {
  id: string;
  name: string;
  active: boolean;
  cpf: string | null;
  email: string | null;
  candidaturasCount: number;
  createdAtLabel: string;
  tags: { id: string; name: string; color: string }[];
};

type Props = {
  candidatos: Row[];
  canCreate: boolean;
  inativarCandidatosEmMassa: (ids: string[]) => Promise<void>;
};

export function CandidatosTable({ candidatos, canCreate, inativarCandidatosEmMassa }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const allSelected = candidatos.length > 0 && selected.size === candidatos.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(candidatos.map((c) => c.id)));
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
    if (!confirm(`Inativar ${selected.size} candidato(s) selecionado(s)?`)) return;
    const ids = Array.from(selected);
    setSelected(new Set());
    startTransition(() => {
      inativarCandidatosEmMassa(ids);
    });
  }

  return (
    <>
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        {candidatos.length === 0 ? (
          <EmptyState icon={<UserSearch />} title="Nenhum candidato encontrado." />
        ) : (
          <div className="scroll-x overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                {canCreate && (
                  <th className="w-10 px-4 py-2.5">
                    <Checkbox checked={allSelected} onChange={toggleAll} />
                  </th>
                )}
                <th className="text-left px-4 py-2.5 text-[12px] font-medium text-fg-muted">Nome</th>
                <th className="text-left px-4 py-2.5 text-[12px] font-medium text-fg-muted">Status</th>
                <th className="text-left px-4 py-2.5 text-[12px] font-medium text-fg-muted">Tags</th>
                <th className="text-left px-4 py-2.5 text-[12px] font-medium text-fg-muted">CPF</th>
                <th className="text-left px-4 py-2.5 text-[12px] font-medium text-fg-muted">E-mail</th>
                <th className="text-left px-4 py-2.5 text-[12px] font-medium text-fg-muted">Candidaturas</th>
                <th className="text-left px-4 py-2.5 text-[12px] font-medium text-fg-muted">Cadastrado em</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {candidatos.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-surface-2 transition-colors">
                  {canCreate && (
                    <td className="px-4 py-2.5">
                      <Checkbox checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} />
                    </td>
                  )}
                  <td className="px-4 py-2.5">
                    <Link href={`/candidatos/${c.id}`} className="font-medium text-fg hover:text-brand transition-colors">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                        c.active
                          ? "bg-success/10 text-success border-success/25"
                          : "bg-surface-2 text-fg-muted border-border"
                      }`}
                    >
                      {c.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {c.tags.length === 0 ? (
                      <span className="text-fg-muted">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {c.tags.map((t) => (
                          <span
                            key={t.id}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border"
                            style={{ background: `${t.color}1A`, color: t.color, borderColor: `${t.color}40` }}
                          >
                            {t.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-fg-muted tnum">{maskCpf(c.cpf)}</td>
                  <td className="px-4 py-2.5 text-fg-muted">{c.email ?? "—"}</td>
                  <td className="px-4 py-2.5 text-fg-muted">{c.candidaturasCount}</td>
                  <td className="px-4 py-2.5 text-fg-muted tnum">{c.createdAtLabel}</td>
                  <td className="px-4 py-2.5 text-right">
                    {canCreate && (
                      <Link href={`/candidatos/${c.id}/editar`} className="text-[12px] text-fg-muted hover:text-fg transition-colors">
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
