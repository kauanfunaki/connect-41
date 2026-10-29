import type { ReactNode } from "react";

// O desenho das abas, dividido entre `Tabs` (cliente) e `AbasDeLink` (servidor)
// — por isso mora fora das duas (29/10/2026, opção D da página de
// alternativas): ícone de 20px em cima do rótulo, a contagem no canto do ícone
// e a barra embaixo da ativa. Só texto, as abas pareciam todas iguais e a
// pessoa precisava ler uma por uma para achar a sua.

export const classeDaFileira = "scroll-x-hidden flex items-end gap-1 border-b border-border overflow-x-auto";

export function classeDaAba(ativa: boolean) {
  return `relative flex flex-col items-center justify-center gap-1 min-w-16 px-3.5 h-14 text-fs-2 font-medium whitespace-nowrap transition-colors rounded-t-md ${
    ativa ? "text-brand" : "text-fg-secondary hover:text-fg hover:bg-surface-hover"
  }`;
}

/** O ícone em cima, o contador no canto dele e o rótulo embaixo. */
export function ConteudoDaAba({ icone, rotulo, contador }: { icone: ReactNode; rotulo: string; contador?: ReactNode }) {
  return (
    <>
      <span className="relative flex-shrink-0 flex">
        <span className="flex [&>svg]:w-5 [&>svg]:h-5" aria-hidden="true">
          {icone}
        </span>
        {contador && <span className="absolute -top-1.5 left-3.5">{contador}</span>}
      </span>
      <span>{rotulo}</span>
    </>
  );
}

export function MarcaDaAbaAtiva() {
  return <span className="absolute left-2.5 right-2.5 -bottom-px h-[2px] rounded-full bg-brand" />;
}
