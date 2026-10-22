import { MolduraDeEntrada } from "@/components/entrada/MolduraDeEntrada";
import { EstiloDaAparencia } from "@/components/aparencia/EstiloDaAparencia";
import { APARENCIA_PADRAO } from "@/lib/aparencia/cores";
import type { MarcaPublica } from "@/lib/aparencia/marcaPublica";
import { CarrosselDoPortal } from "./CarrosselDoPortal";

// A entrada do portal do cliente (02/10/2026): login, esqueci e nova senha.
//
// O desenho — duas metades no computador, topo azul no celular — mora em
// `entrada/MolduraDeEntrada`, que desde 06/10/2026 também veste a entrada da
// equipe. Aqui fica o que é do cliente: o rótulo e o carrossel do portal.
//
// Desde 22/10/2026, a marca do escritório quando se sabe de quem é o cliente
// (ver `marcaDaEntradaDoPortal`): o logo e o nome no lugar do Connect, se o
// escritório ligou o logo no portal, e a cor principal nos tokens da marca —
// pelo mesmo `EstiloDaAparencia` do portal, que já ajusta o tom para o
// contraste. Só a cor principal: os grupos de cor são das telas lá de dentro.

export function MolduraDoPortal({
  titulo,
  subtitulo,
  marca = null,
  children,
}: {
  titulo: string;
  subtitulo: string;
  marca?: MarcaPublica | null;
  children: React.ReactNode;
}) {
  return (
    <>
      {marca?.corPrincipal && <EstiloDaAparencia aparencia={{ ...APARENCIA_PADRAO, corPrincipal: marca.corPrincipal }} grupos={false} />}
      <MolduraDeEntrada
        rotulo="Portal do Cliente"
        titulo={titulo}
        subtitulo={subtitulo}
        carrossel={<CarrosselDoPortal />}
        logo={marca?.logoUrl ? { src: marca.logoUrl, nome: marca.nome } : null}
      >
        {children}
      </MolduraDeEntrada>
    </>
  );
}
