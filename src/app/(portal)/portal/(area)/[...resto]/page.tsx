import { notFound } from "next/navigation";

// Endereço que não existe dentro de /portal (link antigo, digitado errado).
// Sem esta rota, quem responde é o 404 da raiz — o único que pega URL sem
// rota — e o botão dele leva a `/home`, a entrada da equipe. Com ela, o
// endereço cai no `not-found` do portal, dentro da moldura e com a volta para
// o Início (07/10/2026). As rotas que existem ganham desta por serem mais
// específicas; quem não entrou passa antes pelo login, no layout.
export default function EnderecoQueNaoExisteNoPortal() {
  notFound();
}
