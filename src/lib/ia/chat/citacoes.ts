// Pessoas e empresas citadas na resposta do chat, com foto (02/10/2026).
//
// A IA escreve `@[Nome](usuario:id)`, `@[Nome](pessoa:id)` ou
// `@[Nome](empresa:id)`, e a tela troca por um cartão com a foto. **Só vale id
// que apareceu no resultado de alguma ferramenta naquela execução** — id
// inventado pelo modelo (ou plantado num texto que ele leu) vira só o nome. É o
// que impede a IA de "citar" alguém que a pessoa não enxerga.

export type TipoCitado = "usuario" | "pessoa" | "empresa";
export type Citado = { tipo: TipoCitado; nome: string; foto: string | null; href: string | null };

/** `@[Nome](tipo:uuid)`. O nome não tem colchete; o id é o uuid do Prisma. */
export const CITACAO = /@\[([^\]\n]{1,80})\]\((usuario|pessoa|empresa):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Os ids que aparecem num resultado de ferramenta (o JSON que foi ao modelo). */
export function idsNoTexto(conteudo: string): string[] {
  return (conteudo.match(UUID) ?? []).map((id) => id.toLowerCase());
}

/** Troca por só o nome toda citação cujo id a execução não viu. */
export function filtrarCitacoes(texto: string, vistos: ReadonlySet<string>): string {
  return texto.replace(CITACAO, (inteira, nome: string, _tipo: string, id: string) => (vistos.has(id.toLowerCase()) ? inteira : nome));
}

/** As citações de um texto, sem repetir. */
export function citacoesDoTexto(texto: string): { tipo: TipoCitado; id: string; nome: string }[] {
  const vistas = new Set<string>();
  const r: { tipo: TipoCitado; id: string; nome: string }[] = [];
  for (const m of texto.matchAll(CITACAO)) {
    const tipo = m[2].toLowerCase() as TipoCitado;
    const id = m[3].toLowerCase();
    const chave = `${tipo}:${id}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    r.push({ tipo, id, nome: m[1] });
  }
  return r;
}

/** Pedaços do texto: texto puro e citações, na ordem — o que a tela desenha. */
export function partesComCitacoes(linha: string): ({ texto: string } | { tipo: TipoCitado; id: string; nome: string })[] {
  const partes: ({ texto: string } | { tipo: TipoCitado; id: string; nome: string })[] = [];
  let ultimo = 0;
  for (const m of linha.matchAll(CITACAO)) {
    const i = m.index ?? 0;
    if (i > ultimo) partes.push({ texto: linha.slice(ultimo, i) });
    partes.push({ tipo: m[2].toLowerCase() as TipoCitado, id: m[3].toLowerCase(), nome: m[1] });
    ultimo = i + m[0].length;
  }
  if (ultimo < linha.length) partes.push({ texto: linha.slice(ultimo) });
  return partes;
}

// ─── Quem a ferramenta "atividade da equipe" alcança ─────────────────────────

/**
 * Os setores da equipe que esta conversa pode ver: o do agente ∩ o recorte da
 * Gestão da pessoa, e só com o painel da Gestão ligado. Vazio = a ferramenta
 * responde que não há acesso (funcionário comum, setor de fora, módulo
 * desligado). Calculado no servidor e levado no `escopo` — o modelo não muda.
 */
export function setoresDaEquipe(recorte: "todos" | string[] | null, setorDoAgente: string | null, gestaoLigada: boolean): string[] {
  if (!gestaoLigada || !recorte || !setorDoAgente) return [];
  return recorte === "todos" || recorte.includes(setorDoAgente) ? [setorDoAgente] : [];
}
