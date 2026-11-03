import localFont from "next/font/local";

// As letras do 41 Carreiras (15/10/2026), só nas páginas dele — o Connect
// segue com as dele (layout raiz).
//
// - Títulos: Unbounded, uma grotesca geométrica larga, da família do nome
//   "41 TALLENT" do logo (traço fino, letras abertas). Usada leve (300–500).
// - Texto: Hanken Grotesk, feita para leitura em tela, com os acentos do
//   português e algarismos tabulares para datas e contagens.
//
// Do repositório desde 30/10/2026 (`src/fontes`, OFL), e não mais baixadas do
// Google a cada build — ver `src/fontes/LEIA-ME.md`. As duas são variáveis,
// com o eixo de peso inteiro, como o `next/font/google` entregava sem `weight`.

export const fonteDosTitulos = localFont({
  src: "../../../fontes/Unbounded-wght.woff2",
  variable: "--t41-fonte-titulo",
  weight: "200 900",
  display: "swap",
});

export const fonteDoTexto = localFont({
  src: "../../../fontes/HankenGrotesk-wght.woff2",
  variable: "--t41-fonte-texto",
  weight: "100 900",
  display: "swap",
});
