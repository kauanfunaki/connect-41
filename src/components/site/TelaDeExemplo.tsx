// A imagem de uma coluna do site (13/10/2026): uma cena dos carrosséis das
// entradas — a da equipe (login/CarrosselDaEquipe) e a do portal
// (portal/CarrosselDoPortal) —, parada, no painel azul da marca em que ela
// nasceu. As cenas são desenhadas em código, com nomes e valores inventados, e
// não pedem sessão; reaproveitar evita uma segunda versão das telas para manter.
//
// Duas adaptações para ela caber aqui:
//
// - Parada: os cartões da cena só aparecem dentro do slide ativo (o grupo
//   `slide` com `data-ativo`). Este painel é esse slide, sempre ativo — sem o
//   carrossel, sem troca e sem JS de animação.
// - Encolhida: a cena foi desenhada para 430–640 px de largura, com letra fixa
//   de 10–15 px. Espremida na coluna do celular (uns 260 px), os textos
//   estouravam os cartões. Então ela é montada sempre a 560 px e encolhe
//   inteira, como uma imagem, em degraus pela largura do painel (consulta de
//   contêiner, só CSS). Cada degrau usa a escala do menor tamanho da faixa, para
//   nunca passar da largura; sobra no máximo 40 px dos lados.

export function TelaDeExemplo({ children }: { children: React.ReactNode }) {
  return (
    <div
      aria-hidden
      className="relative select-none overflow-hidden rounded-xl px-2.5 py-4 sm:px-4 sm:py-5"
      style={{ background: "radial-gradient(120% 90% at 85% 10%, var(--c41-brand-700), var(--c41-brand-900) 60%)" }}
    >
      <div className="@container relative aspect-[16/11] w-full">
        <div
          data-ativo="true"
          className="group/slide absolute left-1/2 top-0 aspect-[16/11] w-[560px] origin-top -translate-x-1/2 scale-[.38] @min-[240px]:scale-[.42] @min-[280px]:scale-50 @min-[320px]:scale-[.57] @min-[360px]:scale-[.64] @min-[400px]:scale-[.71] @min-[440px]:scale-[.78] @min-[480px]:scale-[.85] @min-[520px]:scale-[.92] @min-[560px]:scale-100"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
