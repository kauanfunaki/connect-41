import { MolduraDeEntrada } from "@/components/entrada/MolduraDeEntrada";
import { CarrosselDaEquipe } from "./CarrosselDaEquipe";

// A entrada da equipe — login, esqueci e nova senha (06/10/2026).
//
// Decisão do Kauan: o mesmo visual da entrada do portal do cliente (duas
// metades no computador, topo azul no celular), com o carrossel voltado ao
// operacional da equipe. Substituiu o `AuthShell`, que tinha o painel azul
// fixo com "Contábil, Fiscal, Societário, DP/RH…".

export function MolduraDaEquipe({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo: string;
  children: React.ReactNode;
}) {
  return (
    <MolduraDeEntrada rotulo="Área da equipe" titulo={titulo} subtitulo={subtitulo} carrossel={<CarrosselDaEquipe />}>
      {children}
    </MolduraDeEntrada>
  );
}
