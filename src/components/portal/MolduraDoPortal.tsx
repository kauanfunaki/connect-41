import { MolduraDeEntrada } from "@/components/entrada/MolduraDeEntrada";
import { CarrosselDoPortal } from "./CarrosselDoPortal";

// A entrada do portal do cliente (02/10/2026): login, esqueci e nova senha.
//
// O desenho — duas metades no computador, topo azul no celular — mora em
// `entrada/MolduraDeEntrada`, que desde 06/10/2026 também veste a entrada da
// equipe. Aqui fica o que é do cliente: o rótulo e o carrossel do portal.

export function MolduraDoPortal({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo: string;
  children: React.ReactNode;
}) {
  return (
    <MolduraDeEntrada rotulo="Portal do Cliente" titulo={titulo} subtitulo={subtitulo} carrossel={<CarrosselDoPortal />}>
      {children}
    </MolduraDeEntrada>
  );
}
