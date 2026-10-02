import { AlertCircle } from "lucide-react";

/**
 * Erro dos campos de data, mês e hora sem empurrar a tela (02/10/2026): ícone
 * com a mensagem no hover e, para o leitor de tela, no `aria-describedby`. Um
 * parágrafo embaixo do campo aparecia no blur e deslocava o formulário bem na
 * hora do clique seguinte — o clique caía em outro campo.
 */
export function AvisoDoCampo({ id, mensagem }: { id: string; mensagem: string | null }) {
  if (!mensagem) return null;
  return (
    <span title={mensagem} className="mr-1.5 flex items-center text-danger">
      <AlertCircle size={14} aria-hidden />
      <span id={id} className="sr-only">
        {mensagem}
      </span>
    </span>
  );
}
