import { notFound } from "next/navigation";

// O `children` do layout do app quando a URL é de fora do grupo (app).
//
// Existe por causa do modo estrito de rotas do Next, ligado por padrão no
// 16.4 (13/11/2026). O `@modal/[...catchAll]` fecha o modal ao navegar, mas o
// grupo (app) fica na raiz, então para o Next esse catch-all vale para toda
// URL, inclusive /login, /portal e /carreiras. Sem um `default` aqui, essas
// rotas ficavam com o `children` do (app) sem nada e o Next as descartava
// (404, "do not match any complete route").
//
// Nada renderiza isto: a página de cada URL é escolhida pelo caminho exato
// (`/login/page`), e nela o layout do (app) nem entra. O `notFound()` é o
// mesmo que o Next usaria sem este arquivo.
export default function AppDefault() {
  notFound();
}
