// Comunicados da 41 aos clientes (01/10): para quem vai, a validação e o que a
// tela mostra da leitura. Desde 14/10/2026 vão para empresas, e não mais para
// Clientes. Funções puras, sem nada do servidor — o formulário,
// que roda no navegador, também lê daqui. Quem pode mandar fica em `acesso.ts`.

/**
 * Para quem vai — desde 14/10/2026, empresas (era Cliente):
 * - TODOS: todas as empresas em operação do escritório;
 * - SETOR: as empresas em operação com serviço ativo no setor que comunica
 *   ("as empresas do DP");
 * - ESCOLHIDAS: as empresas marcadas na lista. Marcar uma matriz marca as
 *   filiais dela junto, e dá para desmarcar (`marcarComFiliais`).
 *
 * O comunicado fica gravado para as empresas escolhidas no envio; no portal,
 * quem tem acesso a alguma delas vê.
 *
 * O valor "ESCOLHIDOS" fica como está: é o que já vai no formulário e na
 * auditoria dos comunicados antigos.
 */
export type Publico = "TODOS" | "SETOR" | "ESCOLHIDOS";

export const PUBLICOS: { valor: Publico; rotulo: string; dica: string }[] = [
  { valor: "SETOR", rotulo: "Empresas do setor", dica: "As que têm serviço ativo com o setor que comunica." },
  { valor: "ESCOLHIDOS", rotulo: "Empresas escolhidas", dica: "Marque as empresas na lista." },
  { valor: "TODOS", rotulo: "Todas as empresas", dica: "Todas as empresas em operação do escritório." },
];

export const LIMITE_DO_TITULO = 160;
export const LIMITE_DO_TEXTO = 10_000;

export type CamposDoComunicado = { titulo: string; texto: string; publico: Publico; setor: string; empresas: string[] };

export function validarComunicado(bruto: {
  titulo: string;
  texto: string;
  publico: string;
  setor: string;
  empresas: string[];
}): { ok: true; dados: CamposDoComunicado } | { ok: false; erro: string } {
  const titulo = bruto.titulo.trim();
  if (!titulo) return { ok: false, erro: "Dê um título ao comunicado." };
  if (titulo.length > LIMITE_DO_TITULO) return { ok: false, erro: "Título com no máximo 160 caracteres." };
  const texto = bruto.texto.trim();
  if (texto.length < 10) return { ok: false, erro: "Escreva o comunicado." };
  if (texto.length > LIMITE_DO_TEXTO) return { ok: false, erro: "Texto com no máximo 10.000 caracteres." };
  if (!PUBLICOS.some((p) => p.valor === bruto.publico)) return { ok: false, erro: "Escolha para quem vai." };
  const publico = bruto.publico as Publico;
  const setor = bruto.setor.trim();
  if (!setor) return { ok: false, erro: "Escolha o setor que comunica." };
  const empresas = Array.from(new Set(bruto.empresas.map((g) => g.trim()).filter(Boolean)));
  if (publico === "ESCOLHIDOS" && empresas.length === 0) return { ok: false, erro: "Marque ao menos uma empresa." };
  return { ok: true, dados: { titulo, texto, publico, setor, empresas: publico === "ESCOLHIDOS" ? empresas : [] } };
}

/**
 * Marcar ou desmarcar uma empresa na lista do "Empresas escolhidas": a matriz
 * leva as filiais dela junto (a regra do portal — filiais entram por padrão),
 * e cada filial continua desmarcável sozinha.
 */
export function marcarComFiliais(
  marcadas: ReadonlySet<string>,
  empresa: string,
  empresas: readonly { id: string; matrizId: string | null }[]
): Set<string> {
  const nova = new Set(marcadas);
  const filiais = empresas.filter((e) => e.matrizId === empresa).map((e) => e.id);
  if (nova.has(empresa)) {
    nova.delete(empresa);
    for (const f of filiais) nova.delete(f);
  } else {
    nova.add(empresa);
    for (const f of filiais) nova.add(f);
  }
  return nova;
}

/** A leitura numa empresa que recebeu o comunicado: quem, com acesso a ela, já abriu. */
export type LeituraDaEmpresa = { empresaId: string; nome: string; leitores: { nome: string; em: Date }[] };

/** Quantas empresas já têm alguém que leu — é o número que importa para quem mandou. */
export function resumoDaLeitura(empresas: LeituraDaEmpresa[]): { empresas: number; leram: number } {
  return { empresas: empresas.length, leram: empresas.filter((g) => g.leitores.length > 0).length };
}

/**
 * Quantas empresas já leram: as que têm, entre as contas que as enxergam, ao
 * menos uma que abriu o comunicado. `contasPorEmpresa` é quem enxerga cada
 * empresa hoje (`lerContasDasEmpresas`).
 */
export function empresasQueLeram(
  empresas: readonly string[],
  contasPorEmpresa: ReadonlyMap<string, ReadonlySet<string>>,
  leitores: ReadonlySet<string>
): number {
  return empresas.filter((e) => [...(contasPorEmpresa.get(e) ?? [])].some((c) => leitores.has(c))).length;
}
