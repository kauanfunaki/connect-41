"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { pontuarUmaCandidatura } from "@/app/(app)/vagas/[id]/triagem-actions";

export function PontuarCandidatura({ vagaId, candidaturaId, rotulo }: { vagaId: string; candidaturaId: string; rotulo: string }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        size="sm"
        loading={pendente}
        disabled={pendente}
        onClick={() => {
          setErro(null);
          startTransition(async () => {
            const r = await pontuarUmaCandidatura(vagaId, candidaturaId);
            if ("error" in r) setErro(r.error);
            else router.refresh();
          });
        }}
      >
        <Sparkles size={13} /> {rotulo}
      </Button>
      {erro && <span className="text-[11px] text-danger max-w-[280px] text-right">{erro}</span>}
    </div>
  );
}
