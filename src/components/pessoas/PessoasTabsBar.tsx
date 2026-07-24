"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Tabs } from "@/components/ui/Tabs";

export type PessoasTab = "clientes" | "internos";

// Filtro dentro da própria página (query param), diferente do CadastrosTabsBar
// (que troca de rota entre Empresas/Pessoas) — aqui é o mesmo Server Component
// reagindo a ?tab=.
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
    <Tabs
      tabs={[
        { key: "clientes", label: "Clientes" },
        { key: "internos", label: "Internos" },
      ]}
      active={active}
      onChange={onChange}
      className="mb-4"
    />
  );
}
