import type { ReactNode } from "react";

/**
 * O "…enviada!" de quem termina um formulário público — admissão, candidatura
 * e os dois testes (07/10/2026, auditoria DRG-28). Era a mesma caixa verde
 * escrita à mão em quatro formulários.
 */
export function ConfirmacaoEnviada({ titulo, texto, children }: { titulo: string; texto: string; children?: ReactNode }) {
  return (
    <div role="status" className="bg-success/10 border border-success/25 rounded-lg p-6 text-center">
      <p className="text-[length:var(--fs-body)] font-semibold text-success">{titulo}</p>
      <p className="text-[length:var(--fs-ui)] text-fg-muted mt-1">{texto}</p>
      {children}
    </div>
  );
}
