import { AlertTriangle } from "lucide-react";
import { detalhesDaProposta } from "@/lib/ia/chat/regras";

/**
 * As linhas embaixo da frase de um cartão de proposta da Ceci: o que a pessoa
 * confere antes do sim — no chamado, categoria, título e descrição; no
 * processo, empresa, tipo, responsável, prazo, checklist e o pedido ao cliente.
 *
 * Mora aqui desde 09/11/2026, quando o cartão de perguntas de `/processos`
 * passou a mostrar a abertura de processo: era uma função do chat do canto da
 * tela, e os dois cartões precisavam dizer o mesmo.
 */
export function DetalhesDaProposta({
  p,
  apagado = false,
}: {
  p: { ferramenta: string; argumentos?: Record<string, unknown>; alvo?: string };
  /** A proposta recusada fica esmaecida, como a frase riscada acima. */
  apagado?: boolean;
}) {
  const detalhes = detalhesDaProposta(p);
  if (detalhes.length === 0) return null;
  return (
    <dl className={`mt-2 space-y-1.5 border-t border-border pt-2 ${apagado ? "opacity-60" : ""}`}>
      {detalhes.map((d) => (
        <div key={d.rotulo}>
          <dt className={`text-micro ${d.atencao ? "inline-flex items-center gap-1 font-medium text-warning-fg" : "text-fg-muted"}`}>
            {d.atencao && <AlertTriangle size={12} aria-hidden />}
            {d.rotulo}
          </dt>
          {/* Texto longo rola dentro do cartão; com foco pelo teclado, para rolar sem mouse. */}
          <dd
            className={`text-fs-2 text-fg ${d.longo ? "max-h-40 overflow-y-auto whitespace-pre-line rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" : "break-words"}`}
            tabIndex={d.longo ? 0 : undefined}
          >
            {d.texto}
          </dd>
        </div>
      ))}
    </dl>
  );
}
