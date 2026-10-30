import { TreePalm, UserMinus, UserPlus } from "lucide-react";
import { AbasDeLink } from "@/components/ui/AbasDeLink";

/**
 * Admissões, desligamentos e férias, lado a lado (lote 9, 28/10/2026). O hub
 * "Colaboradores" — três números com atalho, os mesmos do painel do DP na
 * Home — saiu (decisão do Kauan nas perguntas do lote 7); o item do menu abre
 * as Admissões, e estas abas levam às outras duas.
 */
export function AbasDoCiclo({ ativa }: { ativa: "admissoes" | "desligamentos" | "ferias" }) {
  return (
    <AbasDeLink
      ativa={ativa}
      aria-label="Ciclo do colaborador"
      abas={[
        { chave: "admissoes", rotulo: "Admissões", href: "/admissoes", icone: <UserPlus /> },
        { chave: "desligamentos", rotulo: "Desligamentos", href: "/desligamentos", icone: <UserMinus /> },
        { chave: "ferias", rotulo: "Férias", href: "/ferias", icone: <TreePalm /> },
      ]}
    />
  );
}
