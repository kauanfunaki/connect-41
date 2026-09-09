"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { AcoesDeLinha } from "@/components/shared/AcoesDeLinha";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { StatusDot } from "@/components/shared/StatusDot";
import { EmptyState } from "@/components/ui/EmptyState";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { maskCpf } from "@/lib/format";
import { Button } from "@/components/ui/Button";

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

  /**
   * A mesma pessoa, em cartão, para telas estreitas — mesma decisão de
   * /empresas: a tabela é `min-w-[860px]` dentro de um `overflow-x-auto`, e no
   * celular e-mail, empresa e as ações nascem fora da tela.
   *
   * Ordem diferente da tabela de propósito: o e-mail sobe para logo abaixo do
   * nome, porque é o segundo identificador de uma pessoa (o CPF chega
   * mascarado, `123.***.***-45`, e não identifica ninguém sozinho).
   */
  function cartaoPessoa(p: Row) {
    const cpf = maskCpf(p.cpf);

    return (
      <div
        key={p.id}
        className={`px-3 py-3 border-b border-border last:border-0 ${
          selected.has(p.id) ? "bg-selected-bg" : ""
        }`}
      >
        <div className="flex items-start gap-2.5">
          {canCreate && (
            <Checkbox
              checked={selected.has(p.id)}
              onChange={() => toggleOne(p.id)}
              aria-label={`Selecionar ${p.name}`}
              className="mt-1.5"
            />
          )}
          <Link href={`/pessoas/${p.id}`} className="flex items-start gap-2.5 min-w-0 flex-1 text-fg">
            <AvatarImage src={p.photoUrl} name={p.name} size={32} shape="circle" fontSize={12} />
            <span className="flex flex-col min-w-0">
              <span className="font-medium break-words">{p.name}</span>
              {p.email && (
                <span className="text-[11.5px] text-fg-muted break-all">{p.email}</span>
              )}
            </span>
          </Link>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-secondary">
          <StatusDot
            color={p.active ? "var(--c41-success)" : "var(--c41-fg-muted)"}
            label={p.active ? "Ativo" : "Inativo"}
          />
          {cpf !== "—" && <span className="tnum">{cpf}</span>}
          <span className="tnum text-fg-muted">Criada em {p.createdAtLabel}</span>
        </div>

        {/* Sem o rótulo, o nome da empresa (ou da conta) apareceria solto e
            ambíguo: na tabela quem o explica é o cabeçalho da coluna, e aqui
            não há cabeçalho. */}
        <div className="mt-1 text-[12px] text-fg-secondary">
          <span className="text-fg-muted">{showLinkedUser ? "Conta de acesso" : "Empresa"}: </span>
          {showLinkedUser ? (
            p.linkedUserName ?? <span className="text-fg-muted">não vinculada</span>
          ) : p.companyId ? (
            <Link href={`/empresas/${p.companyId}`} className="text-brand hover:underline">
              {p.companyName}
            </Link>
          ) : (
            "—"
          )}
        </div>

        {canCreate && (
          <div className="mt-2.5 flex justify-end">
            <AcoesDeLinha
              foraDeOperacao={!p.active}
              onToggle={() => toggleAtivo(p)}
              editarHref={`/pessoas/${p.id}/editar`}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        {people.length === 0 ? (
          <EmptyState icon={<Users />} title="Nenhuma pessoa encontrada" />
        ) : (
          <>
          {/* Abaixo de md, cartões; de md para cima, a tabela. As duas
              compartilham a seleção — quem esconde uma delas é o CSS. */}
          <div className="md:hidden">
            {canCreate && (
              <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border bg-table-header-bg">
                <Checkbox checked={allSelected} onChange={toggleAll} aria-label="Selecionar todas" />
                <span className="text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">
                  Selecionar todas
                </span>
              </div>
            )}
            {people.map((p) => cartaoPessoa(p))}
          </div>

          <div className="scroll-x overflow-x-auto hidden md:block">
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
                      <AcoesDeLinha
                        foraDeOperacao={!p.active}
                        onToggle={() => toggleAtivo(p)}
                        editarHref={`/pessoas/${p.id}/editar`}
                      />
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
          onClick={() => setConfirmAlvo({ tipo: "massa" })}
        >
          Inativar
        </Button>
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
