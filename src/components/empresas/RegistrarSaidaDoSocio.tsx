"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { SocioState } from "@/app/(app)/empresas/[id]/socios/actions";

/**
 * Registrar a saída do sócio sem abrir o formulário inteiro: só a data. O
 * sócio passa para "Ex-sócios" e deixa de contar na viabilidade.
 */
export function RegistrarSaidaDoSocio({
  socioId,
  companyId,
  nome,
  action,
}: {
  socioId: string;
  companyId: string;
  nome: string;
  action: (prev: SocioState, form: FormData) => Promise<SocioState>;
}) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction, pendente] = useActionState(action, null);

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="text-[12px] text-fg-muted hover:text-fg transition-colors">
        Registrar saída
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={socioId} />
      <input type="hidden" name="companyId" value={companyId} />
      <div className="flex items-center gap-1.5">
        <label htmlFor={`saida-${socioId}`} className="sr-only">
          Data de saída de {nome}
        </label>
        <Input id={`saida-${socioId}`} name="exitDate" type="date" compact required className="w-40" />
        <Button type="submit" size="xs" disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar"}
        </Button>
        <Button type="button" size="xs" variant="ghost" disabled={pendente} onClick={() => setAberto(false)}>
          Voltar
        </Button>
      </div>
      {state?.error && <span className="text-[11px] text-danger">{state.error}</span>}
    </form>
  );
}
