"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusDot } from "@/components/shared/StatusDot";
import { AcoesDeLinha } from "@/components/shared/AcoesDeLinha";

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

  function acoesCliente(c: Row) {
    return (
      <AcoesDeLinha
        foraDeOperacao={!c.active}
        onToggle={() => startTransition(() => { void alternarAtivo(c.id); })}
        editarHref={`/clientes/${c.id}/editar`}
      />
    );
  }

  /**
   * O mesmo cliente, em cartão, para telas estreitas.
   *
   * O nome NÃO vira link: na tabela ele também não é, e transformá-lo aqui
   * seria mudar o que a tela faz a pretexto de deixá-la caber no celular.
   */
  function cartaoCliente(c: Row) {
    return (
      <div key={c.id} className="px-3 py-3 border-b border-border last:border-0">
        <p className="font-medium text-fg break-words">{c.name}</p>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-secondary">
          <StatusDot
            color={c.active ? "var(--c41-success)" : "var(--c41-fg-muted)"}
            label={c.active ? "Ativo" : "Inativo"}
          />
          {c.cnpjRootLabel && (
            <span className="tnum">
              <span className="text-fg-muted">Raiz </span>
              {c.cnpjRootLabel}
            </span>
          )}
          {/* Sem coluna para explicar o número, ele vem com a palavra junto. */}
          {c.companiesCount > 0 ? (
            <Link href={`/empresas?cliente=${c.id}`} className="text-brand hover:underline tnum">
              {c.companiesCount} empresa{c.companiesCount !== 1 ? "s" : ""}
            </Link>
          ) : (
            <span className="text-fg-muted">nenhuma empresa</span>
          )}
        </div>

        {canCreate && <div className="mt-2.5 flex justify-end">{acoesCliente(c)}</div>}
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      {clientes.length === 0 ? (
        <EmptyState icon={<Building2 />} title="Nenhum cliente encontrado" />
      ) : (
        <>
          {/* Abaixo de md, cartões; de md para cima, a tabela. */}
          <div className="md:hidden">{clientes.map((c) => cartaoCliente(c))}</div>

          <div className="scroll-x overflow-x-auto hidden md:block">
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
                    {canCreate && acoesCliente(c)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
    </div>
  );
}
