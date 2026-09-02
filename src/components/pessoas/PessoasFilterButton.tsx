"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FilterButton } from "@/components/ui/FilterButton";
import { CompanyFilterSelect } from "@/components/shared/CompanyFilterSelect";
import { SITUACAO_TODOS, SITUACAO_INATIVOS } from "@/lib/personActiveFilter";

type Company = { id: string; name: string };

type Props = {
  search?: string;
  companyId?: string;
  /** Opcional: /pessoas só lista interno da 41, que não tem empresa cliente. */
  companies?: Company[];
  /** Valor atual de `?situacao=` — "" quando é o padrão (só ativos). */
  situacao?: string;
  /** O filtro por empresa só faz sentido onde a pessoa tem empresa cliente. */
  mostrarEmpresa?: boolean;
};

const SITUACOES: { value: string; label: string }[] = [
  { value: "", label: "Ativos (padrão)" },
  { value: SITUACAO_INATIVOS, label: "Inativos" },
  { value: SITUACAO_TODOS, label: "Todos" },
];

// Componente cliente próprio pelo mesmo motivo do EmpresasFilterButton: o
// painel usa a callback close() do Dropdown, que não pode ser passada como
// children de um Server Component.
export function PessoasFilterButton({
  search,
  companyId,
  companies = [],
  situacao,
  mostrarEmpresa = true,
}: Props) {
  // Serve /pessoas e /colaboradores-clientes desde 2026-09-02 — com a rota
  // fixa, filtrar em uma delas jogava o usuário na outra.
  const pathname = usePathname();

  function buildUrl(next: { companyId?: string; situacao?: string }) {
    const q = new URLSearchParams();
    if (search) q.set("search", search);
    const empresa = "companyId" in next ? next.companyId : companyId;
    const sit = "situacao" in next ? next.situacao : situacao;
    if (empresa) q.set("companyId", empresa);
    if (sit) q.set("situacao", sit);
    q.set("page", "1");
    return `${pathname}?${q.toString()}`;
  }

  // O padrão (só ativos) não conta como filtro aplicado — senão o badge ficaria
  // sempre aceso e perderia o sentido de "há algo fora do normal aqui".
  const ativos = (companyId ? 1 : 0) + (situacao ? 1 : 0);

  return (
    <FilterButton activeCount={ativos} width={260}>
      {({ close }) => (
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-fg-muted uppercase tracking-[0.04em] px-1">Situação</p>
            <div className="space-y-0.5">
              {SITUACOES.map((s) => (
                <Link
                  key={s.value || "padrao"}
                  href={buildUrl({ situacao: s.value || undefined })}
                  onClick={close}
                  className={`block px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                    (situacao ?? "") === s.value
                      ? "bg-brand-subtle text-brand"
                      : "text-fg-secondary hover:bg-surface-hover hover:text-fg"
                  }`}
                >
                  {s.label}
                </Link>
              ))}
            </div>
          </div>

          {mostrarEmpresa && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-fg-muted uppercase tracking-[0.04em] px-1">Empresa</p>
              <CompanyFilterSelect companies={companies} value={companyId ?? ""} className="w-full" />
              {companyId && (
                <Link
                  href={buildUrl({ companyId: undefined })}
                  onClick={close}
                  className="block text-[12px] text-fg-muted hover:text-fg px-1"
                >
                  Limpar filtro de empresa
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </FilterButton>
  );
}
