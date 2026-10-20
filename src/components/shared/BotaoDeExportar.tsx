"use client";

import { ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";
import { Dropdown } from "@/components/ui/Dropdown";
import { Button } from "@/components/ui/Button";

// O desenho de duas linhas do `ItemDoMenu` (ui/Popover). Aqui é <a download>,
// e não o <Link> de lá: a rota devolve um arquivo, e o roteador do Next
// tentaria navegar até ela em vez de baixar.
const ITEM =
  "w-full flex items-start gap-3 text-left px-2.5 py-2 rounded-md transition-colors text-fg-secondary hover:bg-surface-hover hover:text-fg";
const SELO = "mt-0.5 inline-flex size-8 flex-shrink-0 items-center justify-center rounded-md bg-brand-subtle text-brand [&>svg]:w-4 [&>svg]:h-4";

/**
 * "Exportar ▾" (20/10/2026): o Excel, numa Tabela do Excel pronta para a
 * tabela dinâmica, e o CSV de antes. `href` é o endereço da exportação, com
 * os filtros da tela e sem o formato.
 */
export function BotaoDeExportar({ href, dica }: { href: string; dica?: string }) {
  const comFormato = (formato: "xlsx" | "csv") => `${href}${href.includes("?") ? "&" : "?"}formato=${formato}`;
  const opcoes = [
    { formato: "xlsx" as const, icone: <FileSpreadsheet />, titulo: "Excel", descricao: "Numa Tabela do Excel, pronta para a tabela dinâmica." },
    { formato: "csv" as const, icone: <FileText />, titulo: "CSV", descricao: "Texto separado por ponto e vírgula, para outros sistemas." },
  ];
  return (
    <Dropdown
      align="right"
      width={300}
      trigger={({ open, toggle }) => (
        <Button type="button" variant="secondary" size="sm" onClick={toggle} aria-expanded={open} title={dica}>
          <Download size={14} /> Exportar <ChevronDown size={13} />
        </Button>
      )}
    >
      {({ close }) => (
        <div className="flex flex-col gap-0.5 p-1">
          {opcoes.map((o) => (
            <a key={o.formato} href={comFormato(o.formato)} download onClick={close} className={ITEM}>
              <span className={SELO}>{o.icone}</span>
              <span className="flex flex-col min-w-0">
                <span className="text-ui font-semibold text-fg">{o.titulo}</span>
                <span className="text-fs-2 leading-snug text-fg-secondary">{o.descricao}</span>
              </span>
            </a>
          ))}
          {dica && <p className="px-2.5 pt-1 pb-1.5 text-micro text-fg-muted">{dica}</p>}
        </div>
      )}
    </Dropdown>
  );
}
