// Corpus de extratos reais (Fase 4, 10/11/2026): compara a leitura do porte com a do original.
//
// O `corpus_extratos.py` grava o que o Contábil Core original lê de cada PDF; este script lê os
// mesmos arquivos com `abrirPdf` + `lerExtratoPdf` e compara transação a transação (fitid, data,
// valor, histórico, tipo, saldo e ordem), ou a frase da recusa. Os PDFs são de clientes e ficam fora
// do git; a saída só diz quantas linhas bateram e mostra a primeira diferença de cada arquivo.
//
// Uso:
//   npx tsx --require ./scripts/contabil-core/sem-server-only.cjs scripts/contabil-core/corpus-extratos.ts <saida-do-python.json> <arquivo.pdf>...
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { texto as textoDec } from "../../src/lib/contabil-core/motor/decimal";
import { ErroDeLeitura } from "../../src/lib/contabil-core/extrato/leitura";
import { abrirPdf, lerExtratoPdf } from "../../src/lib/contabil-core/extrato/pdf";

type LinhaPy = { fitid: string; data: string; valor: string; historico: string; tipo: string; saldo: string | null; ordem: number | null };
type Esperado = { transacoes?: LinhaPy[]; erro?: string };

const [saidaPy, ...pdfs] = process.argv.slice(2);
const esperado = JSON.parse(readFileSync(saidaPy, "utf8")) as Record<string, Esperado>;

(async () => {
  let iguais = 0;
  for (const pdf of pdfs) {
    const nome = basename(pdf);
    const py = esperado[nome];
    if (!py) {
      console.log(`${nome}: sem resultado do Python`);
      continue;
    }
    let obtido: Esperado;
    const t0 = Date.now();
    try {
      const aberto = await abrirPdf(new Uint8Array(readFileSync(pdf)));
      const { transacoes, leitor } = lerExtratoPdf(aberto, null);
      obtido = {
        transacoes: transacoes.map((t) => ({
          fitid: t.fitid, data: t.data, valor: textoDec(t.valor), historico: t.historico, tipo: t.tipoOfx,
          saldo: t.saldoApos ? textoDec(t.saldoApos) : null, ordem: t.ordem,
        })),
      };
      process.stdout.write(`[${leitor}] `);
    } catch (e) {
      if (!(e instanceof ErroDeLeitura)) throw e;
      obtido = { erro: e.message };
    }
    const ms = Date.now() - t0;
    if (py.erro !== undefined || obtido.erro !== undefined) {
      const ok = py.erro === obtido.erro;
      if (ok) iguais++;
      console.log(`${nome}: ${ok ? "mesma recusa" : "DIFERENTE"} (${ms} ms)`);
      if (!ok) console.log(`  py: ${py.erro ?? `${py.transacoes?.length} transações`}\n  ts: ${obtido.erro ?? `${obtido.transacoes?.length} transações`}`);
      continue;
    }
    const a = py.transacoes!;
    const b = obtido.transacoes!;
    let batem = 0;
    let primeira = -1;
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (JSON.stringify(a[i]) === JSON.stringify(b[i])) batem++;
      else if (primeira < 0) primeira = i;
    }
    const ok = batem === a.length && a.length === b.length;
    if (ok) iguais++;
    console.log(`${nome}: ${batem}/${a.length} transações iguais${b.length !== a.length ? ` (ts leu ${b.length})` : ""} (${ms} ms)`);
    if (primeira >= 0) console.log(`  #${primeira}\n  py: ${JSON.stringify(a[primeira])}\n  ts: ${JSON.stringify(b[primeira])}`);
  }
  console.log(`\n${iguais}/${pdfs.length} arquivos idênticos ao original.`);
})();
