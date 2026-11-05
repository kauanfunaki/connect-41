import type { DadosDoChamado } from "./regras";

/**
 * Os dados da janela "Editar dados" mudaram em relação ao chamado? Decide se o
 * fechar sem salvar pede confirmação. Compara o que a action grava: espaços nas
 * pontas do texto e tags vazias não contam como mudança.
 */
export function dadosMudaram(antes: DadosDoChamado, depois: DadosDoChamado): boolean {
  const norm = (d: DadosDoChamado) => JSON.stringify({
    title: d.title.trim(), description: d.description.trim(), categoryId: d.categoryId, requesterSectorCode: d.requesterSectorCode, priority: d.priority,
    requestData: Object.fromEntries(Object.entries(d.requestData).map(([k, v]) => [k, String(v ?? "").trim()]).filter(([, v]) => v !== "").sort(([a], [b]) => a.localeCompare(b))),
    tags: d.tags.map(t => t.trim()).filter(Boolean),
  });
  return norm(antes) !== norm(depois);
}

/**
 * O que fazer quando a pessoa fecha a janela "Editar dados" (X, Esc, clique fora
 * ou "Cancelar"): com mudança não salva, pergunta antes de descartar; enquanto
 * salva, não fecha — a resposta da action ainda vai chegar.
 */
export function aoFecharEdicao(mudou: boolean, salvando: boolean): "fechar" | "confirmar" | "esperar" {
  if (salvando) return "esperar";
  return mudou ? "confirmar" : "fechar";
}
