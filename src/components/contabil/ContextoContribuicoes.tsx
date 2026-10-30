"use client";
import { createContext, useContext } from "react";
const Contexto = createContext<string | undefined>(undefined);
export function ContextoContribuicoes({ empresaId, children }: { empresaId: string; children: React.ReactNode }) {
  return <Contexto.Provider value={empresaId}>{children}</Contexto.Provider>;
}
export function useEmpresaContabil() { return useContext(Contexto); }
