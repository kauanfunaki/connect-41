/**
 * Para onde o "início" da página não encontrada leva, pelo endereço que a pessoa
 * tentou abrir (auditoria de UX, 30/10/2026). O botão ia sempre ao /home, e o
 * candidato ou o cliente que errava um endereço caía no login da equipe.
 *
 * - portal do cliente → o portal;
 * - carreiras de uma empresa → as vagas dessa empresa;
 * - links por token (admissão, documento, teste) não têm "início": volta;
 * - o resto → o início da equipe.
 */
export type DestinoDoNaoEncontrado = { href: string; rotulo: string } | { voltar: true; rotulo: string };

export function destinoDoNaoEncontrado(caminho: string | null | undefined): DestinoDoNaoEncontrado {
  const partes = (caminho ?? "").split("?")[0].split("/").filter(Boolean);
  const [primeiro, segundo] = partes;
  if (primeiro === "portal") return { href: "/portal", rotulo: "Ir para o portal" };
  if (primeiro === "carreiras") {
    return segundo ? { href: `/carreiras/${encodeURIComponent(segundo)}`, rotulo: "Ver as vagas" } : { href: "/carreiras", rotulo: "Ver o portal de vagas" };
  }
  if (primeiro === "admissao" || primeiro === "d" || primeiro === "teste") return { voltar: true, rotulo: "Voltar" };
  return { href: "/home", rotulo: "Ir para o início" };
}
