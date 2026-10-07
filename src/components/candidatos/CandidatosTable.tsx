"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Pencil, UserSearch } from "lucide-react";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { FiltroDaColunaNaUrl } from "@/components/shared/FiltroDeColunas";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { maskCpf } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { useConfirm } from "@/components/ui/useConfirm";
import type { OpcaoDoFunil } from "@/lib/filtrosDaListaDeEmpresas";
import { StatusDot } from "@/components/shared/StatusDot";

const TH = "px-4 py-3 text-[length:var(--fs-micro)] font-semibold uppercase tracking-wide text-fg-muted";

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
  /** Opções do funil da coluna Tags, contadas no servidor sobre a base filtrada. */
  opcoesDeTag?: OpcaoDoFunil[];
};

export function CandidatosTable({ candidatos, canCreate, inativarCandidatosEmMassa, opcoesDeTag }: Props) {
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

  // Ativo/inativo de cadastro é o `StatusDot`, como em Colaboradores de
  // clientes (`PessoasTable`): esta era a única tela com pílula para isso
  // (auditoria DRG-07, 07/10/2026). Mora num helper porque cartão e tabela
  // mostram o mesmo.
  function pilulaStatus(c: Row) {
    return (
      <StatusDot
        color={c.active ? "var(--c41-success)" : "var(--c41-fg-muted)"}
        label={c.active ? "Ativo" : "Inativo"}
      />
    );
  }

  function tagsDoCandidato(c: Row) {
    if (c.tags.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1">
        {c.tags.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[length:var(--fs-micro)] font-medium border"
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
            <Link href={`/candidatos/${c.id}`} className="font-semibold text-fg hover:text-brand transition-colors break-words">
              {c.name}
            </Link>
            {c.email && <p className="text-[length:var(--fs-micro)] text-fg-muted break-all">{c.email}</p>}
          </div>
          {canCreate && (
            <Button variant="secondary" size="xs" href={`/candidatos/${c.id}/editar`} className="shrink-0">
              <Pencil size={11} /> Editar
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

  // Mora no `CascoDaTabela` da tela (DRG-13, 07/10/2026): no computador o
  // casco desenha a moldura da barra e da tabela juntas; no celular a barra é
  // um cartão próprio, e a lista de cartões ganha o seu logo abaixo.
  return (
    <>
      <div>
        {candidatos.length === 0 ? (
          <EmptyState icon={<UserSearch />} title="Nenhum candidato encontrado" />
        ) : (
          <>
          {/* Abaixo de md, cartões; de md para cima, a tabela. */}
          <div className="md:hidden bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] overflow-hidden">
            {canCreate && (
              <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border bg-table-header-bg">
                <Checkbox checked={allSelected} onChange={toggleAll} aria-label="Selecionar todos" />
                <span className="text-[length:var(--fs-micro)] font-semibold uppercase tracking-wide text-fg-muted">Selecionar todos</span>
              </div>
            )}
            {candidatos.map((c) => cartaoCandidato(c))}
          </div>

          {/* Casco padrão (`.c41-tabela`, polimento de 30/09): centralizada,
              cabeçalho com fundo e o fio azul no hover — o mesmo de /pessoas.
              A coluna Tags ganhou o funil: a lista é paginada, então ele
              filtra no servidor (`FiltroDaColunaNaUrl`). */}
          <div className="c41-tabela scroll-x overflow-x-auto hidden md:block">
          <table className="w-full min-w-[860px] text-[length:var(--fs-body)]">
            <thead>
              <tr className="border-b border-border bg-table-header-bg">
                {canCreate && (
                  <th className="w-10 px-4 py-3">
                    <Checkbox checked={allSelected} onChange={toggleAll} aria-label="Selecionar todos" />
                  </th>
                )}
                <th className={TH}>Nome</th>
                <th className={TH}>Status</th>
                <th className={TH}>
                  {opcoesDeTag ? <FiltroDaColunaNaUrl rotulo="Tags" chave="tag" opcoes={opcoesDeTag} /> : "Tags"}
                </th>
                <th className={TH}>CPF</th>
                <th className={TH}>E-mail</th>
                <th className={TH}>Candidaturas</th>
                <th className={TH}>Cadastrado em</th>
                <th className="px-4 py-3">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {candidatos.map((c) => (
                <tr
                  key={c.id}
                  className={`border-b border-border last:border-0 transition-colors ${selected.has(c.id) ? "bg-selected-bg" : ""}`}
                >
                  {canCreate && (
                    <td className="px-4 py-3">
                      <Checkbox checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} aria-label={`Selecionar ${c.name}`} />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <Link href={`/candidatos/${c.id}`} className="font-semibold text-fg hover:text-brand transition-colors">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{pilulaStatus(c)}</td>
                  <td className="px-4 py-3">
                    {tagsDoCandidato(c) ?? <span className="text-fg-muted">—</span>}
                  </td>
                  <td className="px-4 py-3 text-fg-muted tnum whitespace-nowrap">{maskCpf(c.cpf)}</td>
                  <td className="px-4 py-3 text-fg-muted">{c.email ?? "—"}</td>
                  <td className="px-4 py-3 text-fg-muted">{c.candidaturasCount}</td>
                  <td className="px-4 py-3 text-fg-muted tnum whitespace-nowrap">{c.createdAtLabel}</td>
                  <td className="px-4 py-3">
                    {canCreate && (
                      <Button variant="secondary" size="xs" href={`/candidatos/${c.id}/editar`}>
                        <Pencil size={11} /> Editar
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
        <Button
          variant="danger"
          size="sm"
          onClick={applyInativar}
        >
          Inativar
        </Button>
      </BulkActionBar>
      {dialog}
    </>
  );
}
