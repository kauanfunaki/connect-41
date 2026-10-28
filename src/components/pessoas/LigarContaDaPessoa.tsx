"use client";

import { useId, useState, useTransition } from "react";
import { Link2Off } from "lucide-react";
import type { LigacaoState } from "@/app/(app)/pessoas/[id]/acesso-actions";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Select } from "@/components/ui/Select";

type Ligar = (personId: string, userId: string | null) => Promise<LigacaoState>;

/**
 * Liga a pessoa a uma conta que já existe, na aba Acesso (lote 8,
 * 28/10/2026): para quem já tinha login antes de ganhar a ficha.
 */
export function LigarContaExistente({ personId, contas, ligar }: { personId: string; contas: { id: string; nome: string; email: string }[]; ligar: Ligar }) {
  const id = useId();
  const [conta, setConta] = useState("");
  const [estado, setEstado] = useState<LigacaoState>(null);
  const [pendente, startTransition] = useTransition();

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!conta) return;
        startTransition(async () => setEstado(await ligar(personId, conta)));
      }}
    >
      {estado && "erro" in estado && <Aviso>{estado.erro}</Aviso>}
      <CampoForm label="Conta" htmlFor={`${id}-conta`}>
        <Select id={`${id}-conta`} value={conta} onChange={(e) => setConta(e.target.value)} disabled={pendente}>
          <option value="">Escolha a conta</option>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome} ({c.email})
            </option>
          ))}
        </Select>
      </CampoForm>
      <Button type="submit" variant="secondary" size="sm" disabled={!conta || pendente}>
        {pendente ? "Ligando…" : "Ligar esta conta"}
      </Button>
    </form>
  );
}

/** Solta a conta da pessoa: a conta continua existindo, em Usuários. */
export function DesligarConta({ personId, ligar }: { personId: string; ligar: Ligar }) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setAberto(true)}>
        <Link2Off size={14} />
        Desligar a conta da pessoa
      </Button>
      <ConfirmDialog
        open={aberto}
        title="Desligar a conta desta pessoa?"
        description="A conta continua existindo em Configurações › Usuários, com o mesmo login. Só deixa de ser a desta ficha."
        confirmLabel="Desligar"
        pendingLabel="Desligando…"
        pending={pendente}
        error={erro}
        onCancel={() => { setAberto(false); setErro(null); }}
        onConfirm={() =>
          startTransition(async () => {
            const r = await ligar(personId, null);
            if (r && "erro" in r) setErro(r.erro);
            else setAberto(false);
          })
        }
      />
    </>
  );
}
