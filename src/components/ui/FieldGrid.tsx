type Props = {
  children: React.ReactNode;
  columns?: string;
  className?: string;
};

// Grid de campos — 1 coluna em telas pequenas (senão os inputs ficam
// espremidos a ~130px de largura no mobile), padrão 2 colunas a partir de
// sm:. Passe `columns` já prefixado com o breakpoint desejado, ex.:
// "sm:grid-cols-[1fr_80px]" (CEP+UF) ou "sm:grid-cols-3".
export function FieldGrid({ children, columns = "sm:grid-cols-2", className = "" }: Props) {
  return <div className={`grid grid-cols-1 ${columns} gap-4 ${className}`.trim()}>{children}</div>;
}
