import type { ReactNode } from "react";

// A moldura das páginas do portal de vagas dos outros escritórios (só o
// respiro). O 41 Carreiras tem a dele desde 15/10/2026, com o topo, o rodapé
// e as cores da 41 Tallent: `components/carreiras/41/Moldura41.tsx`.
export function MolduraDoPortal({ children }: { children: ReactNode }) {
  return <div className="min-h-screen py-10 px-4">{children}</div>;
}
