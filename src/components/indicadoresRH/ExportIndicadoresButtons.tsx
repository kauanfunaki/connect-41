import { FileSpreadsheet, FileText } from "lucide-react";

// Mesmo desenho do `Button variant="secondary" size="sm"` (30/09), mas em <a>
// cru: o `Button` com `href` vira <Link>, e o Link pré-carrega o destino — aqui
// o destino é a rota que GERA o PDF/planilha, e o pré-carregamento dispararia a
// exportação só de a tela abrir.
const BOTAO =
  "inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md border border-border-strong text-fg text-[length:var(--fs-button-sm)] font-semibold hover:bg-surface-hover transition-colors";

export function ExportIndicadoresButtons() {
  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <a href="/api/indicadores-rh/export?format=pdf" className={BOTAO}>
        <FileText size={14} />
        Exportar PDF
      </a>
      <a href="/api/indicadores-rh/export?format=xlsx" className={BOTAO}>
        <FileSpreadsheet size={14} />
        Exportar Excel
      </a>
    </div>
  );
}
