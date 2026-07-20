import Link from "next/link";

export type BreadcrumbItem = {
  label: string;
  href?: string; // ausente = item atual (não clicável)
  truncate?: boolean; // trunca labels longos (ex: nome de empresa) sem quebrar o layout
};

type Props = {
  items: BreadcrumbItem[];
  className?: string;
};

// Trilha de navegação padronizada — antes duplicada (JSX idêntico, texto a
// texto) em ~12 páginas do módulo de Empresas. Mesmo visual de sempre
// (separador "/", item atual sem link), agora numa fonte só.
export function Breadcrumb({ items, className = "" }: Props) {
  return (
    <div className={`flex items-center gap-2 mb-6 flex-wrap ${className}`.trim()}>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-fg-muted">/</span>}
          {item.href ? (
            <Link
              href={item.href}
              className={`text-[13px] text-fg-muted hover:text-fg transition-colors ${item.truncate ? "truncate max-w-[200px]" : ""}`.trim()}
            >
              {item.label}
            </Link>
          ) : (
            <span className={`text-[13px] text-fg ${item.truncate ? "truncate max-w-[200px]" : ""}`.trim()}>
              {item.label}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
