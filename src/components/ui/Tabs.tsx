"use client";

import type { ReactNode } from "react";
import { Contador } from "@/components/ui/Contador";
import { classeDaAba, classeDaFileira, ConteudoDaAba, MarcaDaAbaAtiva } from "@/components/ui/desenhoDaAba";

export type TabItem = {
  key: string;
  label: string;
  /** Obrigatório desde 29/10/2026: toda aba tem o seu, em cima do rótulo. */
  icon: ReactNode;
  /** Vira um contador no canto do ícone — em vez de "Pessoas (12)" no texto. */
  count?: number;
  panelId?: string; // id do painel controlado, para aria-controls
};

type Props = {
  tabs: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
};

// Navegação por abas — indicador de barra inferior (mesma linguagem visual da
// barra lateral de página ativa na sidebar), sem underline fraco nem cor em excesso.
// O desenho é o de `desenhoDaAba`, o mesmo das `AbasDeLink`.
export function Tabs({ tabs, active, onChange, className = "" }: Props) {
  return (
    <div role="tablist" className={`${classeDaFileira} ${className}`.trim()}>
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={t.panelId}
            onClick={() => onChange(t.key)}
            className={classeDaAba(isActive)}
          >
            <ConteudoDaAba
              icone={t.icon}
              rotulo={t.label}
              contador={t.count !== undefined && <Contador valor={t.count} tom={isActive ? "marca" : "neutro"} pequeno teto={999} />}
            />
            {isActive && <MarcaDaAbaAtiva />}
          </button>
        );
      })}
    </div>
  );
}
