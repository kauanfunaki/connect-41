"use client";

export function ExportIndicadoresButtons() {
  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <a
        href="/api/indicadores-rh/export?format=pdf"
        className="h-8 px-3 rounded-md border border-border-strong bg-surface-hover text-fg text-[12px] font-medium hover:border-brand transition-colors flex items-center"
      >
        Exportar PDF
      </a>
      <a
        href="/api/indicadores-rh/export?format=xlsx"
        className="h-8 px-3 rounded-md border border-border-strong bg-surface-hover text-fg text-[12px] font-medium hover:border-brand transition-colors flex items-center"
      >
        Exportar Excel
      </a>
    </div>
  );
}
