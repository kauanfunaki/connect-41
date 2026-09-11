"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { PlanoDeContasState } from "@/app/(app)/admin/plano-de-contas/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { GRUPOS, TRANSFERENCIA } from "@/lib/dre/estrutura";
import { grupoDeTexto } from "@/lib/dre/mapeamento";

export type FinanceCategoryDefaultValues = {
  id?: string;
  name?: string;
  kind?: "PAGAR" | "RECEBER";
  dreGroup?: string | null;
};

type Props = {
  action: (prev: PlanoDeContasState, form: FormData) => Promise<PlanoDeContasState>;
  cancelHref: string;
  defaultValues?: FinanceCategoryDefaultValues;
  /** Grupos de DRE já usados no tenant — vira sugestão, não lista fechada. */
};

/**
 * O valor que o seletor começa marcando.
 *
 * `dreGroup` é texto desde antes do DRE existir, então o que está gravado pode
 * ser o código, o rótulo, ou algo que ninguém reconhece. `grupoDeTexto`
 * resolve os dois primeiros; o terceiro devolve vazio e ganha o aviso.
 */
export function FinanceCategoryForm({
  action,
  cancelHref,
  defaultValues,
}: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const isEdit = Boolean(defaultValues?.id);

  const grupoInicial = grupoDeTexto(defaultValues?.dreGroup) ?? "";
  const valorAntigoSolto = Boolean(defaultValues?.dreGroup) && grupoInicial === "";

  return (
    <form action={formAction} className="space-y-6">
      {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}

      {state?.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      {!isEdit ? (
        <CampoForm label="Lado do plano" htmlFor="kind" required>
          <Select id="kind" name="kind" required defaultValue={defaultValues?.kind ?? ""}>
            <option value="">Selecionar…</option>
            <option value="PAGAR">Contas a pagar (despesa)</option>
            <option value="RECEBER">Contas a receber (receita)</option>
          </Select>
        </CampoForm>
      ) : (
        <p className="text-[12px] text-fg-muted">
          O lado do plano não pode ser alterado depois de criado — mudá-lo viraria o sinal de
          todo lançamento já classificado nesta categoria.
        </p>
      )}

      <CampoForm label="Nome da categoria" htmlFor="name" required>
        <Input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={defaultValues?.name ?? ""}
          placeholder="Ex: Fretes, Energia elétrica, Honorários…"
        />
      </CampoForm>

      {/* ─── Seletor, e não texto livre ────────────────────────────────────
          Era campo aberto com autocomplete do que já existia, e o DRE só soma
          o que casa com um dos doze grupos da estrutura. Quem digitasse
          "Despesas Operacionais" via a categoria sumir do relatório sem erro
          nenhum — e ninguém confere o que não reclama. */}
      <CampoForm label="Grupo do DRE" htmlFor="dreGroup">
        <Select id="dreGroup" name="dreGroup" defaultValue={grupoInicial}>
          <option value="">Ainda não classificada</option>
          {GRUPOS.map((g) => (
            <option key={g.code} value={g.code}>
              {g.label}
            </option>
          ))}
          <option value={TRANSFERENCIA}>Transferência entre contas (fora do DRE)</option>
        </Select>
      </CampoForm>
      <p className="text-[12px] text-fg-muted -mt-4">
        É onde a categoria entra no DRE. Deixar em branco não é erro — a categoria aparece na fila
        de classificação, com o valor, na tela do DRE.
      </p>
      {/* Só aparece quando havia texto livre que não casa com nenhum grupo:
          é o que precisa ser reclassificado, e escondê-lo faria a pessoa
          perder o valor antigo sem saber que perdeu. */}
      {valorAntigoSolto && (
        <p className="text-[12px] text-warning -mt-3">
          Esta categoria estava marcada como <strong>{defaultValues?.dreGroup}</strong>, que não é
          um grupo do DRE. Escolha um acima — enquanto não escolher, ela não soma em nenhuma linha.
        </p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <Button
          variant="primary"
          size="md"
          type="submit"
          disabled={isPending}
        >
          {isPending ? "Salvando…" : "Salvar"}
        </Button>
        <Link
          href={cancelHref}
          className="h-9 px-4 rounded-md border border-border text-[13px] text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors inline-flex items-center"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
