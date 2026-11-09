// Porte de `src/domain/neo/documento_no_historico.py` do Contábil Core: o CPF/CNPJ que o banco
// imprime na própria linha do extrato.
//
// Por que existe: sem nota nem comprovante, a classificação por contraparte não tinha documento, e o
// nome não casava porque o banco trunca ("PERFORMANCE ENGENHA", "041 CON"). Documento não trunca.
//
// O que conta como documento:
// - só corrida MÁXIMA de exatamente 11 (CPF) ou 14 (CNPJ) dígitos: um pedaço de um número maior não é
//   documento, e é isso que separa o CNPJ do resto do lixo numérico da linha;
// - na forma pontuada, todo separador é opcional, mas pelo menos UM tem de ser ponto, barra ou traço.
//   Espaço aparece entre dois números quaisquer; ponto, barra e traço aparecem porque alguém formatou
//   um documento. Os bancos imprimem `09.033.833/0001-23`, `81.450.538 0001-08` (Sicoob),
//   `41.250.201-0001-24`, `41250201 0001-24` e `09.033.8330001-23`.
//
// CPF mascarado em PIX (`***.674.379-**`) nunca casa, e tudo bem: os dígitos não existem.
// Este módulo não decide nada. Devolve os candidatos, e quem chama confronta com o cadastro.

import { rePy } from "./unicodePy";

const SEM_PONTUACAO = rePy(String.raw`(?<!\d)(\d{11}|\d{14})(?!\d)`);
const CNPJ_PONTUADO = rePy(String.raw`(?<!\d)\d{2}\.?\d{3}\.?\d{3}[./\s-]?\d{4}[-./\s]?\d{2}(?!\d)`);
const CPF_PONTUADO = rePy(String.raw`(?<!\d)\d{3}\.?\d{3}\.?\d{3}[-./\s]?\d{2}(?!\d)`);
const SEPARADOR_FORTE = /[./-]/;
const NAO_DIGITO = /\P{Nd}/gu;

/** CPFs e CNPJs da linha, só dígitos, na ordem de leitura e sem repetir. */
export function documentosNoHistorico(historico: string | null | undefined): string[] {
  if (!historico) return [];
  const encontrados: string[] = [];
  for (const padrao of [CNPJ_PONTUADO, CPF_PONTUADO, SEM_PONTUACAO]) {
    const exigeSeparador = padrao !== SEM_PONTUACAO;
    padrao.lastIndex = 0;
    for (let m = padrao.exec(historico); m; m = padrao.exec(historico)) {
      const texto = m[0];
      // Só espaços entre os grupos: é fileira de números, não documento.
      if (exigeSeparador && !SEPARADOR_FORTE.test(texto)) continue;
      const digitos = texto.replace(NAO_DIGITO, "");
      if (!encontrados.includes(digitos)) encontrados.push(digitos);
    }
  }
  return encontrados;
}
