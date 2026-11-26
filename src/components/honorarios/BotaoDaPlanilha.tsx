import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/Button";

/** O endereço da planilha do relatório com os filtros da tela (os vazios saem). */
export function hrefDaPlanilha(relatorio: "contratos" | "aditivos", filtros: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams({ relatorio });
  for (const [k, v] of Object.entries(filtros)) if (v !== undefined && v !== "") q.set(k, String(v));
  return `/honorarios/planilha?${q.toString()}`;
}

/**
 * Baixa a planilha do que a lista mostra — com os mesmos filtros. Mora na
 * barra da lista, ao lado do Filtros, desde 26/11/2026 (melhoria-813); antes
 * ficava no topo da tela, longe do recorte que ela baixa.
 */
export function BotaoDaPlanilha({ href }: { href: string }) {
  return (
    <Button href={href} variant="secondary" size="sm" download title="Baixa a planilha do que a lista mostra, com os mesmos filtros">
      <FileSpreadsheet size={14} aria-hidden /> Planilha
    </Button>
  );
}
