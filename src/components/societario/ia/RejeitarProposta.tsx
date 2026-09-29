"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import type { AcaoDaIa } from "@/app/(app)/societario/ia/actions";

/**
 * Rejeitar pede um motivo, opcional: é o que o painel de qualidade não
 * consegue medir sozinho — por que a IA errou.
 */
export function RejeitarProposta({ propostaId, rejeitar }: { propostaId: string; rejeitar: (id: string, motivo: string) => Promise<AcaoDaIa> }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  if (!aberto) {
    return (
      <Button variant="secondary" onClick={() => setAberto(true)}>
        Rejeitar
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2 w-full sm:w-96">
      <Textarea
        aria-label="Por que rejeitar"
        rows={2}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Por que a proposta não serve? (opcional)"
      />
      {erro && <p className="text-[12px] text-danger">{erro}</p>}
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={() => setAberto(false)} disabled={pendente}>
          Cancelar
        </Button>
        <Button
          variant="danger"
          disabled={pendente}
          onClick={() =>
            startTransition(async () => {
              const r = await rejeitar(propostaId, motivo);
              if ("error" in r) setErro(r.error);
              else router.push("/societario/ia");
            })
          }
        >
          {pendente ? "Rejeitando…" : "Confirmar rejeição"}
        </Button>
      </div>
    </div>
  );
}
