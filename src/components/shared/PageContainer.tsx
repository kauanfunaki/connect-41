type Props = {
  children: React.ReactNode;
  /** "wide" (padrão) = largura geral das telas internas. "narrow" = formulários. */
  variant?: "wide" | "narrow";
  className?: string;
};

// Wrapper de largura padronizado pras telas internas (Home, Kanban, Empresas...).
// "wide": max-w-[1440px] — régua visual geral do app.
// "narrow": max-w-[1000px] — usado dentro de "wide" para conter formulários longos.
export function PageContainer({ children, variant = "wide", className = "" }: Props) {
  const maxWidth = variant === "narrow" ? "max-w-[1000px]" : "max-w-[1440px]";
  return (
    <div className={`p-6 ${maxWidth} mx-auto ${className}`.trim()}>
      {children}
    </div>
  );
}
