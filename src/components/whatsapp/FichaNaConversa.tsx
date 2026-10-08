import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ROTULO_DA_FAIXA } from "@/lib/recrutamento/triagem";
import { resumoDasRespostas, faltaPerguntar, ROTULO_DA_RESPOSTA } from "@/lib/recrutamento/respostas";
import type { FichaDaCandidatura } from "@/lib/whatsapp/data";

/**
 * A candidatura ligada, sem sair da conversa: a nota da triagem e o que o
 * robô já coletou. Corrigir é na página da candidatura — aqui só se lê.
 */
export function FichaNaConversa({ ficha }: { ficha: FichaDaCandidatura }) {
  const resumo = resumoDasRespostas(ficha.respostas);
  const falta = faltaPerguntar(ficha.respostas);
  return (
    <div className="basis-full mt-1 rounded-md border border-border bg-surface-2 px-3 py-2 text-fs-2 space-y-0.5">
      <p>
        <span className="text-fg-muted">Triagem: </span>
        {ficha.nota ? (
          <span className="font-medium tnum">
            {ficha.nota.score} · {ROTULO_DA_FAIXA[ficha.nota.faixa]}
            {ficha.nota.desatualizada && <span className="text-fg-muted font-normal"> (requisitos mudaram)</span>}
          </span>
        ) : (
          <span className="text-fg-muted">sem nota ainda</span>
        )}
      </p>
      <p>
        <span className="text-fg-muted">Respostas: </span>
        {resumo ?? <span className="text-fg-muted">nenhuma ainda</span>}
      </p>
      {falta.length > 0 && (
        <p className="text-fg-muted">Falta perguntar: {falta.map((c) => ROTULO_DA_RESPOSTA[c].toLowerCase()).join(", ")}.</p>
      )}
      {/* Botão, e não link de texto (30/09): é a ação de abrir a candidatura. */}
      <Button href={`/vagas/${ficha.vagaId}/candidaturas/${ficha.candidaturaId}`} variant="secondary" size="xs" className="mt-1.5">
        Abrir candidatura <ArrowRight size={11} />
      </Button>
    </div>
  );
}
