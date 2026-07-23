"use client";

export type TabItem = {
  key: string;
  label: string;
  icon?: React.ReactNode;
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
export function Tabs({ tabs, active, onChange, className = "" }: Props) {
  return (
    <div
      role="tablist"
      className={`scroll-x flex items-center gap-1 border-b border-border overflow-x-auto ${className}`.trim()}
    >
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
            className={`relative flex items-center gap-1.5 px-3.5 h-10 text-[length:var(--fs-label)] font-medium whitespace-nowrap transition-colors rounded-t-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
              isActive ? "text-brand" : "text-fg-secondary hover:text-fg"
            }`}
          >
            {t.icon && <span className="flex-shrink-0 [&>svg]:w-4 [&>svg]:h-4">{t.icon}</span>}
            {t.label}
            {isActive && <span className="absolute left-2.5 right-2.5 -bottom-px h-[2px] rounded-full bg-brand" />}
          </button>
        );
      })}
    </div>
  );
}
