"use client";

import { Select } from "@/components/ui/Select";

type Props = {
  companies: { id: string; name: string }[];
  value: string;
  paramName?: string;
};

// Select que navega direto ao trocar de valor — usado pra filtrar listas
// (Vagas, Pessoas) por empresa-cliente sem precisar de um botão "Aplicar".
export function CompanyFilterSelect({ companies, value, paramName = "companyId" }: Props) {
  return (
    <Select
      name={paramName}
      defaultValue={value}
      className="w-auto"
      onChange={(e) => {
        const url = new URL(window.location.href);
        if (e.target.value) url.searchParams.set(paramName, e.target.value);
        else url.searchParams.delete(paramName);
        url.searchParams.delete("page");
        window.location.href = url.toString();
      }}
    >
      <option value="">Todas as empresas</option>
      {companies.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </Select>
  );
}
