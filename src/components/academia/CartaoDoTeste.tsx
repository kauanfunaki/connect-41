import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Selo } from "@/components/ui/Selo";
import { NIVEIS, ROTULO_DO_NIVEL, ROTULO_DO_TESTE } from "@/lib/academia/regras";
import { resultadoEmTexto } from "@/lib/academia/ranking";
import type { ResumoDoTeste } from "@/lib/academia/tipos";
import { DESCRICAO_DO_TESTE } from "./descricoes";
import { IconeDoTeste } from "./IconeDoTeste";

/**
 * O cartão de um teste (10/11/2026): o melhor da pessoa no mês, a tentativa
 * valendo de hoje em cada nível e os dois caminhos — valendo e treino livre.
 */
export function CartaoDoTeste({ resumo, podeFazer }: { resumo: ResumoDoTeste; podeFazer: boolean }) {
  const { teste, melhor, usadosHoje } = resumo;
  const tituloId = `teste-${teste}-titulo`;
  return (
    <Card as="section" aria-labelledby={tituloId} className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-9 flex-shrink-0 items-center justify-center rounded-md bg-brand-subtle text-brand">
          <IconeDoTeste teste={teste} size={18} />
        </span>
        <div className="min-w-0">
          <h3 id={tituloId} className="text-body font-semibold text-fg">{ROTULO_DO_TESTE[teste]}</h3>
          <p className="text-helper text-fg-muted">{DESCRICAO_DO_TESTE[teste]}</p>
        </div>
      </div>

      <p className="text-ui text-fg-secondary">
        Seu melhor do mês:{" "}
        {melhor ? (
          <span className="font-semibold text-fg tabular-nums">
            {resultadoEmTexto(teste, melhor)} <span className="font-normal text-fg-muted">({ROTULO_DO_NIVEL[melhor.nivel]})</span>
          </span>
        ) : (
          <span className="text-fg-muted">ainda nenhum</span>
        )}
      </p>

      <div>
        <p className="text-helper text-fg-muted mb-1.5">Valendo hoje, por nível:</p>
        <ul className="flex flex-wrap gap-1.5" aria-label={`Tentativa valendo de hoje em ${ROTULO_DO_TESTE[teste]}`}>
          {NIVEIS.map((n) => {
            const usada = usadosHoje.includes(n);
            return (
              <li key={n}>
                <Selo tom={usada ? "neutro" : "sucesso"}>
                  {ROTULO_DO_NIVEL[n]} · {usada ? "usada" : "livre"}
                </Selo>
              </li>
            );
          })}
        </ul>
      </div>

      {podeFazer && (
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          <Button href={`/academia/testes/${teste}?modo=valendo`} size="sm" className="min-h-11 sm:min-h-0" aria-label={`Fazer ${ROTULO_DO_TESTE[teste]} valendo`}>
            Valendo
          </Button>
          <Button href={`/academia/testes/${teste}?modo=treino`} size="sm" variant="secondary" className="min-h-11 sm:min-h-0" aria-label={`Treino livre de ${ROTULO_DO_TESTE[teste]}`}>
            Treino livre
          </Button>
        </div>
      )}
    </Card>
  );
}
