"use client";

import { useState } from "react";

/**
 * A seleção de linhas de uma tabela com ação em massa, presa às linhas que
 * estão à vista (09/11/2026).
 *
 * Desde que os filtros navegam sem recarregar a página (`NavegacaoSemRecarregar`),
 * a tabela não remonta ao trocar de filtro, de busca ou de página: um
 * `useState(new Set())` comum guardava as linhas marcadas no recorte de antes,
 * e "Inativar 5 empresas" ou "Excluir" agia também nas que já não apareciam.
 * Aqui, quando as linhas mudam, sai da seleção o que não está mais nelas.
 */
export function useSelecaoDasLinhas(ids: readonly string[]) {
  const [selecionadas, setSelecionadas] = useState<Set<string>>(() => new Set());
  const chave = ids.join("\n");
  const [chaveVista, setChaveVista] = useState(chave);
  // Ajuste no próprio render, e não num efeito: a tabela nunca desenha (nem
  // age) com a seleção do recorte anterior.
  if (chave !== chaveVista) {
    setChaveVista(chave);
    setSelecionadas((antes) => podarSelecao(antes, ids));
  }
  return [selecionadas, setSelecionadas] as const;
}

/** Fica só o que ainda está nas linhas; sem mudança, devolve o mesmo Set. */
export function podarSelecao(selecionadas: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  const visiveis = new Set(ids);
  const ficam = [...selecionadas].filter((id) => visiveis.has(id));
  return ficam.length === selecionadas.size ? (selecionadas as Set<string>) : new Set(ficam);
}
