"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { TagState } from "@/app/(app)/admin/tags/actions";
import { SeletorDeCor, PALETA_DO_CONNECT, hexCanonico } from "@/components/ui/SeletorDeCor";
import { EtiquetaColorida } from "@/components/ui/EtiquetaColorida";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FormFooter } from "@/components/ui/FormFooter";
import { Aviso } from "@/components/ui/Aviso";

export type TagDefaultValues = {
  id?: string;
  sectorCode?: string;
  name?: string;
  color?: string;
};

type Props = {
  action: (prev: TagState, form: FormData) => Promise<TagState>;
  cancelHref: string;
  sectorOptions: { value: string; label: string }[];
  defaultValues?: TagDefaultValues;
};

export function TagForm({ action, cancelHref, sectorOptions, defaultValues }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const isEdit = Boolean(defaultValues?.id);

  // A prévia acompanha o nome e a cor enquanto se digita (escolha 2B,
  // 20/10/2026). Os campos seguem não controlados; o "limpar" do formulário
  // volta a prévia junto.
  const nomeInicial = defaultValues?.name ?? "";
  const corInicial = hexCanonico(defaultValues?.color ?? "") ?? PALETA_DO_CONNECT[0]!;
  const [nome, setNome] = useState(nomeInicial);
  const [cor, setCor] = useState(corInicial);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const voltar = () => {
      setNome(nomeInicial);
      setCor(corInicial);
    };
    form.addEventListener("reset", voltar);
    return () => form.removeEventListener("reset", voltar);
  }, [nomeInicial, corInicial]);

  return (
    <form ref={formRef} action={formAction} className="space-y-6">
      {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}

      {state?.error && (
        <Aviso>
          {state.error}
        </Aviso>
      )}

      {isEdit && (
        <p className="text-helper text-fg-muted">
          O setor não pode ser alterado após criado — exclua e recrie a tag se precisar mudar.
        </p>
      )}

      {/* Setor e nome lado a lado; na edição, o nome fica sozinho na primeira
          coluna, na mesma largura. */}
      <FieldGrid>
        {!isEdit && (
          <CampoForm label="Setor" htmlFor="sectorCode" required>
            <Select id="sectorCode" name="sectorCode" required>
              <option value="">Selecionar…</option>
              {sectorOptions.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Select>
          </CampoForm>
        )}
        <CampoForm label="Nome da tag" htmlFor="name" required>
          <Input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={defaultValues?.name ?? ""}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Urgente, Aguardando documento…"
          />
        </CampoForm>
      </FieldGrid>

      {/* O rótulo "Cor" era 12px, menor que o dos campos de cima. A cor
          própria, pelo código, ao lado das do Connect (2B, 20/10/2026). */}
      <fieldset>
        <legend className="text-label font-medium text-fg mb-1.5">Cor</legend>
        <SeletorDeCor name="color" valorInicial={defaultValues?.color} onChange={setCor} aria-label="Cor da tag" />
      </fieldset>

      <div>
        <p className="text-label font-medium text-fg mb-1.5">Como fica no cartão</p>
        <div className="rounded-lg border border-border bg-surface-2 p-3">
          <div className="max-w-[260px] rounded-md border border-border bg-surface p-3 shadow-[var(--c41-shadow-xs)]" aria-hidden>
            <p className="text-kanban-title font-semibold text-fg leading-snug truncate">Empresa Exemplo Ltda</p>
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <EtiquetaColorida cor={cor}>{nome.trim() || "Nome da tag"}</EtiquetaColorida>
            </div>
          </div>
        </div>
      </div>

      <FormFooter
        pending={isPending}
        cancelHref={cancelHref}
      />
    </form>
  );
}
