import { AlertTriangle, CalendarDays } from "lucide-react";
import { AbasDeLink } from "@/components/financeiro/FiltroDePeriodo";

// Exigências e Agenda são o mesmo módulo (`societario_prazos`): duas leituras
// do que tem data para cumprir. As abas deixam isso visível sem ocupar dois
// itens na sidebar. Desde o polimento de 30/09 usam as abas padrão
// (`AbasDeLink`) — tinham um desenho próprio, parecido mas não igual.
const ABAS = [
  { chave: "exigencias", rotulo: "Exigências", href: "/societario/exigencias", icone: <AlertTriangle /> },
  { chave: "agenda", rotulo: "Agenda de prazos", href: "/societario/agenda", icone: <CalendarDays /> },
] as const;

export function AbasDePrazos({ ativa }: { ativa: (typeof ABAS)[number]["chave"] }) {
  return <AbasDeLink abas={[...ABAS]} ativa={ativa} />;
}
