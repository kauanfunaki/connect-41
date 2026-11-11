// Os dados auxiliares de uma contraparte vindos da relação fiscal (Fase 3b, 10/11/2026): porte de
// `ContraparteDadosCadastrais` (`src/schemas/contrapartes.py` do Contábil Core).
//
// O conjunto é fechado de propósito: uma coluna nova no arquivo nunca altera em silêncio o que fica
// gravado. Como no pydantic do original, cada texto é aparado (vazio vira nulo), o tamanho é contado
// em caracteres e o primeiro erro segue a ordem dos campos e depois as chaves que sobram.

import { len, strip } from "../extrato/py";

/** Os campos, na ordem do schema, com o tamanho máximo de cada um. */
export const CAMPOS_CADASTRAIS = [
  ["codigo", 50],
  ["uf", 2],
  ["endereco", 300],
  ["complemento", 100],
  ["numero", 30],
  ["cep", 20],
  ["inscricao_estadual", 30],
  ["fax", 30],
  ["telefone", 30],
  ["ddd", 5],
  ["agropecuario", 30],
  ["contribuinte_icms", 30],
  ["tipo_inscricao", 30],
  ["bairro", 100],
  ["inscricao_municipal", 30],
  ["pais", 100],
  ["varejista_consumidor_final", 30],
  ["data_cadastro", 30],
  ["municipio", 100],
] as const;

export type CampoCadastral = (typeof CAMPOS_CADASTRAIS)[number][0];

/** Todos os campos presentes; o ausente é `null` (o `model_dump()` do original). */
export type DadosCadastrais = Record<CampoCadastral, string | null>;

export type ValidacaoDosDados = { ok: true; dados: DadosCadastrais } | { ok: false; campo: string; erro: string };

const CONHECIDOS = new Set<string>(CAMPOS_CADASTRAIS.map(([campo]) => campo));

/** A frase que a prévia mostra quando um campo cadastral é recusado. */
export const mensagemDoCampoInvalido = (campo: string) => `O campo cadastral '${campo}' possui valor inválido ou muito longo.`;

/** `ContraparteDadosCadastrais.model_validate(entrada)`: o primeiro erro, como o pydantic o daria. */
export function validarDadosCadastrais(entrada: Readonly<Record<string, unknown>>): ValidacaoDosDados {
  const dados = {} as DadosCadastrais;
  for (const [campo, maximo] of CAMPOS_CADASTRAIS) {
    const bruto = Object.hasOwn(entrada, campo) ? entrada[campo] : null;
    if (bruto === null || bruto === undefined) {
      dados[campo] = null;
      continue;
    }
    // Sem coerção: número ou booleano num campo de texto é recusado, como no modo padrão do pydantic.
    if (typeof bruto !== "string") return { ok: false, campo, erro: mensagemDoCampoInvalido(campo) };
    const limpo = strip(bruto);
    if (len(limpo) > maximo) return { ok: false, campo, erro: mensagemDoCampoInvalido(campo) };
    dados[campo] = limpo || null;
  }
  // `extra = "forbid"`: chave desconhecida é erro, depois dos campos e na ordem da entrada.
  for (const campo of Object.keys(entrada)) {
    if (!CONHECIDOS.has(campo)) return { ok: false, campo, erro: mensagemDoCampoInvalido(campo) };
  }
  return { ok: true, dados };
}

/** `model_dump(exclude_none=True)`: o que se grava em `dadosCadastrais` (nada, se ficar vazio). */
export function dadosSemNulos(dados: DadosCadastrais): Partial<Record<CampoCadastral, string>> | null {
  const out: Partial<Record<CampoCadastral, string>> = {};
  for (const [campo] of CAMPOS_CADASTRAIS) {
    const v = dados[campo];
    if (v !== null) out[campo] = v;
  }
  return Object.keys(out).length ? out : null;
}
