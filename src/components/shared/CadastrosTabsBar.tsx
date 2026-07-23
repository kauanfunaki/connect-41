"use client";

import { useRouter } from "next/navigation";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import type { CadastrosTab } from "@/lib/cadastrosNav";

const TABS: TabItem[] = [
  { key: "empresas", label: "Empresas", panelId: "cadastros-content" },
  { key: "pessoas", label: "Pessoas", panelId: "cadastros-content" },
];

// Barra de abas do topo de /empresas e /pessoas — troca de aba navega para a
// listagem correspondente (rotas continuam as mesmas de sempre).
export function CadastrosTabsBar({ active }: { active: CadastrosTab }) {
  const router = useRouter();

  return (
    <div className="mb-5">
      <p className="text-[11px] font-semibold text-fg-muted uppercase tracking-wider mb-2">
        Cadastros
      </p>
      <Tabs
        tabs={TABS}
        active={active}
        onChange={(key) => {
          if (key !== active) router.push(`/${key}`);
        }}
      />
    </div>
  );
}
