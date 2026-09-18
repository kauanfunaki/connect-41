// A busca de telas do Ctrl+K — no navegador, sem ida ao servidor.
//
// A lista de telas que a pessoa pode abrir já vem montada no shell (o layout
// resolve módulo ligado + setor que ela enxerga), então filtrar é comparar
// string: responde enquanto se digita, enquanto o resto da busca (empresas,
// pessoas, tarefas) espera os 220ms e a rede.

export type TelaNavegavel = {
  code: string;
  label: string;
  href: string;
  /** Rótulo do setor que opera a tela — desempata "Relatórios" de dois setores. */
  setor: string;
};

/** Sem acento e em minúsculas: quem digita "conciliacao" tem de achar "Conciliação". */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * As telas que casam com o termo, as mais prováveis primeiro.
 *
 * A ordem é: começa com o termo, contém o termo, e por último casa pelo nome do
 * setor — quem digita "cob" quer "Cobrança", não as sete telas do BPO. Dentro de
 * cada faixa vale a ordem recebida, que é a do catálogo.
 */
export function buscarTelas(telas: TelaNavegavel[], termo: string, limite = 6): TelaNavegavel[] {
  const alvo = normalizar(termo);
  if (alvo.length < 2) return [];

  const comeca: TelaNavegavel[] = [];
  const contem: TelaNavegavel[] = [];
  const porSetor: TelaNavegavel[] = [];

  for (const tela of telas) {
    const label = normalizar(tela.label);
    if (label.startsWith(alvo)) comeca.push(tela);
    else if (label.includes(alvo)) contem.push(tela);
    else if (normalizar(tela.setor).includes(alvo)) porSetor.push(tela);
  }

  return [...comeca, ...contem, ...porSetor].slice(0, limite);
}
