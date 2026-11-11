import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/Button";

/** O endereço da planilha do relatório com os filtros da tela (os vazios saem). */
export function hrefDaPlanilha(relatorio: "contratos" | "aditivos", filtros: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams({ relatorio });
  for (const [k, v] of Object.entries(filtros)) if (v !== undefined && v !== "") q.set(k, String(v));
  return `/honorarios/planilha?${q.toString()}`;
}

/** Baixa a planilha do que a tela mostra — com os mesmos filtros. */
export function BotaoDaPlanilha({ href }: { href: string }) {
  return (
    <Button href={href} variant="secondary" size="sm" download>
      <FileSpreadsheet size={14} aria-hidden /> Baixar planilha
    </Button>
  );
}
