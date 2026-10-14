import { Hanken_Grotesk, Unbounded } from "next/font/google";

// As letras do 41 Carreiras (15/10/2026), só nas páginas dele — o Connect
// segue com as dele (layout raiz).
//
// - Títulos: Unbounded, uma grotesca geométrica larga, da família do nome
//   "41 TALLENT" do logo (traço fino, letras abertas). Usada leve (300–500).
// - Texto: Hanken Grotesk, feita para leitura em tela, com os acentos do
//   português e algarismos tabulares para datas e contagens.

export const fonteDosTitulos = Unbounded({
  subsets: ["latin", "latin-ext"],
  variable: "--t41-fonte-titulo",
  display: "swap",
});

export const fonteDoTexto = Hanken_Grotesk({
  subsets: ["latin", "latin-ext"],
  variable: "--t41-fonte-texto",
  display: "swap",
});
