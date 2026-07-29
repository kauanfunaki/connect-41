"use client";

import Link from "next/link";
import { FilterButton } from "@/components/ui/FilterButton";
import { CompanyFilterSelect } from "@/components/shared/CompanyFilterSelect";

type Company = { id: string; name: string };

type Props = {
  search?: string;
  companyId?: string;
  companies: Company[];
};

// Componente cliente próprio pelo mesmo motivo do EmpresasFilterButton: o
// painel usa a callback close() do Dropdown, que não pode ser passada como
// children de um Server Component.
export function PessoasFilterButton({ search, companyId, companies }: Props) {
  function buildUrl(nextCompanyId: string | undefined) {
    const q = new URLSearchParams();
    if (search) q.set("search", search);
    if (nextCompanyId) q.set("companyId", nextCompanyId);
    q.set("page", "1");
    return `/pessoas?${q.toString()}`;
  }

  return (
    <FilterButton activeCount={companyId ? 1 : 0} width={260}>
      {({ close }) => (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-fg-muted uppercase tracking-[0.04em] px-1">Empresa</p>
          <CompanyFilterSelect companies={companies} value={companyId ?? ""} className="w-full" />
          {companyId && (
            <Link
              href={buildUrl(undefined)}
              onClick={close}
              className="block text-[12px] text-fg-muted hover:text-fg px-1"
            >
              Limpar filtro
            </Link>
          )}
        </div>
      )}
    </FilterButton>
  );
}
