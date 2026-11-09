// Porte de `src/domain/extrato/conferencia.py` do Contábil Core: a conferência de completude pelo
// saldo que o arquivo declara.
//
// A cadeia de saldos prova que os valores PRESENTES são consistentes entre si, e só isso. O saldo de
// fechamento é uma segunda fonte, um número que o banco AFIRMA. Encadeado entre arquivos da mesma
// conta, ele responde se o conjunto está completo:
//
//     fechamento do arquivo anterior + movimento deste arquivo = fechamento deste
//
// É aviso, e não recusa: o caso legítimo mais comum é período faltando (subiu fevereiro e depois
// abril). Por isso a frase nomeia a data da âncora, e o buraco aparece em vez de virar um número.

import { modulo, ehZero, soma, subtrai, type Dec } from "./decimal";
import { reais } from "./valorConfiavel";
import { corta } from "@/lib/revisao-contabil/motor/py";

/** "AAAA-MM-DD" → "DD/MM/AAAA" */
function dia(data: string | null): string | null {
  if (!data) return null;
  const [a, m, d] = data.split("-");
  return `${d}/${m}/${a}`;
}

/**
 * A frase de alerta quando o fechamento não confere, ou `null`. Também é `null` quando falta uma das
 * pontas (arquivo sem `LEDGERBAL`, primeiro arquivo da conta): aí o silêncio quer dizer "não
 * verificado", e não "verificado e ok".
 */
export function conferirFechamento(p: {
  saldoAnterior: Dec | null;
  dataAnterior: string | null;
  movimento: Dec;
  saldoDeclarado: Dec | null;
  dataDeclarada: string | null;
}): string | null {
  if (p.saldoDeclarado === null || p.saldoAnterior === null) return null;

  const esperado = soma(p.saldoAnterior, p.movimento);
  const diferenca = subtrai(p.saldoDeclarado, esperado);
  if (ehZero(diferenca)) return null;

  const quandoAnterior = dia(p.dataAnterior);
  const quandoDeclarada = dia(p.dataDeclarada);

  let frase =
    `O saldo de fechamento declarado no arquivo (${reais(p.saldoDeclarado)}) ` +
    `não confere: partindo do fechamento anterior desta conta` +
    `${quandoAnterior ? ` em ${quandoAnterior}` : ""} ` +
    `(${reais(p.saldoAnterior)}) mais ${reais(p.movimento)} movimentados neste ` +
    `arquivo, o esperado era ${reais(esperado)} — diferença de ` +
    `${reais(modulo(diferenca))}.`;
  if (quandoAnterior && quandoDeclarada) {
    frase += ` Confira se falta importar algum período entre ${quandoAnterior} e ${quandoDeclarada}.`;
  } else {
    frase += " Confira se falta importar algum período entre os dois arquivos.";
  }
  return corta(frase, 500);
}
