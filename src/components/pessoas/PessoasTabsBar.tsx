"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Briefcase, Building2 } from "lucide-react";

export type PessoasTab = "clientes" | "internos";

const TABS: { key: PessoasTab; label: string; icon: React.ReactNode; hint: string }[] = [
  { key: "clientes", label: "Clientes", icon: <Building2 size={14} />, hint: "Pessoas ligadas a empresas clientes" },
  { key: "internos", label: "Internos", icon: <Briefcase size={14} />, hint: "Colaboradores da própria 41" },
];

// Filtro dentro da própria página (query param), diferente do CadastrosTabsBar
// (que troca de rota entre Empresas/Pessoas) — aqui é o mesmo Server Component
// reagindo a ?tab=.
//
// Deliberadamente NÃO usa o componente Tabs: empilhado logo abaixo do
// CadastrosTabsBar (Empresas/Pessoas), que também é Tabs, as duas barras
// ficavam visualmente idênticas e o usuário não distinguia "troquei de
// cadastro" de "filtrei dentro de Pessoas". Aqui vira um segmented control
// (pílulas dentro de uma trilha), que lê como filtro e não como navegação.
export function PessoasTabsBar({ active }: { active: PessoasTab }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div
      role="tablist"
      aria-label="Tipo de pessoa"
      className="inline-flex items-center gap-0.5 p-[3px] mb-4 rounded-md bg-surface-hover border border-border"
    >
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            title={t.hint}
            onClick={() => !isActive && onChange(t.key)}
            className={`inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-[13px] font-medium transition-colors ${
              isActive
                ? "bg-surface text-fg shadow-sm"
                : "text-fg-muted hover:text-fg-secondary"
            }`}
          >
            <span className="flex-shrink-0">{t.icon}</span>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
