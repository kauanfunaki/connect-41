"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { UserSearch } from "lucide-react";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { maskCpf } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { useConfirm } from "@/components/ui/useConfirm";

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
  const { dialog, requestConfirm } = useConfirm();

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
    requestConfirm({ title: `Inativar ${selected.size} candidato(s) selecionado(s)?`, confirmLabel: "Inativar" }, () => {
      const ids = Array.from(selected);
      setSelected(new Set());
      startTransition(() => {
        inativarCandidatosEmMassa(ids);
      });
      return Promise.resolve();
    });
  }

  // A pílula de status é a mesma da tabela, e por isso mora num helper: esta
  // tela é a única que usa pílula em vez do `StatusDot` do resto do app, e
  // deixar duas cópias dela aqui só espalharia a divergência.
  function pilulaStatus(c: Row) {
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${
          c.active
            ? "bg-success/10 text-success border-success/25"
            : "bg-surface-2 text-fg-muted border-border"
        }`}
      >
        {c.active ? "Ativo" : "Inativo"}
      </span>
    );
  }

  function tagsDoCandidato(c: Row) {
    if (c.tags.length === 0) return null;
    return (
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
    );
  }

  /**
   * O mesmo candidato, em cartão, para telas estreitas — a tabela tem 9
   * colunas em `min-w-[760px]`, e no celular e-mail, candidaturas e o "Editar"
   * nascem fora da tela.
   *
   * O e-mail sobe para logo abaixo do nome pelo mesmo motivo de /pessoas: o
   * CPF chega mascarado e não identifica ninguém sozinho.
   */
  function cartaoCandidato(c: Row) {
    const cpf = maskCpf(c.cpf);

    return (
      <div
        key={c.id}
        className={`px-3 py-3 border-b border-border last:border-0 ${
          selected.has(c.id) ? "bg-selected-bg" : ""
        }`}
      >
        <div className="flex items-start gap-2.5">
          {canCreate && (
            <Checkbox
              checked={selected.has(c.id)}
              onChange={() => toggleOne(c.id)}
              aria-label={`Selecionar ${c.name}`}
              className="mt-1"
            />
          )}
          <div className="min-w-0 flex-1">
            <Link href={`/candidatos/${c.id}`} className="font-medium text-fg break-words">
              {c.name}
            </Link>
            {c.email && <p className="text-[11.5px] text-fg-muted break-all">{c.email}</p>}
          </div>
          {canCreate && (
            <Button
              variant="linkMuted"
              href={`/candidatos/${c.id}/editar`}
              className="text-[12px] shrink-0"
            >
              Editar
            </Button>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-muted">
          {pilulaStatus(c)}
          {cpf !== "—" && <span className="tnum">{cpf}</span>}
          {/* Sem coluna para explicar o número, ele vem com a palavra junto. */}
          <span className="tnum">
            {c.candidaturasCount} candidatura{c.candidaturasCount !== 1 ? "s" : ""}
          </span>
          <span className="tnum">Cadastrado em {c.createdAtLabel}</span>
        </div>

        {c.tags.length > 0 && <div className="mt-2">{tagsDoCandidato(c)}</div>}
      </div>
    );
  }

  return (
    <>
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        {candidatos.length === 0 ? (
          <EmptyState icon={<UserSearch />} title="Nenhum candidato encontrado." />
        ) : (
          <>
          {/* Abaixo de md, cartões; de md para cima, a tabela. */}
          <div className="md:hidden">
            {canCreate && (
              <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border bg-surface-2">
                <Checkbox checked={allSelected} onChange={toggleAll} aria-label="Selecionar todos" />
                <span className="text-[12px] font-medium text-fg-muted">Selecionar todos</span>
              </div>
            )}
            {candidatos.map((c) => cartaoCandidato(c))}
          </div>

          <div className="scroll-x overflow-x-auto hidden md:block">
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
                  <td className="px-4 py-2.5">{pilulaStatus(c)}</td>
                  <td className="px-4 py-2.5">
                    {tagsDoCandidato(c) ?? <span className="text-fg-muted">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-fg-muted tnum">{maskCpf(c.cpf)}</td>
                  <td className="px-4 py-2.5 text-fg-muted">{c.email ?? "—"}</td>
                  <td className="px-4 py-2.5 text-fg-muted">{c.candidaturasCount}</td>
                  <td className="px-4 py-2.5 text-fg-muted tnum">{c.createdAtLabel}</td>
                  <td className="px-4 py-2.5 text-right">
                    {canCreate && (
                      <Button variant="linkMuted" href={`/candidatos/${c.id}/editar`} className="text-[12px]">
                        Editar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          </>
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
      {dialog}
    </>
  );
}
