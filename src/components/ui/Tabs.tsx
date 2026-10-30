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
//
// Teclado no padrão de abas do ARIA (auditoria de UX, 30/10/2026): só a aba
// ativa entra no Tab; ←/→ (e Home/End) andam entre as abas e já trocam o
// painel. Antes cada aba era uma parada do Tab, e o `role="tab"` prometia ao
// leitor de tela as setas que não funcionavam.
export function Tabs({ tabs, active, onChange, className = "" }: Props) {
  function noTeclado(e: React.KeyboardEvent<HTMLDivElement>) {
    const atual = tabs.findIndex((t) => t.key === active);
    let proxima = -1;
    if (e.key === "ArrowRight") proxima = (atual + 1) % tabs.length;
    else if (e.key === "ArrowLeft") proxima = (atual - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") proxima = 0;
    else if (e.key === "End") proxima = tabs.length - 1;
    if (proxima < 0) return;
    e.preventDefault();
    onChange(tabs[proxima].key);
    e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[proxima]?.focus();
  }

  return (
    <div role="tablist" onKeyDown={noTeclado} className={`${classeDaFileira} ${className}`.trim()}>
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={t.panelId}
            tabIndex={isActive ? 0 : -1}
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
