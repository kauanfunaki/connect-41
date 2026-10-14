"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { contarPerguntas, filtrarPerguntas, type FiltroDasPerguntas, type PerguntaRespondida } from "@/lib/testes/questionario";

/**
 * O resultado do questionário na página do teste (14/10/2026, escolha
 * "Teste · 3A — Lista de perguntas" do Kauan): a nota grande em cima, o filtro
 * Todas / Erradas e a lista de perguntas com a resposta dada e, quando errou,
 * a certa. Era só a nota e uma barra — não dava para ver o que a pessoa errou.
 */
export function ResultadoQuestionario({
  acertos,
  total,
  pct,
  perguntas,
  respondidoEm,
}: {
  acertos: number;
  total: number;
  pct: number;
  perguntas: PerguntaRespondida[];
  respondidoEm: string | null;
}) {
  const [filtro, setFiltro] = useState<FiltroDasPerguntas>("todas");
  const contagem = contarPerguntas(perguntas);
  const lista = filtrarPerguntas(perguntas, filtro);
  const semTexto = perguntas.some((p) => p.texto === null);

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 mb-4">
        <div>
          <p className="text-metric font-semibold text-fg leading-none tnum">
            {acertos} de {total}
          </p>
          <p className="text-ui text-fg-muted mt-1.5">
            acertos · {pct}%{respondidoEm ? ` · respondido em ${respondidoEm}` : ""}
          </p>
        </div>
        {perguntas.length > 0 && (
          <SegmentedControl<FiltroDasPerguntas>
            label="Quais perguntas mostrar"
            active={filtro}
            onChange={setFiltro}
            items={[
              { key: "todas", label: `Todas (${contagem.todas})` },
              { key: "erradas", label: `Erradas (${contagem.erradas})`, disabled: contagem.erradas === 0 },
            ]}
          />
        )}
      </div>

      {perguntas.length === 0 ? (
        <p className="text-ui text-fg-muted">As respostas deste teste não foram guardadas pergunta a pergunta.</p>
      ) : (
        <ol className="divide-y divide-border">
          {lista.map((p) => (
            <li key={p.numero} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3 py-3 first:pt-0">
              <span
                className={`w-7 h-7 rounded-full inline-flex items-center justify-center ${
                  p.acertou ? "bg-success-bg text-success-fg" : "bg-danger-bg text-danger"
                }`}
              >
                {p.acertou ? <Check size={14} aria-hidden /> : <X size={14} aria-hidden />}
                <span className="sr-only">{p.acertou ? "Acertou" : "Errou"}</span>
              </span>
              <div className="min-w-0">
                <p className="text-ui font-semibold text-fg break-words">
                  {p.numero}. {p.texto ?? <span className="font-normal text-fg-muted">Pergunta que saiu do modelo</span>}
                </p>
                {p.acertou ? (
                  <p className="text-fs-2 text-fg-muted mt-0.5 break-words">Respondeu: {p.resposta}</p>
                ) : (
                  <p className="text-fs-2 mt-0.5 break-words">
                    <span className="text-danger font-semibold">Respondeu: {p.resposta}</span>
                    <span className="text-fg-muted"> · </span>
                    <span className="text-success-fg font-semibold">Certa: {p.certa}</span>
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {semTexto && (
        <p className="text-fs-2 text-fg-muted mt-3">
          O modelo deste teste foi alterado depois da resposta: as perguntas que saíram dele aparecem só com a letra da alternativa.
        </p>
      )}
    </Card>
  );
}
