"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { Building2, ChevronRight } from "lucide-react";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { StatusDot } from "@/components/shared/StatusDot";
import { EmptyState } from "@/components/ui/EmptyState";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select } from "@/components/ui/Select";
import { AvatarImage } from "@/components/shared/AvatarImage";
import type { CompanyStatus } from "@/generated/prisma/enums";
import { formatCnpj } from "@/lib/format";
import { agruparPorCliente } from "@/lib/clientGroups";
import { montarArvore } from "@/lib/companyHierarchy";
import { nomeExibicao, razaoSocialSecundaria } from "@/lib/companyName";
import { resumirRegime } from "@/lib/taxRegime";
import { useConfirm } from "@/components/ui/useConfirm";

type Row = {
  id: string;
  name: string;
  displayName: string | null;
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
  parentCompanyId: string | null;
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
  // Filiais começam recolhidas: a listagem existe para varrer clientes, e abrir
  // tudo por padrão devolveria a tabela plana que a árvore veio substituir.
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());

  function toggleExpandir(id: string) {
    setExpandidas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const [bulkStatus, setBulkStatus] = useState<CompanyStatus>("ACTIVE");
  const [, startTransition] = useTransition();
  const { dialog, requestConfirm } = useConfirm();

  // Uma linha só, usada pela matriz e pela filial. Extraída porque são as
  // mesmas 8 colunas — o que muda é o recuo, a setinha e a marca de filial.
  function linhaEmpresa(c: Row, qtdFiliais: number, ehFilial: boolean) {
    return (
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
        <td className="px-4 py-3 min-w-[260px]">
          <div className="flex items-center gap-1.5" style={ehFilial ? { paddingLeft: 22 } : undefined}>
            {qtdFiliais > 0 ? (
              <button
                type="button"
                onClick={() => toggleExpandir(c.id)}
                aria-expanded={expandidas.has(c.id)}
                aria-label={`${expandidas.has(c.id) ? "Recolher" : "Expandir"} as filiais de ${c.name}`}
                className="shrink-0 p-0.5 rounded text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors"
              >
                <ChevronRight
                  size={14}
                  className={`transition-transform ${expandidas.has(c.id) ? "rotate-90" : ""}`}
                />
              </button>
            ) : (
              // Espaço reservado mesmo sem filial: sem ele, os nomes das
              // empresas com e sem filial ficam desalinhados na coluna.
              <span className="w-[22px] shrink-0" aria-hidden="true" />
            )}
            <Link
              href={`/empresas/${c.id}`}
              className="flex items-center gap-2.5 min-w-0 font-medium text-fg hover:text-brand transition-colors"
            >
              <AvatarImage src={c.logoUrl} name={nomeExibicao(c)} size={28} shape="lg" fontSize={11} />
              <span className="flex flex-col min-w-0">
                <span className="truncate">{nomeExibicao(c)}</span>
                {/* Razão social só quando acrescenta: com apelido em branco ela
                    JÁ é o nome de cima, e repetir é ruído. */}
                {razaoSocialSecundaria(c) && (
                  <span className="truncate text-[11.5px] font-normal text-fg-muted">
                    {razaoSocialSecundaria(c)}
                  </span>
                )}
              </span>
            </Link>
            {qtdFiliais > 0 && (
              <span className="ml-1 shrink-0 text-[11.5px] text-fg-muted tnum whitespace-nowrap">
                {qtdFiliais} {qtdFiliais === 1 ? "filial" : "filiais"}
              </span>
            )}
            {ehFilial && (
              <span className="ml-1 shrink-0 text-[11.5px] text-fg-muted">filial</span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-fg-secondary tnum whitespace-nowrap">{c.externalId ?? "—"}</td>
        <td className="px-4 py-3 text-fg-secondary tnum whitespace-nowrap">{formatCnpj(c.cnpj)}</td>
        <td className="px-4 py-3 whitespace-nowrap">
          <StatusDot color={statusColor[c.status]} label={statusLabel[c.status]} />
        </td>
        {/* Resumido e sem quebra: o rótulo do Acessórias chega a 73 caracteres
            e esticava a linha em seis, empurrando as ações para fora da tela.
            O texto inteiro fica no title. */}
        <td className="px-4 py-3 text-fg-secondary whitespace-nowrap" title={c.taxRegime ?? undefined}>
          {resumirRegime(c.taxRegime) ?? "—"}
        </td>
        <td className="px-4 py-3 text-fg-secondary whitespace-nowrap">
          {c.city && c.stateCode ? `${c.city}/${c.stateCode}` : c.city ?? c.stateCode ?? "—"}
        </td>
        <td className="px-4 py-3 text-fg-secondary tnum whitespace-nowrap">{c.createdAtLabel}</td>
        {/* Sticky à direita: com 8 colunas a tabela rola na horizontal, e as
            ações eram a primeira coisa a sumir — "Editar" nem chegava a
            aparecer. Presas aqui, ficam alcançáveis em qualquer rolagem. */}
        <td
          className={`px-4 py-3 text-right whitespace-nowrap sticky right-0 border-l border-border ${
            selected.has(c.id) ? "bg-selected-bg" : "bg-surface"
          }`}
        >
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
    );
  }

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
          {/* 940px: a coluna Nome carrega hierarquia (setinha, recuo, apelido +
                razão social) e as demais não quebram mais, porque o regime
                agora entra resumido. */}
          <table className="w-full min-w-[940px] text-[length:var(--fs-body)]">
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
                <th className="px-4 py-3 sticky right-0 bg-table-header-bg border-l border-border" />
              </tr>
            </thead>
            <tbody>
              {blocos.map((bloco, i) => (
                <Fragment key={`${bloco.clientGroupId ?? "sem-cliente"}-${i}`}>
                  <tr className="border-b border-border bg-surface-2">
                    <td colSpan={colunas - 1} className="px-4 py-2">
                      <span className="text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">
                        {bloco.label}
                      </span>
                      <span className="ml-2 text-[11.5px] text-fg-muted tnum">
                        {bloco.empresas.length} empresa{bloco.empresas.length !== 1 ? "s" : ""}
                      </span>
                    </td>
                    {/* Célula vazia no lugar da coluna de ações, que é sticky:
                        sem ela, o retângulo preso à direita passaria por cima da
                        faixa do cliente ao rolar na horizontal. */}
                    <td className="sticky right-0 bg-surface-2 border-l border-border" />
                  </tr>
                  {montarArvore(bloco.empresas).map((no) => (
                    <Fragment key={no.matriz.id}>
                      {linhaEmpresa(no.matriz, no.filiais.length, false)}
                      {expandidas.has(no.matriz.id) &&
                        no.filiais.map((f) => linhaEmpresa(f, 0, true))}
                    </Fragment>
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
