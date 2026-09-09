"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { UserRoundCog } from "lucide-react";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { StatusDot } from "@/components/shared/StatusDot";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select } from "@/components/ui/Select";
import { ToggleActiveButton } from "@/components/admin/ToggleActiveButton";

type SectorTag = { code: string; label: string; color: string };
type Row = {
  id: string;
  name: string;
  email: string;
  roleLabel: string;
  active: boolean;
  sectors: SectorTag[];
};

type Props = {
  users: Row[];
  currentUserId: string;
  sectorOptions: { value: string; label: string }[];
  alternarAtivoUsuario: (id: string, novoStatus: boolean) => Promise<void>;
  alternarAtivoEmMassa: (ids: string[], novoStatus: boolean) => Promise<void>;
  atribuirSetorEmMassa: (ids: string[], sectorCode: string) => Promise<void>;
};

export function UsuariosTable({
  users,
  currentUserId,
  sectorOptions,
  alternarAtivoUsuario,
  alternarAtivoEmMassa,
  atribuirSetorEmMassa,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkSector, setBulkSector] = useState(sectorOptions[0]?.value ?? "");
  const [, startTransition] = useTransition();

  const selectableUsers = users.filter((u) => u.id !== currentUserId);
  const allSelected = selectableUsers.length > 0 && selected.size === selectableUsers.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableUsers.map((u) => u.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Os chips de setor são idênticos na tabela e no cartão, com a mesma regra de
  // "3 e depois +N" — extraídos para não virar mais uma cópia de um markup que
  // já se repetia.
  function chipsDeSetor(u: Row) {
    if (u.sectors.length === 0) return <span className="text-fg-muted">—</span>;
    return (
      <div className="flex flex-wrap items-center gap-1">
        {u.sectors.slice(0, 3).map((s) => (
          <span
            key={s.code}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium bg-surface-hover text-fg-secondary border border-border"
          >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        {u.sectors.length > 3 && (
          <span
            title={u.sectors.slice(3).map((s) => s.label).join(", ")}
            className="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-medium bg-surface-hover text-fg-muted border border-border cursor-default"
          >
            +{u.sectors.length - 3}
          </span>
        )}
      </div>
    );
  }

  /**
   * O mesmo usuário, em cartão, para telas estreitas — a tabela é
   * `min-w-[900px]` dentro de um `overflow-x-auto`.
   *
   * O `StatusDot` só aparece para a própria conta. Nas outras, o
   * `ToggleActiveButton` logo abaixo já escreve "Ativo"/"Inativo" no próprio
   * botão: na tabela as duas coisas moram em colunas distantes, no cartão
   * ficariam lado a lado dizendo a mesma palavra duas vezes.
   */
  function cartaoUsuario(u: Row) {
    const isSelf = u.id === currentUserId;
    const toggleAction = alternarAtivoUsuario.bind(null, u.id, !u.active);

    return (
      <div
        key={u.id}
        className={`px-3 py-3 border-b border-border last:border-0 ${
          selected.has(u.id) ? "bg-selected-bg" : ""
        }`}
      >
        <div className="flex items-start gap-2.5">
          {isSelf ? (
            // Espaço reservado: sem ele, o nome da própria conta ficaria
            // desalinhado dos demais cartões da lista.
            <span className="w-4 shrink-0" aria-hidden="true" />
          ) : (
            <Checkbox
              checked={selected.has(u.id)}
              onChange={() => toggleOne(u.id)}
              aria-label={`Selecionar ${u.name}`}
              className="mt-1"
            />
          )}
          <div className="min-w-0 flex-1">
            <Link
              href={`/admin/usuarios/${u.id}/editar`}
              className="font-medium text-fg break-words"
            >
              {u.name}
            </Link>
            {isSelf && <span className="text-[12px] text-fg-muted ml-1.5">(você)</span>}
            <p className="text-[11.5px] text-fg-muted break-all">{u.email}</p>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-secondary">
          {isSelf && (
            <StatusDot
              color={u.active ? "var(--c41-success)" : "var(--c41-fg-muted)"}
              label={u.active ? "Ativo" : "Inativo"}
            />
          )}
          <span>{u.roleLabel}</span>
        </div>

        <div className="mt-2">{chipsDeSetor(u)}</div>

        <div className="mt-2.5 flex items-center justify-end gap-3">
          <Button variant="linkMuted" href={`/admin/usuarios/${u.id}/editar`} className="text-[13px] font-medium">
            Editar
          </Button>
          {!isSelf && <ToggleActiveButton action={toggleAction} ativo={u.active} nome={u.name} />}
        </div>
      </div>
    );
  }

  function applyToggle(novoStatus: boolean) {
    const ids = Array.from(selected);
    setSelected(new Set());
    startTransition(() => {
      alternarAtivoEmMassa(ids, novoStatus);
    });
  }

  function applySector() {
    if (!bulkSector) return;
    const ids = Array.from(selected);
    setSelected(new Set());
    startTransition(() => {
      atribuirSetorEmMassa(ids, bulkSector);
    });
  }

  return (
    <>
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        {users.length === 0 ? (
          <EmptyState icon={<UserRoundCog />} title="Nenhum usuário cadastrado ainda" />
        ) : (
          <>
          {/* Abaixo de md, cartões; de md para cima, a tabela. */}
          <div className="md:hidden">
            <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border bg-table-header-bg">
              <Checkbox checked={allSelected} onChange={toggleAll} aria-label="Selecionar todos" />
              <span className="text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">
                Selecionar todos
              </span>
            </div>
            {users.map((u) => cartaoUsuario(u))}
          </div>

          <div className="scroll-x overflow-x-auto hidden md:block">
          <table className="w-full min-w-[900px] text-[length:var(--fs-body)]">
            <thead>
              <tr className="border-b border-border bg-table-header-bg">
                <th className="w-10 px-4 py-3">
                  <Checkbox checked={allSelected} onChange={toggleAll} />
                </th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Nome</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">E-mail</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Papel</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Setores</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === currentUserId;
                const toggleAction = alternarAtivoUsuario.bind(null, u.id, !u.active);
                return (
                  <tr
                    key={u.id}
                    className={`border-b border-border last:border-0 transition-colors ${
                      selected.has(u.id) ? "bg-selected-bg" : "hover:bg-surface-hover"
                    }`}
                  >
                    <td className="px-4 py-3">
                      {!isSelf && (
                        <Checkbox checked={selected.has(u.id)} onChange={() => toggleOne(u.id)} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/usuarios/${u.id}/editar`} className="font-medium text-fg hover:text-brand transition-colors">
                        {u.name}
                      </Link>
                      {isSelf && <span className="text-[12px] text-fg-muted ml-1.5">(você)</span>}
                    </td>
                    <td className="px-4 py-3 text-fg-secondary">{u.email}</td>
                    <td className="px-4 py-3 text-fg-secondary">{u.roleLabel}</td>
                    <td className="px-4 py-3">{chipsDeSetor(u)}</td>
                    <td className="px-4 py-3">
                      <StatusDot
                        color={u.active ? "var(--c41-success)" : "var(--c41-fg-muted)"}
                        label={u.active ? "Ativo" : "Inativo"}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="linkMuted" href={`/admin/usuarios/${u.id}/editar`} className="text-[13px] font-medium">
                          Editar
                        </Button>
                        {!isSelf && <ToggleActiveButton action={toggleAction} ativo={u.active} nome={u.name} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          </>
        )}
      </div>

      <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <button
          type="button"
          onClick={() => applyToggle(true)}
          className="h-8 px-3 rounded-md border border-success/30 text-[13px] font-semibold text-success hover:bg-success-bg transition-colors"
        >
          Ativar
        </button>
        <button
          type="button"
          onClick={() => applyToggle(false)}
          className="h-8 px-3 rounded-md border border-danger/30 text-[13px] font-semibold text-danger hover:bg-danger-bg transition-colors"
        >
          Desativar
        </button>
        {sectorOptions.length > 0 && (
          <>
            <div className="w-44">
              <Select
                value={bulkSector}
                onChange={(e) => setBulkSector(e.target.value)}
              >
                {sectorOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </div>
            <button
              type="button"
              onClick={applySector}
              className="h-8 px-3 rounded-md bg-brand text-on-brand text-[12px] font-medium hover:bg-brand-hover transition-colors"
            >
              Atribuir setor
            </button>
          </>
        )}
      </BulkActionBar>
    </>
  );
}
