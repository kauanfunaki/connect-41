"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

type Props = {
  /** O que fica sempre à vista — o cabeçalho clicável. Texto e selo; nada clicável dentro. */
  titulo: React.ReactNode;
  children: React.ReactNode;
  /** Não controlado: começa aberto. */
  abertoInicial?: boolean;
  /** Controlado: quem usa guarda o estado (a busca da ajuda abre todos). */
  aberto?: boolean;
  onAbertoChange?: (aberto: boolean) => void;
  /**
   * `inicio` (padrão): seta ▸ antes do texto, que gira para baixo ao abrir —
   * o lugar do triângulo do `<details>`. `fim`: seta ⌄ na ponta direita, para
   * cabeçalho de cartão.
   */
  chevron?: "inicio" | "fim";
  /** Cabeçalho no meio, com o texto centrado — dentro da célula da tabela padrão. */
  centralizado?: boolean;
  /** Do bloco inteiro (borda, fundo, espaçamento). */
  className?: string;
  /** Do botão do cabeçalho — tamanho e cor do texto, `w-full` para ocupar a linha. */
  classeDoCabecalho?: string;
  /** Da caixa de dentro do conteúdo — o espaço entre cabeçalho e conteúdo mora aqui. */
  classeDoConteudo?: string;
  id?: string;
};

function prefereMenosMovimento(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Bloco que recolhe (08/10/2026), no lugar do `<details>/<summary>` — o
 * triângulo do sistema, que muda de desenho a cada navegador e abria seco.
 * Eram oito telas com ele.
 *
 * O cabeçalho é um `<button>` com `aria-expanded` e `aria-controls`; o
 * conteúdo abre deslizando (a linha da grade vai de 0fr a 1fr) e, fechado, sai
 * da tela e do leitor de tela pelo `visibility` — continua montado, então o
 * que a página renderizou no servidor está lá. Com "reduzir movimento", abre
 * e fecha sem animação.
 *
 * Enquanto anda, o conteúdo é recortado; aberto e parado, não — senão o anel
 * de foco e o que sai da caixa (um menu de filtro) ficariam cortados na borda.
 */
export function Accordion({
  titulo,
  children,
  abertoInicial = false,
  aberto: abertoDeFora,
  onAbertoChange,
  chevron = "inicio",
  centralizado = false,
  className = "",
  classeDoCabecalho = "",
  classeDoConteudo = "",
  id,
}: Props) {
  const idDoConteudo = useId();
  const [interno, setInterno] = useState(abertoInicial);
  const aberto = abertoDeFora ?? interno;

  // Andando = entre o clique e o fim da transição. Ajustado durante a
  // renderização (e não num efeito) para valer já no quadro em que o estado
  // muda, venha a troca do clique ou de fora (controlado).
  const [andando, setAndando] = useState(false);
  const [abertoAntes, setAbertoAntes] = useState(aberto);
  if (aberto !== abertoAntes) {
    setAbertoAntes(aberto);
    setAndando(!prefereMenosMovimento());
  }

  function alternar() {
    const proximo = !aberto;
    if (abertoDeFora === undefined) setInterno(proximo);
    onAbertoChange?.(proximo);
  }

  const seta =
    chevron === "inicio" ? (
      <ChevronRight
        aria-hidden
        className={`mt-[0.2em] size-[1.1em] flex-shrink-0 text-fg-muted transition-transform motion-reduce:transition-none ${aberto ? "rotate-90" : ""}`}
      />
    ) : (
      <ChevronDown
        aria-hidden
        className={`mt-1 size-4 flex-shrink-0 text-fg-muted transition-transform motion-reduce:transition-none ${aberto ? "rotate-180" : ""}`}
      />
    );

  return (
    <div id={id} className={className || undefined}>
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={idDoConteudo}
        onClick={alternar}
        className={`flex items-start ${chevron === "inicio" ? "gap-1" : "gap-3"} cursor-pointer rounded-sm ${centralizado ? "mx-auto text-center" : "text-left"} ${classeDoCabecalho}`.trim()}
      >
        {chevron === "inicio" && seta}
        <span className="min-w-0 flex-1">{titulo}</span>
        {chevron === "fim" && seta}
      </button>
      <div
        id={idDoConteudo}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget) setAndando(false);
        }}
        className={`grid transition-[grid-template-rows,visibility] duration-200 ease-out motion-reduce:transition-none ${
          aberto ? "grid-rows-[1fr] visible" : "grid-rows-[0fr] invisible"
        }`}
      >
        <div className={`min-h-0 ${aberto && !andando ? "" : "overflow-hidden"}`}>
          <div className={classeDoConteudo || undefined}>{children}</div>
        </div>
      </div>
    </div>
  );
}
