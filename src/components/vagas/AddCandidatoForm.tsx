"use client";

import { useActionState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { CandidaturaState } from "@/app/(app)/vagas/[id]/actions";
import { AlinhadoAoCampo, CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

type PersonOption = { id: string; name: string };

type Props = {
  action: (prev: CandidaturaState, form: FormData) => Promise<CandidaturaState>;
  candidatos: PersonOption[];
  /** O "Novo candidato" (quem ainda não está no banco), ao lado do nome do bloco. */
  novoCandidatoHref?: string;
};

// Grade em vez de `flex items-end` com larguras fixas (w-56/w-48): no celular
// os dois campos estouravam a coluna, e o botão só caía alinhado enquanto
// nenhum campo tivesse texto de ajuda embaixo.
export function AddCandidatoForm({ action, candidatos, novoCandidatoHref }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="border-t border-border pt-4 space-y-3">
      {/* O bloco do "novo" da ficha da vaga, acima dos campos, com o "Novo
          candidato" junto — o botão ficava no título do funil, longe do
          formulário que ele completa (escolha 5A do Kauan, 08/10/2026). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="c41-rotulo">Nova candidatura</h3>
        {novoCandidatoHref && (
          <Button href={novoCandidatoHref} variant="secondary" size="xs">
            <UserPlus size={11} /> Novo candidato
          </Button>
        )}
      </div>
      <FieldGrid columns="sm:grid-cols-[minmax(0,1fr)_200px_auto] lg:grid-cols-[320px_220px_auto]">
        <CampoForm label="Candidato" htmlFor="personId" required>
          <Select id="personId" name="personId" required>
            <option value="">Selecione</option>
            {candidatos.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </CampoForm>
        <CampoForm label="Origem" htmlFor="origin">
          <Input id="origin" name="origin" type="text" placeholder="ex: LinkedIn" />
        </CampoForm>
        <AlinhadoAoCampo>
          <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
            {isPending ? "Vinculando…" : "Vincular candidato"}
          </Button>
        </AlinhadoAoCampo>
      </FieldGrid>
      {state?.error && <p className="text-ui text-danger">{state.error}</p>}
    </form>
  );
}
