import { AlertTriangle, PauseCircle } from "lucide-react";
import { AbasDeLink } from "@/components/ui/AbasDeLink";

// Exigências e Protocolos parados (Exigências A, página de opções de
// 04/11/2026): o que o órgão devolveu e o que o órgão ainda não respondeu.
// A aba "Agenda de prazos" saiu — repetia a Agenda geral, que já mostra os
// prazos do Societário (exigência, taxa, licença, prazo combinado); o botão
// "Ver prazos na Agenda" do cabeçalho abre a Agenda filtrada no setor.
const ABAS = [
  { chave: "exigencias", rotulo: "Exigências", href: "/exigencias", icone: <AlertTriangle /> },
  { chave: "parados", rotulo: "Protocolos parados", href: "/exigencias?aba=parados", icone: <PauseCircle /> },
] as const;

export type AbaDePrazos = (typeof ABAS)[number]["chave"];

export function AbasDePrazos({
  ativa,
  contagens,
}: {
  ativa: AbaDePrazos;
  /** Exigências abertas e protocolos parados — o contador no canto do ícone. */
  contagens?: Partial<Record<AbaDePrazos, number>>;
}) {
  return <AbasDeLink abas={ABAS.map((a) => ({ ...a, contagem: contagens?.[a.chave] || undefined }))} ativa={ativa} />;
}
