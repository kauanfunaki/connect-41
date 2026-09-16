// Centro de custo: cadastro, herança na criação do lançamento e casamento na
// importação por CSV. Funções puras, sem banco.
//
// ─── A regra do Kauan (16/09) ───────────────────────────────────────────────
//
// **Um centro por lançamento, sem rateio**, em despesa e em receita, e sempre
// opcional. Na criação vale o centro informado; sem ele, o padrão da
// contraparte — desde que seja da mesma empresa e esteja ativo. Parcela de
// acordo herda o centro comum dos títulos originais, ou nenhum se divergirem:
// escolher "o do maior" (como a categoria das parcelas faz) daria a um centro
// dinheiro que veio de outro, e rateio está fora desta fatia.
//
// Diferente da categoria padrão, o centro padrão **não** é gravado pelo
// primeiro lançamento: categoria é classificação contábil e raramente muda para
// o mesmo fornecedor; centro é decisão de gestão, e um fornecedor que atende
// duas unidades ficaria preso à primeira sem ninguém ter decidido isso.

import { chaveDaCategoria } from "@/lib/dre/calculo";

export const TAMANHO_MAXIMO_DO_NOME_DO_CENTRO = 120;
export const TAMANHO_MAXIMO_DO_CODIGO_DO_CENTRO = 30;

export type CentroValidado = { nome: string; codigo: string | null };

/**
 * Nome e código de um centro, validados.
 *
 * O código aceita só letra, dígito, ponto, hífen e sublinhado: é o que se
 * digita numa coluna de planilha, e espaço ou acento nele viraria dois códigos
 * "iguais" que não casam.
 */
export function validarCentroDeCusto(campos: {
  nome: string | null | undefined;
  codigo: string | null | undefined;
}): { ok: true; dados: CentroValidado } | { ok: false; erro: string } {
  const nome = (campos.nome ?? "").trim().replace(/\s+/g, " ");
  if (!nome) return { ok: false, erro: "Informe o nome do centro de custo." };
  if (nome.length > TAMANHO_MAXIMO_DO_NOME_DO_CENTRO) {
    return { ok: false, erro: `Nome com mais de ${TAMANHO_MAXIMO_DO_NOME_DO_CENTRO} caracteres.` };
  }
  const codigo = (campos.codigo ?? "").trim();
  if (codigo.length > TAMANHO_MAXIMO_DO_CODIGO_DO_CENTRO) {
    return { ok: false, erro: `Código com mais de ${TAMANHO_MAXIMO_DO_CODIGO_DO_CENTRO} caracteres.` };
  }
  if (codigo && !/^[A-Za-z0-9._-]+$/.test(codigo)) {
    return { ok: false, erro: "O código aceita só letras sem acento, números, ponto, hífen e sublinhado." };
  }
  return { ok: true, dados: { nome, codigo: codigo === "" ? null : codigo } };
}

export type CentroConhecido = { id: string; companyId: string; active: boolean };

/**
 * O centro com que um lançamento nasce.
 *
 * - **informado** tem de existir, ser da empresa do lançamento e estar ativo —
 *   senão é recusa, e não "sem centro": a pessoa quis classificar;
 * - **sem informado**, o padrão da contraparte, quando é da mesma empresa e
 *   está ativo. Padrão inválido é ignorado em silêncio: o lançamento não é
 *   culpa de quem lança, e a ficha é corrigida no cadastro.
 */
export function centroDoLancamento(p: {
  companyId: string;
  informadoId: string | null;
  padraoDaContraparteId: string | null;
  centros: Map<string, CentroConhecido>;
}): { ok: true; centroId: string | null } | { ok: false; erro: string } {
  if (p.informadoId) {
    const c = p.centros.get(p.informadoId);
    if (!c || c.companyId !== p.companyId) return { ok: false, erro: "Centro de custo não encontrado nesta empresa." };
    if (!c.active) return { ok: false, erro: "Centro de custo inativo — escolha outro ou reative no cadastro." };
    return { ok: true, centroId: c.id };
  }
  if (p.padraoDaContraparteId) {
    const c = p.centros.get(p.padraoDaContraparteId);
    if (c && c.companyId === p.companyId && c.active) return { ok: true, centroId: c.id };
  }
  return { ok: true, centroId: null };
}

/** O centro que todos compartilham, ou `null` se algum diverge ou não tem centro. */
export function centroComum(ids: (string | null)[]): string | null {
  if (ids.length === 0) return null;
  const primeiro = ids[0] ?? null;
  return ids.every((i) => (i ?? null) === primeiro) ? primeiro : null;
}

export type CentroParaCasar = { id: string; nome: string; codigo: string | null };

/**
 * O centro escrito numa linha de CSV, por código ou por nome.
 *
 * Normaliza como a categoria (acento, caixa, espaço). Vazio é "sem centro" —
 * a herança da contraparte vem depois, na gravação. Escrito e não encontrado é
 * erro da linha, pelo mesmo motivo da categoria: a pessoa quis classificar.
 * Um texto que é código de um centro e nome de outro é recusado como ambíguo
 * em vez de escolher um dos dois.
 */
export function casarCentroDeCusto(
  texto: string,
  centros: CentroParaCasar[]
): { ok: true; centroId: string | null } | { ok: false; erro: string } {
  const t = texto.trim();
  if (!t) return { ok: true, centroId: null };
  const chave = chaveDaCategoria(t);
  const encontrados = new Set(
    centros
      .filter((c) => chaveDaCategoria(c.nome) === chave || (c.codigo !== null && chaveDaCategoria(c.codigo) === chave))
      .map((c) => c.id)
  );
  if (encontrados.size === 0) return { ok: false, erro: `Centro de custo "${t}" não existe (ou está inativo) nesta empresa.` };
  if (encontrados.size > 1) return { ok: false, erro: `Centro de custo "${t}" é ambíguo — é nome de um e código de outro.` };
  return { ok: true, centroId: [...encontrados][0]! };
}

/** Id do formulário de `/pagar` e `/receber` a que as caixas de cada linha se associam. */
export const FORM_DO_CENTRO = "definir-centro-das-contas";

/** Teto de contas por vez na ação de definir centro — é tela de trabalho, não migração. */
export const MAXIMO_DE_CONTAS_POR_DEFINICAO = 200;

/**
 * Pode definir (ou tirar) o centro destas contas?
 *
 * Tirar vale para qualquer conta. Definir exige centro ativo e **todas as
 * contas da empresa do centro**: a seleção em `/pagar` mistura empresas, e o
 * centro de uma não tem significado na outra. O status da conta não importa —
 * paga, renegociada ou perdida continuam na DRE, e o centro é classificação
 * de gestão, não baixa.
 */
export function podeDefinirCentro(
  contas: { id: string; companyId: string }[],
  centro: { companyId: string; active: boolean; nome: string } | null,
  pedidas: number
): { pode: true } | { pode: false; motivo: string } {
  if (pedidas === 0) return { pode: false, motivo: "Selecione ao menos uma conta." };
  if (pedidas > MAXIMO_DE_CONTAS_POR_DEFINICAO) {
    return { pode: false, motivo: `Selecione no máximo ${MAXIMO_DE_CONTAS_POR_DEFINICAO} contas por vez.` };
  }
  if (contas.length !== pedidas) return { pode: false, motivo: "Alguma conta selecionada não existe mais — atualize a tela." };
  if (!centro) return { pode: true };
  if (!centro.active) return { pode: false, motivo: `O centro "${centro.nome}" está inativo.` };
  const deOutra = contas.filter((c) => c.companyId !== centro.companyId).length;
  if (deOutra > 0) {
    return {
      pode: false,
      motivo: `${deOutra} ${deOutra === 1 ? "conta selecionada é" : "contas selecionadas são"} de outra empresa — o centro "${centro.nome}" é só da empresa dele.`,
    };
  }
  return { pode: true };
}

// ─── Filtro da DRE por centro ───────────────────────────────────────────────

export type FiltroDeCentro = { tipo: "todos" } | { tipo: "sem" } | { tipo: "centro"; id: string };

/** Valor de URL de "Sem centro de custo". */
export const SEM_CENTRO = "sem";

/**
 * Lê o filtro da URL. Id que não é centro desta empresa volta para "todos" —
 * um link velho não pode mostrar uma DRE vazia como se fosse o resultado.
 */
export function lerFiltroDeCentro(valor: string | null | undefined, idsDaEmpresa: Set<string>): FiltroDeCentro {
  const v = (valor ?? "").trim();
  if (v === SEM_CENTRO) return { tipo: "sem" };
  if (v && idsDaEmpresa.has(v)) return { tipo: "centro", id: v };
  return { tipo: "todos" };
}

/** O lançamento (ou ajuste) com este centro entra no filtro? */
export function passaNoFiltroDeCentro(centroId: string | null | undefined, filtro: FiltroDeCentro): boolean {
  if (filtro.tipo === "todos") return true;
  if (filtro.tipo === "sem") return (centroId ?? null) === null;
  return centroId === filtro.id;
}

/** Valor do filtro para a URL; vazio em "todos". */
export function valorDoFiltroDeCentro(filtro: FiltroDeCentro): string {
  return filtro.tipo === "todos" ? "" : filtro.tipo === "sem" ? SEM_CENTRO : filtro.id;
}
