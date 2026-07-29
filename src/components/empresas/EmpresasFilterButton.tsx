"use client";

import Link from "next/link";
import { FilterButton } from "@/components/ui/FilterButton";

type Tab = { value: string; label: string };

type Props = {
  search?: string;
  page?: string;
  statusFilter?: string;
  tabs: Tab[];
};

// Componente cliente próprio: o painel do FilterButton usa a callback close()
// do Dropdown (function), que NÃO pode ser passada como children de um
// Server Component pro FilterButton — só dado serializável atravessa essa
// fronteira. Por isso o filtro de status inteiro (não só o botão) vira um
// componente cliente, recebendo apenas strings/arrays simples da página.
export function EmpresasFilterButton({ search, page, statusFilter, tabs }: Props) {
  function buildUrl(status: string | undefined) {
    const q = new URLSearchParams();
    if (search) q.set("search", search);
    if (status) q.set("status", status);
    if (page) q.set("page", page);
    q.set("page", "1");
    return `/empresas?${q.toString()}`;
  }

  return (
    <FilterButton activeCount={statusFilter ? 1 : 0} width={200}>
      {({ close }) => (
        <div className="space-y-0.5">
          <Link
            href={buildUrl(undefined)}
            onClick={close}
            className={`block px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
              !statusFilter ? "bg-brand-subtle text-brand" : "text-fg-secondary hover:bg-surface-hover hover:text-fg"
            }`}
          >
            Todos os status
          </Link>
          {tabs.map((tab) => (
            <Link
              key={tab.value}
              href={buildUrl(tab.value)}
              onClick={close}
              className={`block px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                tab.value === statusFilter ? "bg-brand-subtle text-brand" : "text-fg-secondary hover:bg-surface-hover hover:text-fg"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      )}
    </FilterButton>
  );
}
