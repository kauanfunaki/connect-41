import { FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";

// `download`: o destino é a rota que GERA o PDF/planilha — com <Link>, o
// pré-carregamento dispararia a exportação só de a tela abrir.

export function ExportIndicadoresButtons() {
  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <Button href="/api/indicadores-rh/export?format=pdf" download variant="secondary" size="sm">
        <FileText size={14} />
        Exportar PDF
      </Button>
      <Button href="/api/indicadores-rh/export?format=xlsx" download variant="secondary" size="sm">
        <FileSpreadsheet size={14} />
        Exportar Excel
      </Button>
    </div>
  );
}
