import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DISC_DIMENSIONS, DISC_LABEL, type DiscDimension, type DiscScores } from "@/lib/disc";
import {
  AVISO_DO_DISC,
  codigoDoPerfil,
  duasMaisFortes,
  explicacaoDoPerfil,
  nomeDoPerfil,
  notaDaLetra,
  pontoNoEixo,
  pontosDaTeia,
  pontosDoPoligono,
  rotuloDaTeia,
  type GeometriaDaTeia,
} from "@/lib/testes/discExplicado";

// A cor de cada letra — a mesma das barras finas da ficha do candidato
// (`DiscBars`), para a letra ler igual nas duas telas.
const COR_DA_LETRA: Record<DiscDimension, string> = {
  D: "bg-danger",
  I: "bg-warning",
  S: "bg-success",
  C: "bg-brand",
};

const TEIA: GeometriaDaTeia = { cx: 130, cy: 110, raio: 80 };
/** As quatro voltas da grade: 25%, 50%, 75% e 100%. */
const VOLTAS = [0.25, 0.5, 0.75, 1];
/** Onde cada rótulo fica, um pouco além da ponta do eixo. */
const ROTULO: Record<DiscDimension, { x: number; y: number; ancora: "start" | "middle" | "end" }> = {
  D: { x: 130, y: 20, ancora: "middle" },
  I: { x: 216, y: 114, ancora: "start" },
  S: { x: 130, y: 208, ancora: "middle" },
  C: { x: 44, y: 114, ancora: "end" },
};

/**
 * A teia do DISC, desenhada em escala: cada eixo vai de 0 (centro) a 100% (a
 * ponta), e 50% fica no meio. SVG na página, nos tokens do tema — claro e
 * escuro sem cor fixa. Para o leitor de tela, as quatro notas no rótulo.
 */
function TeiaDoDisc({ scores }: { scores: DiscScores }) {
  const area = pontosDaTeia(scores, TEIA);
  return (
    <svg viewBox="0 0 260 220" role="img" aria-label={rotuloDaTeia(scores)} className="w-full max-w-[300px] h-auto mx-auto">
      {VOLTAS.map((v) => (
        <polygon
          key={v}
          points={pontosDoPoligono(DISC_DIMENSIONS.map((d) => pontoNoEixo(d, v, TEIA)))}
          className="fill-none stroke-border-strong"
          strokeWidth={1}
        />
      ))}
      <line x1={130} y1={30} x2={130} y2={190} className="stroke-border-strong" strokeWidth={1} />
      <line x1={50} y1={110} x2={210} y2={110} className="stroke-border-strong" strokeWidth={1} />
      <polygon points={pontosDoPoligono(area)} className="fill-brand/15 stroke-brand" strokeWidth={2} strokeLinejoin="round" />
      {area.map((p) => (
        <circle key={p.dim} cx={p.x} cy={p.y} r={3.5} className="fill-brand" />
      ))}
      {DISC_DIMENSIONS.map((d) => (
        <text
          key={d}
          x={ROTULO[d].x}
          y={ROTULO[d].y}
          textAnchor={ROTULO[d].ancora}
          className="fill-fg-secondary text-[11px] font-semibold"
        >
          {d} {notaDaLetra(scores, d)}%
        </text>
      ))}
    </svg>
  );
}

/**
 * O resultado do DISC na página do teste (14/10/2026, escolha "Teste · 2 —
 * A + B" do Kauan: "a tela tem bastante espaço e cabe os dois"). Barras
 * grossas com o nome de cada letra — as duas mais fortes em destaque — e a
 * teia, lado a lado no computador; embaixo, o quadro que explica o perfil em
 * português simples. No celular, um embaixo do outro.
 *
 * Era só o código do perfil e quatro barras finas com uma letra cada, sem
 * dizer o que as letras nem o perfil queriam dizer. A ficha do candidato
 * continua com o resumo compacto (`DiscBars`).
 */
export function ResultadoDisc({
  scores,
  principal,
  segunda,
  respondidoEm,
}: {
  scores: DiscScores;
  principal: DiscDimension;
  segunda: DiscDimension | null;
  /** "12/10/2026". */
  respondidoEm: string | null;
}) {
  const fortes = new Set(duasMaisFortes(scores));
  const codigo = codigoDoPerfil(principal, segunda);
  const explicacao = explicacaoDoPerfil(principal, segunda);

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-5">
        {/* O perfil é uma classificação: o `Badge` (escolha 2A, 08/10/2026). */}
        <Badge variant="info">
          Perfil {codigo} — {nomeDoPerfil(principal, segunda)}
        </Badge>
        {respondidoEm && <span className="text-fs-2 text-fg-muted">respondido em {respondidoEm}</span>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)] gap-x-8 gap-y-6 items-center">
        <ul className="space-y-4" aria-label="Nota de cada letra do DISC">
          {DISC_DIMENSIONS.map((d) => {
            const forte = fortes.has(d);
            const nota = notaDaLetra(scores, d);
            return (
              <li key={d} className="grid grid-cols-[8.5rem_minmax(0,1fr)_3rem] sm:grid-cols-[10rem_minmax(0,1fr)_3rem] items-center gap-3">
                <span className={`text-ui ${forte ? "font-semibold text-fg" : "text-fg-muted"}`}>
                  {d} · {DISC_LABEL[d]}
                  {forte && <span className="sr-only"> (uma das duas mais fortes)</span>}
                </span>
                <span className="h-5 rounded-md bg-surface-2 overflow-hidden" aria-hidden>
                  <span
                    className={`block h-full rounded-md ${COR_DA_LETRA[d]} ${forte ? "" : "opacity-45"}`}
                    style={{ width: `${nota}%` }}
                  />
                </span>
                <span className={`text-right text-ui tnum ${forte ? "font-semibold text-fg" : "text-fg-muted"}`}>{nota}%</span>
              </li>
            );
          })}
        </ul>

        <TeiaDoDisc scores={scores} />
      </div>

      <div className="mt-6 rounded-lg bg-surface-2 p-4 sm:p-5">
        <h2 className="text-card-title font-semibold text-fg">O que o perfil {codigo} quer dizer</h2>
        <p className="text-body text-fg-secondary mt-1.5 max-w-[78ch]">{explicacao.resumo}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 mt-4">
          <div>
            <p className="c41-rotulo mb-1.5">Pontos fortes</p>
            <ul className="space-y-1">
              {explicacao.pontosFortes.map((t) => (
                <li key={t} className="flex gap-2 text-ui text-fg">
                  <span aria-hidden className="mt-[0.45em] w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="c41-rotulo mb-1.5">Pontos de atenção</p>
            <ul className="space-y-1">
              {explicacao.pontosDeAtencao.map((t) => (
                <li key={t} className="flex gap-2 text-ui text-fg">
                  <span aria-hidden className="mt-[0.45em] w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <p className="text-fs-2 text-fg-muted mt-4">{AVISO_DO_DISC}</p>
    </Card>
  );
}
