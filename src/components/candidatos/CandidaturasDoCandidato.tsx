import { ArrowRight, Check, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { ROTULO_DA_FAIXA, type Faixa } from "@/lib/recrutamento/triagem";
import type { EstadoDaEtapa, ResumoDaEtapa } from "@/lib/recrutamento/fichaDoCandidato";

export type CandidaturaDoCartao = {
  id: string;
  vagaId: string;
  vagaTitulo: string;
  empresa: string;
  /** "04/10" — `dataCurta`. */
  inscritoEm: string;
  /** Já no rótulo de gente: "Portal de vagas", "Indicação". */
  origem: string | null;
  etapa: ResumoDaEtapa;
  /** A última nota da triagem de currículos da vaga, quando houver. */
  nota: { score: number; faixa: Faixa } | null;
};

const TOM_DA_FAIXA: Record<Faixa, TomDoSelo> = {
  COMPATIVEL: "sucesso",
  PARCIAL: "atencao",
  INCOMPATIVEL: "neutro",
};

const BOLINHA: Record<EstadoDaEtapa, string> = {
  feita: "bg-brand-solid border-brand-solid text-on-brand",
  atual: "bg-surface border-brand shadow-[0_0_0_3px_var(--c41-focus-ring)]",
  parou: "bg-surface-2 border-fg-muted text-fg-muted",
  futura: "bg-surface border-border-strong",
};

/** As cinco etapas do funil, com a da candidatura marcada (escolha 2A do Kauan, 14/10/2026). */
function Etapas({ etapa }: { etapa: ResumoDaEtapa }) {
  const { etapas } = etapa;
  return (
    <div>
      <ol className="flex items-center" aria-label={etapa.descricao}>
        {etapas.map((e, i) => {
          const proxima = etapas[i + 1];
          const trilhaFeita = proxima && (proxima.estado === "feita" || proxima.estado === "atual");
          return (
            <li key={e.chave} className={`flex items-center ${proxima ? "flex-1" : ""}`} data-dica={e.rotulo}>
              <span
                aria-hidden
                className={`inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border-[1.5px] ${BOLINHA[e.estado]}`}
              >
                {e.estado === "feita" && <Check size={9} strokeWidth={3.5} />}
                {e.estado === "parou" && <X size={9} strokeWidth={3.5} />}
              </span>
              {proxima && <span aria-hidden className={`mx-0.5 h-0.5 flex-1 rounded-full ${trilhaFeita ? "bg-brand-solid" : "bg-border"}`} />}
            </li>
          );
        })}
      </ol>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-helper">
        {etapa.selo && <Selo tom={etapa.selo.tom}>{etapa.selo.texto}</Selo>}
        {etapa.etapaAtual && <span className="font-semibold text-fg">{etapa.etapaAtual}</span>}
        {etapa.detalhe && (
          <span className="text-fg-muted">
            {etapa.etapaAtual ? "· " : ""}
            {etapa.detalhe}
          </span>
        )}
      </p>
    </div>
  );
}

/**
 * As candidaturas da pessoa, um cartão por vaga: título e empresa, quando e
 * por onde se inscreveu, as cinco etapas com a atual marcada, a nota da
 * triagem e o botão para abrir a candidatura. Antes era o nome da vaga como
 * link solto à esquerda e o resto na outra ponta, sem dizer a etapa.
 */
export function CandidaturasDoCandidato({ candidaturas }: { candidaturas: CandidaturaDoCartao[] }) {
  return (
    <Card className="@container p-5">
      <h2 className="text-section font-semibold text-fg mb-1">
        Candidaturas {candidaturas.length > 0 && <span className="tnum">({candidaturas.length})</span>}
      </h2>

      {candidaturas.length === 0 ? (
        <p className="text-ui text-fg-muted mt-2">Ainda não foi vinculado a nenhuma vaga.</p>
      ) : (
        <ul className="divide-y divide-border">
          {candidaturas.map((c) => (
            <li
              key={c.id}
              className="grid grid-cols-1 gap-3 py-3.5 last:pb-0 @xl:grid-cols-[minmax(0,1fr)_11rem_auto] @xl:items-center @xl:gap-5"
            >
              <div className="min-w-0">
                <p className="text-body font-semibold text-fg break-words">{c.vagaTitulo}</p>
                <p className="truncate text-fs-2 text-fg-muted" title={c.empresa}>
                  {c.empresa}
                </p>
                <p className="mt-0.5 text-helper text-fg-muted">
                  Inscrito em <span className="tnum">{c.inscritoEm}</span>
                  {c.origem && ` · via ${c.origem}`}
                </p>
              </div>

              <Etapas etapa={c.etapa} />

              <div className="flex flex-wrap items-center gap-2 @xl:flex-col @xl:items-end">
                {c.nota && (
                  <Selo tom={TOM_DA_FAIXA[c.nota.faixa]} className="tnum">
                    {c.nota.score} · {ROTULO_DA_FAIXA[c.nota.faixa]}
                  </Selo>
                )}
                <Button href={`/vagas/${c.vagaId}/candidaturas/${c.id}`} variant="secondary" size="xs" className="whitespace-nowrap">
                  Abrir candidatura <ArrowRight size={12} />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
