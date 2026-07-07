type Props = {
  children: React.ReactNode;
  columns?: string;
  className?: string;
};

// Grid de campos — padrão 2 colunas; passe `columns` (classe Tailwind) pra variar,
// ex.: "grid-cols-[1fr_80px]" (CEP+UF) ou "grid-cols-3".
export function FieldGrid({ children, columns = "grid-cols-2", className = "" }: Props) {
  return <div className={`grid ${columns} gap-4 ${className}`.trim()}>{children}</div>;
}
