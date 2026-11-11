import { Command, Hash, Keyboard, Puzzle } from "lucide-react";
import type { Teste } from "@/lib/academia/regras";

/** O ícone de cada teste da Academia (10/11/2026): o mesmo no topo, nos cartões e nas abas. */
export function IconeDoTeste({ teste, size }: { teste: Teste; size?: number }) {
  if (teste === "numeros") return <Hash size={size} aria-hidden />;
  if (teste === "logica") return <Puzzle size={size} aria-hidden />;
  if (teste === "atalhos") return <Command size={size} aria-hidden />;
  return <Keyboard size={size} aria-hidden />;
}
