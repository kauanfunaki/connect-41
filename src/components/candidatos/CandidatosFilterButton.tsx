"use client";

import Link from "next/link";
import { FilterButton, FilterButtonSection } from "@/components/ui/FilterButton";
import { FilterSelect } from "@/components/shared/FilterSelect";

type Tag = { id: string; name: string };
type StatusFilter = { value: string; label: string };

type Props = {
  search?: string;
  page?: string;
  tag?: string;
  statusFilter: string;
  tags: Tag[];
  statusFilters: readonly StatusFilter[];
  activeCount: number;
};

// Componente cliente próprio pelo mesmo motivo do EmpresasFilterButton: o
// painel usa a callback close() do Dropdown, que não pode ser passada como
// children de um Server Component.
export function CandidatosFilterButton({ search, tag, statusFilter, tags, statusFilters, activeCount }: Props) {
  function buildUrl(status: string) {
    const q = new URLSearchParams();
    if (search) q.set("search", search);
    if (tag) q.set("tag", tag);
    if (status) q.set("status", status);
    return `/candidatos?${q.toString()}`;
  }

  return (
    <FilterButton activeCount={activeCount} width={240}>
      {({ close }) => (
        <div className="space-y-3">
          <FilterButtonSection label="Tag">
            <FilterSelect
              paramName="tag"
              value={tag ?? ""}
              emptyLabel="Todas as tags"
              options={tags.map((t) => ({ id: t.id, name: t.name }))}
              className="w-full"
            />
          </FilterButtonSection>

          <FilterButtonSection label="Situação">
            <div className="space-y-0.5" role="group" aria-label="Filtrar por situação">
              {statusFilters.map((s) => (
                <Link
                  key={s.value}
                  href={buildUrl(s.value)}
                  onClick={close}
                  aria-current={statusFilter === s.value ? "true" : undefined}
                  className={`block px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                    statusFilter === s.value ? "bg-brand-subtle text-brand" : "text-fg-secondary hover:bg-surface-hover hover:text-fg"
                  }`}
                >
                  {s.label}
                </Link>
              ))}
            </div>
          </FilterButtonSection>
        </div>
      )}
    </FilterButton>
  );
}
