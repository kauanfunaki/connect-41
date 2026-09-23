import Link from "next/link";
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
    <div className="basis-full mt-1 rounded-md border border-border bg-surface-2 px-3 py-2 text-[12px] space-y-0.5">
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
      <Link href={`/vagas/${ficha.vagaId}/candidaturas/${ficha.candidaturaId}`} className="text-brand hover:underline">
        Abrir candidatura
      </Link>
    </div>
  );
}
