"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { StatusDot } from "@/components/shared/StatusDot";
import { EmptyState } from "@/components/ui/EmptyState";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select } from "@/components/ui/Select";
import { AvatarImage } from "@/components/shared/AvatarImage";
import type { CompanyStatus } from "@/generated/prisma/enums";
import { formatCnpj } from "@/lib/format";
import { agruparPorCliente } from "@/lib/clientGroups";
import { useConfirm } from "@/components/ui/useConfirm";

type Row = {
  id: string;
  name: string;
  externalId: string | null;
  cnpj: string | null;
  status: CompanyStatus;
  email: string | null;
  taxRegime: string | null;
  createdAtLabel: string;
  logoUrl: string | null;
  city: string | null;
  stateCode: string | null;
  clientGroupId: string | null;
  clientGroupName: string | null;
};

type Props = {
  companies: Row[];
  canCreate: boolean;
  isSuperAdmin: boolean;
  statusLabel: Record<CompanyStatus, string>;
  statusColor: Record<CompanyStatus, string>;
  atualizarStatusEmMassa: (ids: string[], status: CompanyStatus) => Promise<void>;
  excluirEmpresasEmMassa: (ids: string[]) => Promise<void>;
};

const STATUS_OPTIONS: { value: CompanyStatus; label: string }[] = [
  { value: "PROSPECT", label: "Prospecto" },
  { value: "ACTIVE", label: "Ativo" },
  { value: "INACTIVE", label: "Inativo" },
  { value: "CHURNED", label: "Cancelado" },
];

export function EmpresasTable({
  companies,
  canCreate,
  isSuperAdmin,
  statusLabel,
  statusColor,
  atualizarStatusEmMassa,
  excluirEmpresasEmMassa,
}: Props) {
  // A consulta já vem ordenada por (cliente, empresa) — aqui é só quebrar em
  // blocos para desenhar o cabeçalho de cada cliente.
  const blocos = agruparPorCliente(companies);
  const colunas = canCreate ? 9 : 8;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<CompanyStatus>("ACTIVE");
  const [, startTransition] = useTransition();
  const { dialog, requestConfirm } = useConfirm();

  const allSelected = companies.length > 0 && selected.size === companies.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(companies.map((c) => c.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyStatus() {
    const ids = Array.from(selected);
    setSelected(new Set());
    startTransition(() => {
      atualizarStatusEmMassa(ids, bulkStatus);
    });
  }

  // Status que contam como "fora de operação" — quem está assim volta com "Reativar".
  const FORA_DE_OPERACAO: CompanyStatus[] = ["INACTIVE", "CHURNED"];

  /**
   * Inativar/reativar direto na linha, sem passar pela seleção e pelo seletor de status.
   * Reaproveita a action em massa com um id só: a regra de permissão e de escopo por
   * tenant já mora lá, e duplicá-la numa action nova seria criar um segundo lugar para
   * errar.
   */
  function toggleAtivo(row: Row) {
    const inativando = !FORA_DE_OPERACAO.includes(row.status);
    const alvo: CompanyStatus = inativando ? "INACTIVE" : "ACTIVE";

    const aplicar = () => {
      startTransition(() => {
        atualizarStatusEmMassa([row.id], alvo);
      });
      return Promise.resolve();
    };

    // Reativar é inofensivo e não pergunta. Inativar tira a empresa da listagem
    // padrão, então confirma — senão some da tela sem a pessoa entender por quê.
    if (!inativando) {
      void aplicar();
      return;
    }
    requestConfirm(
      {
        title: `Inativar ${row.name}?`,
        description: "Ela sai da listagem padrão e passa a aparecer só no filtro de inativos. Dá para reativar depois.",
        confirmLabel: "Inativar",
      },
      aplicar
    );
  }

  function inativarSelecionadas() {
    const quantas = selected.size;
    requestConfirm(
      {
        title: `Inativar ${quantas} empresa${quantas !== 1 ? "s" : ""}?`,
        description: "Elas saem da listagem padrão e passam a aparecer só no filtro de inativos. Dá para reativar depois.",
        confirmLabel: "Inativar",
      },
      () => {
        const ids = Array.from(selected);
        setSelected(new Set());
        startTransition(() => {
          atualizarStatusEmMassa(ids, "INACTIVE");
        });
        return Promise.resolve();
      }
    );
  }

  function applyDelete() {
    requestConfirm(
      { title: `Excluir ${selected.size} empresa(s) selecionada(s)?`, description: "Esta ação não pode ser desfeita.", destructive: true, confirmLabel: "Excluir" },
      () => {
        const ids = Array.from(selected);
        setSelected(new Set());
        startTransition(() => {
          excluirEmpresasEmMassa(ids);
        });
        return Promise.resolve();
      }
    );
  }

  return (
    <>
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        {companies.length === 0 ? (
          <EmptyState icon={<Building2 />} title="Nenhuma empresa encontrada" />
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
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">ID</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">CNPJ</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Status</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Regime</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Localização</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Criada em</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {blocos.map((bloco, i) => (
                <Fragment key={`${bloco.clientGroupId ?? "sem-cliente"}-${i}`}>
                  <tr className="border-b border-border bg-surface-2">
                    <td colSpan={colunas} className="px-4 py-2">
                      <span className="text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">
                        {bloco.label}
                      </span>
                      <span className="ml-2 text-[11.5px] text-fg-muted tnum">
                        {bloco.empresas.length} empresa{bloco.empresas.length !== 1 ? "s" : ""}
                      </span>
                    </td>
                  </tr>
                  {bloco.empresas.map((c) => (
                <tr
                  key={c.id}
                  className={`border-b border-border last:border-0 transition-colors ${
                    selected.has(c.id) ? "bg-selected-bg" : "hover:bg-surface-hover"
                  }`}
                >
                  {canCreate && (
                    <td className="px-4 py-3">
                      <Checkbox checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <Link href={`/empresas/${c.id}`} className="flex items-center gap-2.5 font-medium text-fg hover:text-brand transition-colors">
                      <AvatarImage src={c.logoUrl} name={c.name} size={28} shape="lg" fontSize={11} />
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-fg-secondary tnum">{c.externalId ?? "—"}</td>
                  <td className="px-4 py-3 text-fg-secondary tnum">{formatCnpj(c.cnpj)}</td>
                  <td className="px-4 py-3">
                    <StatusDot color={statusColor[c.status]} label={statusLabel[c.status]} />
                  </td>
                  <td className="px-4 py-3 text-fg-secondary">{c.taxRegime ?? "—"}</td>
                  <td className="px-4 py-3 text-fg-secondary">
                    {c.city && c.stateCode ? `${c.city}/${c.stateCode}` : c.city ?? c.stateCode ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-fg-secondary tnum">{c.createdAtLabel}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {canCreate && (
                      <span className="inline-flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => toggleAtivo(c)}
                          className="text-[13px] font-medium text-fg-muted hover:text-fg transition-colors"
                        >
                          {FORA_DE_OPERACAO.includes(c.status) ? "Reativar" : "Inativar"}
                        </button>
                        <Link href={`/empresas/${c.id}/editar`} className="text-[13px] font-medium text-fg-muted hover:text-fg transition-colors">
                          Editar
                        </Link>
                      </span>
                    )}
                  </td>
                </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
        {/* Atalho para o caso comum. O seletor ao lado continua, para os outros status. */}
        <button
          type="button"
          onClick={inativarSelecionadas}
          className="h-8 px-3 rounded-md border border-border text-[12px] font-medium text-fg-secondary hover:bg-surface-hover hover:text-fg transition-colors"
        >
          Inativar
        </button>
        <div className="w-40">
          <Select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value as CompanyStatus)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>
        <button
          type="button"
          onClick={applyStatus}
          className="h-8 px-3 rounded-md bg-brand text-on-brand text-[12px] font-medium hover:bg-brand-hover transition-colors"
        >
          Alterar status
        </button>
        {isSuperAdmin && (
          <button
            type="button"
            onClick={applyDelete}
            className="h-8 px-3 rounded-md border border-danger/30 text-[12px] font-medium text-danger hover:bg-danger/8 transition-colors"
          >
            Excluir
          </button>
        )}
      </BulkActionBar>
      {dialog}
    </>
  );
}
