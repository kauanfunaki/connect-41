"use client";

type Props = {
  companies: { id: string; name: string }[];
  value: string;
  paramName?: string;
};

// Select que navega direto ao trocar de valor — usado pra filtrar listas
// (Vagas, Pessoas) por empresa-cliente sem precisar de um botão "Aplicar".
export function CompanyFilterSelect({ companies, value, paramName = "companyId" }: Props) {
  return (
    <select
      name={paramName}
      defaultValue={value}
      onChange={(e) => {
        const url = new URL(window.location.href);
        if (e.target.value) url.searchParams.set(paramName, e.target.value);
        else url.searchParams.delete(paramName);
        url.searchParams.delete("page");
        window.location.href = url.toString();
      }}
      className="h-8 px-3 rounded-md border border-border bg-canvas text-[12px] text-fg outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors"
    >
      <option value="">Todas as empresas</option>
      {companies.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  );
}
