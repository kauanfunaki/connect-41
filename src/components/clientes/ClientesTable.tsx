"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusDot } from "@/components/shared/StatusDot";

type Row = {
  id: string;
  name: string;
  cnpjRootLabel: string | null;
  active: boolean;
  companiesCount: number;
};

type Props = {
  clientes: Row[];
  canCreate: boolean;
  alternarAtivo: (id: string) => Promise<{ error: string } | null>;
};

export function ClientesTable({ clientes, canCreate, alternarAtivo }: Props) {
  const [, startTransition] = useTransition();

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      {clientes.length === 0 ? (
        <EmptyState icon={<Building2 />} title="Nenhum cliente encontrado" />
      ) : (
        <div className="scroll-x overflow-x-auto">
          <table className="w-full min-w-[640px] text-[length:var(--fs-body)]">
            <thead>
              <tr className="border-b border-border bg-table-header-bg">
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Nome</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Raiz do CNPJ</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Empresas</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Situação</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3 font-medium text-fg">{c.name}</td>
                  <td className="px-4 py-3 text-fg-secondary tnum">{c.cnpjRootLabel ?? "—"}</td>
                  <td className="px-4 py-3 text-fg-secondary tnum">
                    {c.companiesCount > 0 ? (
                      // Leva para a listagem já filtrada — é o caminho de "quais
                      // empresas são deste cliente", que era o que faltava.
                      <Link href={`/empresas?cliente=${c.id}`} className="text-brand hover:underline">
                        {c.companiesCount}
                      </Link>
                    ) : (
                      "0"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusDot
                      color={c.active ? "var(--c41-success)" : "var(--c41-fg-muted)"}
                      label={c.active ? "Ativo" : "Inativo"}
                    />
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {canCreate && (
                      <span className="inline-flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => startTransition(() => { void alternarAtivo(c.id); })}
                          className="text-[13px] font-medium text-fg-muted hover:text-fg transition-colors"
                        >
                          {c.active ? "Inativar" : "Reativar"}
                        </button>
                        <Link href={`/clientes/${c.id}/editar`} className="text-[13px] font-medium text-fg-muted hover:text-fg transition-colors">
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
  );
}
