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
//
// Desde 07/10/2026 é uma `<nav>` com nome ("Trilha") e lista, e o item atual
// leva `aria-current="page"`: o leitor de tela anuncia onde a pessoa está e
// pula a trilha inteira se quiser. O "/" é decoração.
export function Breadcrumb({ items, className = "" }: Props) {
  return (
    <nav aria-label="Trilha" className={`mb-6 ${className}`.trim()}>
      <ol className="flex items-center gap-2 flex-wrap">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2 min-w-0">
            {i > 0 && (
              <span aria-hidden className="text-fg-muted">
                /
              </span>
            )}
            {item.href ? (
              <Link
                href={item.href}
                className={`text-ui text-fg-muted hover:text-fg transition-colors ${item.truncate ? "truncate max-w-[200px]" : ""}`.trim()}
              >
                {item.label}
              </Link>
            ) : (
              <span
                aria-current={i === items.length - 1 ? "page" : undefined}
                className={`text-ui text-fg ${item.truncate ? "truncate max-w-[200px]" : ""}`.trim()}
              >
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
