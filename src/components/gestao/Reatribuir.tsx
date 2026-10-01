"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import type { AcaoDaGestao } from "@/app/(app)/gestao/actions";

/** Troca o responsável ali mesmo, sem abrir o item. */
export function Reatribuir({
  origem,
  id,
  atual,
  pessoas,
  reatribuir,
}: {
  origem: "PROCESSO" | "CARD";
  id: string;
  atual: string | null;
  pessoas: { id: string; name: string }[];
  reatribuir: (origem: "PROCESSO" | "CARD", id: string, userId: string) => Promise<AcaoDaGestao>;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-0.5">
      <Select
        aria-label="Responsável"
        value={atual ?? ""}
        disabled={pendente}
        onChange={(e) => {
          const userId = e.target.value;
          if (!userId) return;
          setErro(null);
          startTransition(async () => {
            const r = await reatribuir(origem, id, userId);
            if ("error" in r) setErro(r.error);
            else router.refresh();
          });
        }}
        // `compact`, e não `h-8` no className: a classe vai para o invólucro da
        // lista, e o `<select>` de dentro continuava com 36px, vazando dele.
        compact
        className="min-w-40"
      >
        <option value="">{atual ? "—" : "Sem responsável"}</option>
        {pessoas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      {erro && <span className="text-[11px] text-danger">{erro}</span>}
    </div>
  );
}
