import { Flag } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { FatoDaFicha } from "@/lib/recrutamento/fichaDaVaga";

// Colunas no computador largo: todos os fatos numa linha. A classe precisa ser
// literal para o Tailwind gerá-la — de 3 a 6 fatos (vagas, prioridade e data
// sempre existem; cargo, contrato e salário, quando cadastrados).
const COLUNAS_NO_LARGO: Record<number, string> = {
  3: "xl:grid-cols-3",
  4: "xl:grid-cols-4",
  5: "xl:grid-cols-5",
  6: "xl:grid-cols-6",
};

/**
 * A faixa de fatos da vaga — escolha "Vaga · 1 B" do Kauan (14/10/2026), no
 * lugar do cartão "Detalhes" com rótulo cinza e valor em texto comum, em que
 * nada dizia o que era mais importante. Rótulo pequeno em caixa alta, valor
 * grande, e a linha de apoio embaixo; a prioridade alta em âmbar, com a
 * bandeira.
 *
 * Três por linha no tablet e dois no celular. As divisórias são uma sombra de
 * 1px à direita e embaixo de cada fato, cortada na borda do cartão: com uma
 * linha incompleta, o espaço que sobra fica limpo, sem a cor da divisória.
 */
export function FatosDaVaga({ fatos, observacoes }: { fatos: FatoDaFicha[]; observacoes: string | null }) {
  return (
    <Card className="mb-4 overflow-hidden">
      <dl className={`grid grid-cols-2 sm:grid-cols-3 ${COLUNAS_NO_LARGO[Math.min(Math.max(fatos.length, 3), 6)]}`}>
        {fatos.map((f) => (
          <div key={f.chave} className="min-w-0 px-4 py-3.5 sm:px-5 shadow-[1px_0_0_var(--color-border),0_1px_0_var(--color-border)]">
            <dt className="c41-rotulo">{f.rotulo}</dt>
            <dd
              className={`mt-1 flex items-center gap-1.5 font-display text-fs-7 font-semibold leading-snug break-words tnum ${
                f.destaque ? "text-warning-fg" : "text-fg"
              }`}
            >
              {f.destaque && <Flag size={15} aria-hidden className="flex-shrink-0" />}
              <span className="min-w-0">{f.valor}</span>
            </dd>
            {f.detalhe && <dd className="mt-0.5 text-fs-2 text-fg-muted">{f.detalhe}</dd>}
          </div>
        ))}
      </dl>
      {observacoes && (
        <div className="border-t border-border px-4 py-3 sm:px-5">
          <p className="c41-rotulo mb-1">Observações</p>
          <p className="text-ui text-fg whitespace-pre-wrap">{observacoes}</p>
        </div>
      )}
    </Card>
  );
}
