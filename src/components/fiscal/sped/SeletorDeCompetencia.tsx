"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CampoMes } from "@/components/ui/CampoMes";

/**
 * A competência do SPED, ao lado da empresa. Trocar o mês mantém a empresa e
 * tira o resto (a versão do arquivo, os filtros da lista): eram do mês anterior.
 */
export function SeletorDeCompetencia({ competencia }: { competencia: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pendente, iniciar] = useTransition();
  return (
    <div className={`flex items-center gap-2 transition-opacity ${pendente ? "opacity-60" : ""}`} aria-busy={pendente || undefined}>
      <label htmlFor="sped-competencia" className="c41-rotulo flex-shrink-0">Competência</label>
      <CampoMes
        id="sped-competencia"
        compact
        className="w-40"
        aria-label="Competência"
        value={competencia}
        onChange={(v) => {
          if (!v || v === competencia) return;
          const q = new URLSearchParams();
          const empresa = params.get("empresa");
          if (empresa) q.set("empresa", empresa);
          q.set("competencia", v);
          iniciar(() => router.push(`${pathname}?${q}`));
        }}
      />
    </div>
  );
}
