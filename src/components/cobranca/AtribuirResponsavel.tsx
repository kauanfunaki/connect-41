"use client";

import { useState, useTransition } from "react";
import { Select } from "@/components/ui/Select";
import { atribuirResponsavel } from "@/app/(app)/cobranca/actions";

/** Troca o responsável pela cobrança do título ao escolher — uma escolha é uma decisão, sem botão a mais. */
export function AtribuirResponsavel({
  entryId,
  atual,
  usuarios,
}: {
  entryId: string;
  atual: string | null;
  usuarios: { id: string; name: string }[];
}) {
  const [valor, setValor] = useState(atual ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-1">
      <Select
        compact
        aria-label="Responsável pela cobrança"
        value={valor}
        disabled={pendente}
        onChange={(e) => {
          const novo = e.target.value;
          const anterior = valor;
          setValor(novo);
          setErro(null);
          startTransition(async () => {
            const r = await atribuirResponsavel(entryId, novo);
            if ("error" in r) {
              setErro(r.error);
              setValor(anterior);
            }
          });
        }}
        className="w-56 max-w-full"
      >
        <option value="">Sem responsável</option>
        {usuarios.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </Select>
      {erro && <span className="text-[11px] text-danger">{erro}</span>}
    </div>
  );
}
