// A forma de uma resposta do Omie, para a prévia (Fase 1a da integração).
//
// Antes de gravar nota do Omie no acervo, é preciso ver o que a API devolve de
// verdade — nome da lista, dos campos, formato de data e de valor. A
// documentação cobre o essencial, mas o primeiro adaptador escrito só por ela
// é o que quebra em silêncio. Esta função resume uma resposta em "caminho →
// tipo e exemplo", com os textos cortados, para a tela de diagnóstico.

export type LinhaDaEstrutura = { caminho: string; tipo: string; exemplo: string };

const MAX_LINHAS = 200;

export function estruturaDe(valor: unknown, caminho = "", saida: LinhaDaEstrutura[] = []): LinhaDaEstrutura[] {
  if (saida.length >= MAX_LINHAS) return saida;
  if (Array.isArray(valor)) {
    saida.push({ caminho: caminho || "(raiz)", tipo: `lista[${valor.length}]`, exemplo: "" });
    // O primeiro item basta para ver a forma; os outros repetiriam.
    if (valor.length > 0) estruturaDe(valor[0], `${caminho}[0]`, saida);
    return saida;
  }
  if (valor !== null && typeof valor === "object") {
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      estruturaDe(v, caminho ? `${caminho}.${k}` : k, saida);
      if (saida.length >= MAX_LINHAS) break;
    }
    return saida;
  }
  const tipo = valor === null ? "null" : typeof valor;
  const texto = valor === null || valor === undefined ? "" : String(valor);
  saida.push({ caminho, tipo, exemplo: texto.length > 60 ? `${texto.slice(0, 57)}…` : texto });
  return saida;
}

// ─── Sem dados do cliente (prévia da emissão, 13/10/2026) ────────────────────
//
// A prévia da Fase 2 roda no terminal, com as chaves de uma empresa de verdade,
// e lista clientes, serviços e ordens de serviço — nome, CNPJ, e-mail, valor.
// O que interessa é a FORMA: o nome do campo, o tipo, o formato da data. Então
// o exemplo sai mascarado (letra vira "x", dígito vira "9"), e só ficam
// abertos os campos de controle — paginação e as bandeiras de situação, que
// são o que o código precisa reconhecer ("S"/"N", "004", "P"/"H").

const CAMPOS_ABERTOS = new Set([
  "pagina",
  "total_de_paginas",
  "registros",
  "total_de_registros",
  "nPagina",
  "nTotPaginas",
  "nRegistros",
  "nTotRegistros",
  "cEtapa",
  "cFaturada",
  "cCancelada",
  "cAmbiente",
  "cStatusRps",
  "cStatusLote",
  "cSituacao",
  "cCodStatus",
  "inativo",
  "cImpAPI",
  "cOrigem",
  "cRetemISS",
  "cRetISS",
  "cAnexo",
]);

/** Letra vira "x", dígito vira "9": "12.345.678/0001-90" → "99.999.999/9999-99". */
export function mascarar(texto: string): string {
  return texto.replace(/\p{L}/gu, "x").replace(/\d/g, "9");
}

/** A estrutura com os exemplos mascarados, menos os campos de controle. */
export function estruturaSemDados(valor: unknown): LinhaDaEstrutura[] {
  return estruturaDe(valor).map((l) => {
    const campo = (l.caminho.split(".").pop() ?? "").replace(/\[\d+\]$/, "");
    if (CAMPOS_ABERTOS.has(campo) || l.tipo === "boolean" || l.tipo === "null" || l.tipo.startsWith("lista")) return l;
    return { ...l, exemplo: mascarar(l.exemplo) };
  });
}
