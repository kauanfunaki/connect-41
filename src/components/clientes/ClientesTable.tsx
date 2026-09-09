"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { StatusDot } from "@/components/shared/StatusDot";
import { AcoesDeLinha } from "@/components/shared/AcoesDeLinha";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { useConfirm } from "@/components/ui/useConfirm";

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
  inativarEmMassa: (ids: string[]) => Promise<void>;
};

export function ClientesTable({ clientes, canCreate, alternarAtivo, inativarEmMassa }: Props) {
  const [, startTransition] = useTransition();
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const { dialog, requestConfirm } = useConfirm();

  // Só cliente ativo entra na seleção: a única ação em massa é inativar, e
  // marcar quem já está inativo sugeriria que algo aconteceria com ele.
  const selecionaveis = clientes.filter((c) => c.active);
  const todosMarcados = selecionaveis.length > 0 && selecionados.size === selecionaveis.length;

  function marcarTodos() {
    setSelecionados(todosMarcados ? new Set() : new Set(selecionaveis.map((c) => c.id)));
  }

  function marcarUm(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function inativarSelecionados() {
    const quantos = selecionados.size;
    requestConfirm(
      {
        title: `Inativar ${quantos} cliente${quantos !== 1 ? "s" : ""}?`,
        description:
          "Eles saem da listagem padrão. As empresas vinculadas continuam como estão — inativar o cliente não mexe nelas. Dá para reativar depois.",
        confirmLabel: "Inativar",
      },
      () => {
        const ids = Array.from(selecionados);
        setSelecionados(new Set());
        startTransition(() => {
          inativarEmMassa(ids);
        });
        return Promise.resolve();
      }
    );
  }

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
      <div
        key={c.id}
        className={`px-3 py-3 border-b border-border last:border-0 ${
          selecionados.has(c.id) ? "bg-selected-bg" : ""
        }`}
      >
        <div className="flex items-start gap-2.5">
          {canCreate && c.active && (
            <Checkbox
              checked={selecionados.has(c.id)}
              onChange={() => marcarUm(c.id)}
              aria-label={`Selecionar ${c.name}`}
              className="mt-1"
            />
          )}
          <p className="font-medium text-fg break-words min-w-0 flex-1">{c.name}</p>
        </div>

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
    <>
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
      {clientes.length === 0 ? (
        <EmptyState icon={<Building2 />} title="Nenhum cliente encontrado" />
      ) : (
        <>
          {/* Abaixo de md, cartões; de md para cima, a tabela. */}
          <div className="md:hidden">
            {canCreate && selecionaveis.length > 0 && (
              <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border bg-table-header-bg">
                <Checkbox checked={todosMarcados} onChange={marcarTodos} aria-label="Selecionar todos" />
                <span className="text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">
                  Selecionar todos
                </span>
              </div>
            )}
            {clientes.map((c) => cartaoCliente(c))}
          </div>

          <div className="scroll-x overflow-x-auto hidden md:block">
          <table className="w-full min-w-[640px] text-[length:var(--fs-body)]">
            <thead>
              <tr className="border-b border-border bg-table-header-bg">
                {canCreate && (
                  <th className="w-11 px-4 py-3">
                    <Checkbox checked={todosMarcados} onChange={marcarTodos} aria-label="Selecionar todos" />
                  </th>
                )}
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Nome</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Raiz do CNPJ</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Empresas</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Situação</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr
                  key={c.id}
                  className={`border-b border-border last:border-0 transition-colors ${
                    selecionados.has(c.id) ? "bg-selected-bg" : "hover:bg-surface-hover"
                  }`}
                >
                  {canCreate && (
                    <td className="px-4 py-3">
                      {/* Cliente já inativo não é selecionável: a única ação em
                          massa é inativar. */}
                      {c.active && (
                        <Checkbox
                          checked={selecionados.has(c.id)}
                          onChange={() => marcarUm(c.id)}
                          aria-label={`Selecionar ${c.name}`}
                        />
                      )}
                    </td>
                  )}
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

      {/* Só inativar. Excluir não existe de propósito: a FK de
          `Company.clientGroupId` é `ON DELETE SET NULL`, então apagar um
          cliente desvincularia as empresas dele em silêncio. */}
      <BulkActionBar count={selecionados.size} onClear={() => setSelecionados(new Set())}>
        <Button variant="danger" size="sm" onClick={inativarSelecionados}>
          Inativar
        </Button>
      </BulkActionBar>
      {dialog}
    </>
  );
}
