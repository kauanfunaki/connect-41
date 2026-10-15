"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { AcoesDeLinha } from "@/components/shared/AcoesDeLinha";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { EmptyState } from "@/components/ui/EmptyState";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Selo } from "@/components/ui/Selo";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { maskCpf } from "@/lib/format";
import { SITUACAO_DO_VINCULO } from "@/lib/colaboradores/situacao";
import type { PersonEmploymentStatus } from "@/generated/prisma/enums";

export type LinhaDaTabelaDeColaboradores = {
  id: string;
  name: string;
  /** O cadastro — inativo é arquivado, e só aparece com o filtro. */
  active: boolean;
  cpf: string | null;
  photoUrl: string | null;
  cargo: string | null;
  situacao: PersonEmploymentStatus;
  /** "03/03/2021", já formatado no servidor (data de calendário). */
  admissao: string | null;
  empresa: { id: string; nome: string } | null;
};

type Props = {
  linhas: LinhaDaTabelaDeColaboradores[];
  canCreate: boolean;
  /** A coluna Empresa — na busca em todas as empresas; na lista de uma empresa, ela é o seletor. */
  mostrarEmpresa?: boolean;
  definirAtivoPessoasEmMassa: (ids: string[], ativo: boolean) => Promise<void>;
};

const MOLDURA = "bg-surface border border-border rounded-lg overflow-hidden shadow-[var(--c41-shadow-xs)]";
const TH = "px-4 py-3 text-micro font-semibold uppercase tracking-wide text-fg-muted";

/**
 * A tabela de Colaboradores de clientes (14/10/2026, escolha 1C do Kauan):
 * Nome, Cargo, Situação do vínculo (no `Selo`), Admissão e CPF — o que o DP
 * procura numa empresa. A lista da empresa e a busca em todas usam a mesma
 * tabela; a busca ganha a coluna Empresa.
 *
 * Dentro do `CascoDaTabela`: no computador quem desenha a moldura é o casco;
 * no celular, cartões. Seleção, "Inativar" em massa e o inativar/reativar da
 * linha seguem como eram na tabela de Pessoas (`PessoasTable`), que continua
 * servindo /pessoas com as colunas de cadastro.
 */
export function ColaboradoresTable({ linhas, canCreate, mostrarEmpresa = false, definirAtivoPessoasEmMassa }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmAlvo, setConfirmAlvo] = useState<{ tipo: "massa" } | { tipo: "linha"; linha: LinhaDaTabelaDeColaboradores } | null>(null);
  const [pending, startTransition] = useTransition();

  const allSelected = linhas.length > 0 && selected.size === linhas.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(linhas.map((p) => p.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirmarInativacao() {
    if (!confirmAlvo) return;
    const ids = confirmAlvo.tipo === "massa" ? Array.from(selected) : [confirmAlvo.linha.id];
    const aviso = confirmAlvo.tipo === "massa" ? `${ids.length} pessoa(s) inativada(s).` : `${confirmAlvo.linha.name} inativado(a).`;
    startTransition(async () => {
      await definirAtivoPessoasEmMassa(ids, false);
      setSelected(new Set());
      setConfirmAlvo(null);
      toast.success(aviso);
      // A action revalida /pessoas; esta tela é outra rota.
      router.refresh();
    });
  }

  /** Reativar não pergunta; inativar tira da lista padrão e passa pela confirmação. */
  function toggleAtivo(linha: LinhaDaTabelaDeColaboradores) {
    if (linha.active) {
      setConfirmAlvo({ tipo: "linha", linha });
      return;
    }
    startTransition(async () => {
      await definirAtivoPessoasEmMassa([linha.id], true);
      toast.success(`${linha.name} reativado(a).`);
      router.refresh();
    });
  }

  function situacao(p: LinhaDaTabelaDeColaboradores) {
    const s = SITUACAO_DO_VINCULO[p.situacao];
    return <Selo tom={s.tom}>{s.rotulo}</Selo>;
  }

  function nome(p: LinhaDaTabelaDeColaboradores, tamanho: 28 | 32) {
    return (
      <Link href={`/pessoas/${p.id}`} className="flex items-center gap-2.5 min-w-0 font-medium text-fg hover:text-brand transition-colors">
        <AvatarImage src={p.photoUrl} name={p.name} size={tamanho} shape="circle" fontSize={tamanho === 28 ? 11 : 12} />
        <span className="min-w-0 break-words">{p.name}</span>
        {/* O cadastro inativo só aparece com o filtro — e precisa se distinguir. */}
        {!p.active && <Selo tom="neutro">Inativo</Selo>}
      </Link>
    );
  }

  function empresa(p: LinhaDaTabelaDeColaboradores) {
    return p.empresa ? (
      <Link href={`/empresas/${p.empresa.id}`} className="hover:text-brand transition-colors">
        {p.empresa.nome}
      </Link>
    ) : (
      <span className="text-fg-muted">Sem empresa</span>
    );
  }

  function acoes(p: LinhaDaTabelaDeColaboradores) {
    return canCreate ? (
      <AcoesDeLinha foraDeOperacao={!p.active} onToggle={() => toggleAtivo(p)} editarHref={`/pessoas/${p.id}/editar`} />
    ) : null;
  }

  if (linhas.length === 0) return <EmptyState icon={<Users />} title="Nenhum colaborador encontrado" />;

  return (
    <>
      {/* Abaixo de md, cartões; de md para cima, a tabela. As duas
          compartilham a seleção — quem esconde uma delas é o CSS. */}
      <div className={`md:hidden ${MOLDURA}`}>
        {canCreate && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border bg-table-header-bg">
            <Checkbox checked={allSelected} onChange={toggleAll} aria-label="Selecionar todos" />
            <span className="c41-rotulo">Selecionar todos</span>
          </div>
        )}
        {linhas.map((p) => (
          <div key={p.id} className={`px-3 py-3 border-b border-border last:border-0 ${selected.has(p.id) ? "bg-selected-bg" : ""}`}>
            <div className="flex items-start gap-2.5">
              {canCreate && (
                <Checkbox checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} aria-label={`Selecionar ${p.name}`} className="mt-1.5" />
              )}
              <div className="min-w-0 flex-1">{nome(p, 32)}</div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-fs-2 text-fg-secondary">
              {situacao(p)}
              {p.cargo && <span>{p.cargo}</span>}
              {p.admissao && <span className="tnum text-fg-muted">Admissão {p.admissao}</span>}
              {maskCpf(p.cpf) !== "—" && <span className="tnum text-fg-muted">{maskCpf(p.cpf)}</span>}
            </div>
            {mostrarEmpresa && (
              <div className="mt-1 text-fs-2 text-fg-secondary">
                <span className="text-fg-muted">Empresa: </span>
                {empresa(p)}
              </div>
            )}
            {canCreate && <div className="mt-2.5 flex justify-end">{acoes(p)}</div>}
          </div>
        ))}
      </div>

      <div className="c41-tabela scroll-x overflow-x-auto hidden md:block">
        <table className="w-full min-w-[860px]">
          <thead>
            <tr className="border-b border-border bg-table-header-bg">
              {canCreate && (
                <th className="w-10 px-4 py-3">
                  <Checkbox checked={allSelected} onChange={toggleAll} aria-label="Selecionar todos" />
                </th>
              )}
              <th className={TH}>Nome</th>
              {mostrarEmpresa && <th className={TH}>Empresa</th>}
              <th className={TH}>Cargo</th>
              <th className={TH}>Situação</th>
              <th className={TH}>Admissão</th>
              <th className={TH}>CPF</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {linhas.map((p) => (
              <tr
                key={p.id}
                className={`border-b border-border last:border-0 transition-colors ${selected.has(p.id) ? "bg-selected-bg" : "hover:bg-surface-hover"}`}
              >
                {canCreate && (
                  <td className="px-4 py-3">
                    <Checkbox checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} aria-label={`Selecionar ${p.name}`} />
                  </td>
                )}
                <td className="px-4 py-3">{nome(p, 28)}</td>
                {mostrarEmpresa && <td className="px-4 py-3 text-fg-secondary">{empresa(p)}</td>}
                <td className="px-4 py-3 text-fg-secondary">{p.cargo ?? <span className="text-fg-muted">—</span>}</td>
                <td className="px-4 py-3">{situacao(p)}</td>
                <td className="px-4 py-3 text-fg-secondary tnum">{p.admissao ?? <span className="text-fg-muted">—</span>}</td>
                <td className="px-4 py-3 text-fg-secondary tnum">{maskCpf(p.cpf)}</td>
                <td className="px-4 py-3 text-right">{acoes(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <Button variant="danger" size="sm" onClick={() => setConfirmAlvo({ tipo: "massa" })}>
          Inativar
        </Button>
      </BulkActionBar>

      <ConfirmDialog
        open={confirmAlvo !== null}
        title={confirmAlvo?.tipo === "linha" ? `Inativar ${confirmAlvo.linha.name}?` : `Inativar ${selected.size} pessoa(s)?`}
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
