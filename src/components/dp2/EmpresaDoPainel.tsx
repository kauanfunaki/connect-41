"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { useNavegarSemRecarregar } from "@/components/shared/NavegacaoSemRecarregar";

/**
 * A empresa do Painel do DP 2 (17/11/2026, melhoria-741): o painel abre com
 * todas as empresas e este filtro escolhe uma, mantendo o mês. Não mexe na
 * empresa em foco das outras telas — ela só aparece marcada na lista.
 */
export function EmpresaDoPainel({ empresa, empresas, emFoco }: { empresa: string; empresas: { id: string; nome: string }[]; emFoco: string | null }) {
  const { ir } = useNavegarSemRecarregar();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <Select
      aria-label="Empresa"
      value={empresa}
      className="w-72"
      onChange={(e) => {
        const q = new URLSearchParams(params);
        if (e.target.value) q.set("empresa", e.target.value);
        else q.delete("empresa");
        const busca = q.toString();
        ir(busca ? `${pathname}?${busca}` : pathname);
      }}
    >
      <option value="">Todas as empresas</option>
      {empresas.map((c) => (
        <option key={c.id} value={c.id}>
          {c.id === emFoco ? `${c.nome} · em foco` : c.nome}
        </option>
      ))}
    </Select>
  );
}
