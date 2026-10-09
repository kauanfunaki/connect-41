// A lista de empresas da tela inicial dos Arquivos — regras puras.
//
// Pedido do Kauan (10/2026): a lista é para escolher a empresa, então cabe na
// tela (uma página curta, sem rolar) e cada linha diz quantos documentos a
// empresa tem; quando o cliente mandou algo que a equipe ainda não abriu, a
// etiqueta vira "!" com o número de novos.

/** Linhas por página: cabe na tela de um notebook sem rolar. */
export const EMPRESAS_POR_PAGINA = 12;

/**
 * Pasta de envios que ninguém abriu desde que o "visto" existe: só conta como
 * novo o que chegou nos últimos 30 dias — a mesma janela do "Chegou do
 * cliente". Sem isso, todo envio antigo, já tratado antes, viraria "!".
 */
export const DIAS_SEM_VISTA = 30;

export type EnvioDoCliente = { folderId: string; criadoEm: Date };

/** Quantos envios cada pasta tem depois do último "visto" da equipe, e o mais novo. */
export function novosPorPasta(
  envios: EnvioDoCliente[],
  vistas: ReadonlyMap<string, Date>,
  agora: Date
): Map<string, { novos: number; ultimo: Date }> {
  const semVista = new Date(agora.getTime() - DIAS_SEM_VISTA * 86_400_000);
  const saida = new Map<string, { novos: number; ultimo: Date }>();
  for (const e of envios) {
    const desde = vistas.get(e.folderId) ?? semVista;
    if (e.criadoEm <= desde) continue;
    const atual = saida.get(e.folderId);
    if (!atual) saida.set(e.folderId, { novos: 1, ultimo: e.criadoEm });
    else {
      atual.novos++;
      if (e.criadoEm > atual.ultimo) atual.ultimo = e.criadoEm;
    }
  }
  return saida;
}

export type EmpresaNaLista = {
  id: string;
  nome: string;
  cnpj: string | null;
  /** Arquivos nas pastas que quem pede vê. "Do Connect" entra depois, só na página. */
  arquivos: number;
  novos: number;
  ultimoNovo: Date | null;
  ultimoMovimento: Date | null;
};

/**
 * Quem tem novidade do cliente primeiro (a mais recente em cima). Depois, sem
 * busca, quem teve movimento mais recente — a lista curta mostra as empresas
 * em uso, não as que começam com A; com busca, pelo nome.
 */
export function ordenarEmpresas<T extends EmpresaNaLista>(lista: T[], comBusca: boolean): T[] {
  const tempo = (d: Date | null) => (d ? d.getTime() : 0);
  return [...lista].sort(
    (a, b) =>
      Number(b.novos > 0) - Number(a.novos > 0) ||
      tempo(b.ultimoNovo) - tempo(a.ultimoNovo) ||
      (comBusca ? 0 : tempo(b.ultimoMovimento) - tempo(a.ultimoMovimento)) ||
      a.nome.localeCompare(b.nome, "pt-BR")
  );
}

export function paginar<T>(lista: T[], pagina: number, porPagina = EMPRESAS_POR_PAGINA): { itens: T[]; pagina: number; paginas: number; total: number } {
  const paginas = Math.max(1, Math.ceil(lista.length / porPagina));
  const p = Math.min(Math.max(1, Math.floor(pagina) || 1), paginas);
  return { itens: lista.slice((p - 1) * porPagina, p * porPagina), pagina: p, paginas, total: lista.length };
}
