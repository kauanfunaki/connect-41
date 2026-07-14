"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { StatusDot } from "@/components/shared/StatusDot";
import { EmptyState } from "@/components/ui/EmptyState";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { AvatarImage } from "@/components/shared/AvatarImage";

// Mascara o miolo do CPF na listagem (dado pessoal exposto a qualquer usuário
// do tenant) — mantém início/fim visíveis o bastante pra localizar visualmente
// sem expor o CPF completo por extenso numa tela de navegação/busca.
function maskCpf(cpf: string | null): string {
  if (!cpf) return "—";
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.***.***-${digits.slice(9)}`;
}

type Row = {
  id: string;
  name: string;
  active: boolean;
  cpf: string | null;
  email: string | null;
  photoUrl: string | null;
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
          <EmptyState icon={<Users />} title="Nenhuma pessoa encontrada" />
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
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Status</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">CPF</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">E-mail</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Empresa</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Criada em</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr
                  key={p.id}
                  className={`border-b border-border last:border-0 transition-colors ${
                    selected.has(p.id) ? "bg-selected-bg" : "hover:bg-surface-hover"
                  }`}
                >
                  {canCreate && (
                    <td className="px-4 py-3">
                      <Checkbox checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <Link href={`/pessoas/${p.id}`} className="flex items-center gap-2.5 font-medium text-fg hover:text-brand transition-colors">
                      <AvatarImage src={p.photoUrl} name={p.name} size={28} shape="circle" fontSize={11} />
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusDot
                      color={p.active ? "var(--c41-success)" : "var(--c41-fg-muted)"}
                      label={p.active ? "Ativo" : "Inativo"}
                    />
                  </td>
                  <td className="px-4 py-3 text-fg-secondary tnum">{maskCpf(p.cpf)}</td>
                  <td className="px-4 py-3 text-fg-secondary">{p.email ?? "—"}</td>
                  <td className="px-4 py-3 text-fg-secondary">
                    {p.companyId ? (
                      <Link href={`/empresas/${p.companyId}`} className="hover:text-brand transition-colors">
                        {p.companyName}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-fg-secondary tnum">{p.createdAtLabel}</td>
                  <td className="px-4 py-3 text-right">
                    {canCreate && (
                      <Link href={`/pessoas/${p.id}/editar`} className="text-[13px] font-medium text-fg-muted hover:text-fg transition-colors">
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
          onClick={() => setConfirmOpen(true)}
          className="h-8 px-3 rounded-md border border-danger/30 text-[13px] font-semibold text-danger hover:bg-danger-bg transition-colors"
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
