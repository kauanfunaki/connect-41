"use client";

import { Select } from "@/components/ui/Select";
import { useNavegarSemRecarregar } from "@/components/shared/NavegacaoSemRecarregar";

type Props = {
  companies: { id: string; name: string }[];
  value: string;
  paramName?: string;
  className?: string;
};

// Select que navega direto ao trocar de valor — usado pra filtrar listas
// (Vagas, Pessoas) por empresa-cliente sem precisar de um botão "Aplicar".
// Desde 09/11/2026 sem recarregar a página (`NavegacaoSemRecarregar`).
export function CompanyFilterSelect({ companies, value, paramName = "companyId", className = "w-auto" }: Props) {
  const { ir } = useNavegarSemRecarregar();
  return (
    <Select
      // `key` no valor da URL: voltar no navegador mostra a empresa de antes.
      key={value}
      compact
      name={paramName}
      defaultValue={value}
      className={className}
      onChange={(e) => {
        const url = new URL(window.location.href);
        if (e.target.value) url.searchParams.set(paramName, e.target.value);
        else url.searchParams.delete(paramName);
        url.searchParams.delete("page");
        ir(`${url.pathname}${url.search}`);
      }}
    >
      <option value="">Todas as empresas</option>
      {companies.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </Select>
  );
}
