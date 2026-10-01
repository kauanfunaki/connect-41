"use client";

import { useActionState, useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ItemDoMenu } from "@/components/ui/Popover";
import { AcoesDoCadastro } from "@/components/empresas/AcoesDoCadastro";
import type { SocioState } from "@/app/(app)/empresas/[id]/socios/actions";

type AcaoDaSaida = (prev: SocioState, form: FormData) => Promise<SocioState>;

/**
 * Registrar a saída do sócio sem abrir o formulário inteiro: só a data. O
 * sócio passa para "Ex-sócios" e deixa de contar na viabilidade.
 */
function FormDaSaida({
  socioId,
  companyId,
  nome,
  action,
  onVoltar,
}: {
  socioId: string;
  companyId: string;
  nome: string;
  action: AcaoDaSaida;
  onVoltar: () => void;
}) {
  const [state, formAction, pendente] = useActionState(action, null);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={socioId} />
      <input type="hidden" name="companyId" value={companyId} />
      <div className="flex items-center gap-1.5">
        <label htmlFor={`saida-${socioId}`} className="sr-only">
          Data de saída de {nome}
        </label>
        <Input id={`saida-${socioId}`} name="exitDate" type="date" compact required className="w-40" />
        {/* `sm` (h-8) para casar com o Input compacto do lado; eram `xs`
            (h-7), um degrau abaixo do campo. */}
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pendente} onClick={onVoltar}>
          Voltar
        </Button>
      </div>
      {state?.error && <span className="text-[length:var(--fs-helper)] font-medium text-danger">{state.error}</span>}
    </form>
  );
}

/**
 * As ações da linha do sócio atual: "Editar" em botão, e "Registrar saída" e
 * "Excluir" no "⋯" (polimento de 30/09 — eram três textos soltos lado a lado).
 * Escolher "Registrar saída" troca as ações pelo campo da data, como antes.
 */
export function AcoesDoSocio({
  socioId,
  companyId,
  nome,
  editarHref,
  excluir,
  registrarSaida,
}: {
  socioId: string;
  companyId: string;
  nome: string;
  editarHref: string;
  excluir: () => Promise<void>;
  registrarSaida: AcaoDaSaida;
}) {
  const [registrando, setRegistrando] = useState(false);

  if (registrando) {
    return <FormDaSaida socioId={socioId} companyId={companyId} nome={nome} action={registrarSaida} onVoltar={() => setRegistrando(false)} />;
  }

  return (
    <AcoesDoCadastro
      editarHref={editarHref}
      nome={nome}
      excluir={excluir}
      itensExtras={(close) => (
        <ItemDoMenu
          icone={<LogOut />}
          onClick={() => {
            close();
            setRegistrando(true);
          }}
        >
          Registrar saída
        </ItemDoMenu>
      )}
    />
  );
}
