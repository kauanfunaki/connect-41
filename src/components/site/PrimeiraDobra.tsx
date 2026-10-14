import { ArrowDown } from "lucide-react";
import { BOTAO_GRANDE, FAIXA, PRIMARIO } from "./estilos";
import { TelaDoConnect } from "./TelaDoConnect";

// A primeira dobra do site (13/10/2026, versão 3).
//
// Pedido do Kauan: a versão 2 ficou "extremamente parecida com a referência,
// deixando muito superficial". A referência nova (um site de produto de IA)
// vale pelo ritmo — título enorme sobre uma aura suave, a tela do produto
// subindo por baixo —, não pelo desenho. Aqui o que é do Connect:
//
// - a aura é o próprio símbolo: o anel aberto, enorme e fino, se desenha em
//   volta do título, com o nó na abertura e uma bolinha na cor de cada setor
//   sobre o anel (o escritório inteiro ligado);
// - o selo de cima, no lugar do "tantos mil usam", diz para quem é, com as
//   cores dos setores empilhadas — nada de número inventado;
// - a tela que sobe é o Connect com a Ceci abrindo o chat (TelaDoConnect).
//
// Um botão só, "Conhecer o Connect", que desce para a Ceci — o começo do
// passeio. Server Component; o movimento é CSS (globals.css, bloco do site):
// a entrada ao carregar, o anel se desenhando e a tela endireitando ao rolar,
// tudo parado com "reduzir movimento".

// O anel: centro (500, 500) e raio 420 no viewBox de 1000, abertura de 80°
// virada para a direita, como no logo. O nó fica no meio da abertura.
const CENTRO = 500;
const RAIO = 420;

function noAnel(graus: number) {
  const rad = (graus * Math.PI) / 180;
  return { x: (CENTRO + RAIO * Math.cos(rad)).toFixed(1), y: (CENTRO - RAIO * Math.sin(rad)).toFixed(1) };
}

const PONTA_DE_CIMA = noAnel(40);
const PONTA_DE_BAIXO = noAnel(-40);
const CAMINHO_DO_ANEL = `M ${PONTA_DE_CIMA.x} ${PONTA_DE_CIMA.y} A ${RAIO} ${RAIO} 0 1 0 ${PONTA_DE_BAIXO.x} ${PONTA_DE_BAIXO.y}`;

// Uma bolinha por setor, longe da abertura: o balanço (±14°) não chega nela.
const SETORES_NO_ANEL = [
  { graus: 78, cor: "var(--c41-sector-gestao)", raio: 6 },
  { graus: 118, cor: "var(--c41-sector-bpo)", raio: 9 },
  { graus: 152, cor: "var(--c41-sector-fiscal)", raio: 7 },
  { graus: 198, cor: "var(--c41-sector-dprh)", raio: 10 },
  { graus: 236, cor: "var(--c41-sector-societario)", raio: 7 },
  { graus: 282, cor: "var(--c41-sector-recrutamento)", raio: 8 },
];

// As cores dos setores empilhadas no selo.
const CORES_DO_SELO = [
  "var(--c41-sector-bpo)",
  "var(--c41-sector-fiscal)",
  "var(--c41-sector-dprh)",
  "var(--c41-sector-societario)",
  "var(--c41-sector-recrutamento)",
];

// O título cresce com a tela: 36 px no celular, até 92 px.
const TITULO =
  "font-display text-[length:clamp(2.25rem,0.95rem_+_5.8vw,5.75rem)] font-medium leading-[0.98] tracking-[-0.045em] text-fg text-balance";

/** A aura atrás da primeira dobra e do topo: o brilho e o anel do símbolo. */
export function AuraDaPrimeiraDobra() {
  // O tamanho e a posição do anel acompanham o título, para o anel passar em
  // volta dele em toda largura: o centro do anel fica na altura do título.
  const QUADRO = "absolute left-1/2 -translate-x-1/2 w-[720px] top-[-150px] sm:w-[980px] sm:top-[-230px] lg:w-[1180px] lg:top-[-290px]";
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-[980px] overflow-hidden [mask-image:linear-gradient(to_bottom,black_55%,transparent)] sm:h-[1080px]"
    >
      <div className="c41-site-aura absolute inset-0" />
      {/* O anel desfocado: o brilho tem a forma do símbolo. */}
      <svg viewBox="0 0 1000 1000" className={`${QUADRO} opacity-25 blur-[40px] dark:opacity-30`}>
        <defs>
          <linearGradient id="site-aura-anel" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#1B4FD8" />
            <stop offset="1" stopColor="#8FB5FF" />
          </linearGradient>
        </defs>
        <path d={CAMINHO_DO_ANEL} fill="none" stroke="url(#site-aura-anel)" strokeWidth={84} strokeLinecap="round" />
      </svg>
      {/* O anel fino, que se desenha ao abrir a página, o nó e os setores. */}
      <svg viewBox="0 0 1000 1000" className={QUADRO}>
        <path
          d={CAMINHO_DO_ANEL}
          pathLength={1}
          fill="none"
          stroke="var(--c41-border-strong)"
          strokeWidth={1.6}
          strokeLinecap="round"
          className="c41-site-traca"
        />
        <g className="c41-site-orbita">
          {SETORES_NO_ANEL.map((s) => {
            const p = noAnel(s.graus);
            return <circle key={s.graus} cx={p.x} cy={p.y} r={s.raio} style={{ fill: s.cor }} />;
          })}
        </g>
        <circle cx={CENTRO + RAIO} cy={CENTRO} r={34} className="c41-site-pulsa" style={{ fill: "var(--c41-brand-400)" }} />
        <circle cx={CENTRO + RAIO} cy={CENTRO} r={15} style={{ fill: "var(--c41-brand-600)" }} />
      </svg>
    </div>
  );
}

export function PrimeiraDobra() {
  return (
    <section id="inicio" aria-labelledby="site-titulo" className="relative scroll-mt-16">
      <div className={`${FAIXA} flex flex-col items-center pt-12 text-center sm:pt-20 lg:pt-24`}>
        <p
          className="c41-site-entra inline-flex items-center gap-2.5 rounded-full border border-border bg-surface/70 py-1.5 pl-2 pr-3.5 text-fs-3 font-medium text-fg-secondary shadow-[var(--c41-shadow-xs)] backdrop-blur dark:bg-surface/60"
        >
          <span aria-hidden className="flex -space-x-1">
            {CORES_DO_SELO.map((cor) => (
              <span key={cor} className="size-4 rounded-full ring-2 ring-surface" style={{ background: cor }} />
            ))}
          </span>
          Para escritórios de contabilidade
        </p>

        <h1 id="site-titulo" className={`c41-site-entra mt-6 sm:mt-8 ${TITULO}`} style={{ "--atraso": "70ms" } as React.CSSProperties}>
          <span className="block">O escritório inteiro,</span>{" "}
          <span className="block">
            <span className="text-brand">ligado</span> num lugar só.
          </span>
        </h1>

        <p
          className="c41-site-entra mt-6 max-w-[36em] text-fs-6 leading-relaxed text-fg-secondary sm:mt-7 sm:text-fs-7"
          style={{ "--atraso": "140ms" } as React.CSSProperties}
        >
          Os setores do escritório de contabilidade e o Portal do Cliente no mesmo sistema — e a Ceci, a nossa inteligência
          artificial, em cada setor.
        </p>

        <a
          href="#ceci"
          className={`c41-site-entra ${BOTAO_GRANDE} ${PRIMARIO} mt-8 sm:mt-9`}
          style={{ "--atraso": "210ms" } as React.CSSProperties}
        >
          Conhecer o Connect
          <ArrowDown size={18} aria-hidden className="flex-none" />
        </a>
      </div>

      {/* A tela do Connect subindo por baixo do título. Dois invólucros: um
          sobe ao carregar, o de dentro endireita ao rolar — cada animação no
          seu `transform`. */}
      <div className={`${FAIXA} mt-12 sm:mt-16 lg:mt-20`}>
        <div className="c41-site-entra-tela mx-auto max-w-[460px] md:max-w-none">
          <div className="c41-site-endireita">
            <TelaDoConnect />
          </div>
        </div>
        <p className="mt-4 text-center text-fs-2 text-fg-muted">Tela de exemplo do Connect, com dados fictícios.</p>
      </div>
    </section>
  );
}
