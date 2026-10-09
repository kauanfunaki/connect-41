import type { ReactNode } from "react";

/**
 * O "…enviada!" de quem termina um formulário público — admissão, candidatura
 * e os dois testes (07/10/2026, auditoria DRG-28). Era a mesma caixa verde
 * escrita à mão em quatro formulários.
 */
export function ConfirmacaoEnviada({ titulo, texto, children }: { titulo: string; texto: string; children?: ReactNode }) {
  return (
    <div role="status" className="bg-success/10 border border-success/25 rounded-lg p-6 text-center">
      <p className="text-body font-semibold text-success-fg">{titulo}</p>
      <p className="text-ui text-fg-muted mt-1">{texto}</p>
      {children}
    </div>
  );
}
