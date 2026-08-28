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
import { maskCpf } from "@/lib/format";

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
  linkedUserName: string | null;
};

type Props = {
  people: Row[];
  canCreate: boolean;
  showLinkedUser?: boolean;
  definirAtivoPessoasEmMassa: (ids: string[], ativo: boolean) => Promise<void>;
};

export function PessoasTable({ people, canCreate, showLinkedUser = false, definirAtivoPessoasEmMassa }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Um diálogo só, servindo a ação em massa e a da linha — duas confirmações separadas
  // divergiriam no texto na primeira alteração.
  const [confirmAlvo, setConfirmAlvo] = useState<{ tipo: "massa" } | { tipo: "linha"; row: Row } | null>(null);
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

  /** Executa o que o diálogo estava confirmando — inativação, em massa ou de uma linha. */
  function confirmarInativacao() {
    if (!confirmAlvo) return;
    const ids = confirmAlvo.tipo === "massa" ? Array.from(selected) : [confirmAlvo.row.id];
    const aviso =
      confirmAlvo.tipo === "massa"
        ? `${ids.length} pessoa(s) inativada(s).`
        : `${confirmAlvo.row.name} inativado(a).`;
    startTransition(async () => {
      await definirAtivoPessoasEmMassa(ids, false);
      setSelected(new Set());
      setConfirmAlvo(null);
      toast.success(aviso);
    });
  }

  /**
   * Inativar/reativar direto na linha, sem passar pela seleção.
   *
   * Reativar não pergunta — é inofensivo e o resultado fica visível na hora. Inativar
   * tira a pessoa da listagem padrão, então passa pela mesma confirmação da ação em
   * massa: sumir da tela sem aviso faria parecer que o registro foi apagado.
   */
  function toggleAtivo(row: Row) {
    if (row.active) {
      setConfirmAlvo({ tipo: "linha", row });
      return;
    }
    startTransition(async () => {
      await definirAtivoPessoasEmMassa([row.id], true);
      toast.success(`${row.name} reativado(a).`);
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
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">
                  {showLinkedUser ? "Conta de acesso" : "Empresa"}
                </th>
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
                    {showLinkedUser ? (
                      p.linkedUserName ?? <span className="text-fg-muted">Não vinculado</span>
                    ) : p.companyId ? (
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
                      <span className="inline-flex items-center gap-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => toggleAtivo(p)}
                          className="text-[13px] font-medium text-fg-muted hover:text-fg transition-colors"
                        >
                          {p.active ? "Inativar" : "Reativar"}
                        </button>
                        <Link href={`/pessoas/${p.id}/editar`} className="text-[13px] font-medium text-fg-muted hover:text-fg transition-colors">
                          Editar
                        </Link>
                      </span>
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
          onClick={() => setConfirmAlvo({ tipo: "massa" })}
          className="h-8 px-3 rounded-md border border-danger/30 text-[13px] font-semibold text-danger hover:bg-danger-bg transition-colors"
        >
          Inativar
        </button>
      </BulkActionBar>

      <ConfirmDialog
        open={confirmAlvo !== null}
        title={
          confirmAlvo?.tipo === "linha"
            ? `Inativar ${confirmAlvo.row.name}?`
            : `Inativar ${selected.size} pessoa(s)?`
        }
        description="Fica arquivada (não é excluída) e sai da listagem padrão — para ver de novo, filtre por inativos. Dá para reativar depois."
        confirmLabel="Inativar"
        destructive
        pending={pending}
        onConfirm={confirmarInativacao}
        onCancel={() => setConfirmAlvo(null)}
      />
    </>
  );
}
