// Remessa CNAB 240 de pagamento de salários (12/11/2026, fase 2 do DP 2).
//
// Layout Febraban 240 posições, "Pagamento" (serviço 30 = salários):
//   0 header de arquivo · 1 header de lote · 3 segmento A (o pagamento) e
//   segmento B (o CPF de quem recebe) · 5 trailer de lote · 9 trailer de arquivo.
// Um lote por forma de lançamento: 01 = crédito em conta corrente no mesmo
// banco da empresa; 05 = poupança no mesmo banco; 41 = TED para outro banco.
//
// Campo alfanumérico: maiúsculo, sem acento, à esquerda, completado com
// espaço. Numérico: à direita, completado com zero. Linhas com CRLF.
//
// ⚠️ Cada banco pede homologação do arquivo e tem detalhes próprios (convênio,
// dígito da agência, finalidade da TED). Este é o padrão Febraban; o primeiro
// arquivo de cada banco deve ir para teste no banco antes de valer.
//
// Puro, sem banco de dados.

export type ContaBancaria = { banco: string; agencia: string; agenciaDigito: string; conta: string; contaDigito: string };

export type EmpresaPagadora = ContaBancaria & {
  /** CNPJ (14) ou CPF (11), só dígitos. */
  documento: string;
  nome: string;
  convenio: string;
  nomeDoBanco: string;
};

export type PagamentoDaRemessa = ContaBancaria & {
  nome: string;
  /** CPF, só dígitos. */
  cpf: string;
  tipoConta: "CORRENTE" | "POUPANCA";
  valor: number;
  /** O número que a empresa dá ao pagamento (volta no retorno). */
  seuNumero: string;
};

export type EntradaDaRemessa = {
  empresa: EmpresaPagadora;
  pagamentos: PagamentoDaRemessa[];
  /** "AAAA-MM-DD". */
  dataPagamento: string;
  sequencial: number;
  geradoEm: Date;
};

export type FormaDeLancamento = "01" | "05" | "41";

export const NOME_DA_FORMA: Record<FormaDeLancamento, string> = {
  "01": "Crédito em conta corrente",
  "05": "Crédito em poupança",
  "41": "TED para outro banco",
};

/** Os bancos mais comuns, para o nome no header e na tela. */
export const BANCOS: Record<string, string> = {
  "001": "BANCO DO BRASIL",
  "033": "SANTANDER",
  "041": "BANRISUL",
  "077": "BANCO INTER",
  "104": "CAIXA ECONOMICA FEDERAL",
  "208": "BTG PACTUAL",
  "237": "BRADESCO",
  "260": "NU PAGAMENTOS",
  "290": "PAGSEGURO",
  "336": "C6 BANK",
  "341": "ITAU UNIBANCO",
  "422": "SAFRA",
  "748": "SICREDI",
  "756": "SICOOB",
};

const LINHA = 240;

export function alfa(v: string, tamanho: number): string {
  const limpo = (v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 .,/\-&]/g, " ");
  return limpo.slice(0, tamanho).padEnd(tamanho, " ");
}

export function num(v: string | number, tamanho: number): string {
  const s = String(v).replace(/\D/g, "");
  return s.slice(-tamanho).padStart(tamanho, "0");
}

/** Reais em centavos, sem vírgula, zeros à esquerda. */
export function valor(v: number, tamanho: number): string {
  return num(Math.round(v * 100), tamanho);
}

const branco = (n: number) => " ".repeat(n);
const zeros = (n: number) => "0".repeat(n);

function dataDdMmAaaa(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}${m}${a}`;
}

function conferir(linha: string, onde: string): string {
  if (linha.length !== LINHA) throw new Error(`CNAB 240: ${onde} saiu com ${linha.length} posições.`);
  return linha;
}

export function formaDoPagamento(p: Pick<PagamentoDaRemessa, "banco" | "tipoConta">, bancoDaEmpresa: string): FormaDeLancamento {
  if (num(p.banco, 3) !== num(bancoDaEmpresa, 3)) return "41";
  return p.tipoConta === "POUPANCA" ? "05" : "01";
}

/** O que impede o pagamento de entrar na remessa, ou `null`. */
export function problemaDoPagamento(p: PagamentoDaRemessa): string | null {
  if (!(p.valor > 0)) return "líquido zero ou negativo";
  if (p.cpf.replace(/\D/g, "").length !== 11) return "sem CPF";
  if (!/^\d{1,3}$/.test(p.banco.trim()) || !p.agencia.trim() || !p.conta.trim()) return "sem banco, agência ou conta";
  return null;
}

function contaDaEmpresa(e: EmpresaPagadora): string {
  // 53-57 agência, 58 dígito, 59-70 conta, 71 dígito, 72 dígito agência/conta.
  return num(e.agencia, 5) + alfa(e.agenciaDigito, 1) + num(e.conta, 12) + alfa(e.contaDigito, 1) + branco(1);
}

function inscricao(documento: string): string {
  const d = documento.replace(/\D/g, "");
  return (d.length === 11 ? "1" : "2") + num(d, 14);
}

export type ResultadoDaRemessa = { conteudo: string; quantidade: number; total: number; lotes: { forma: FormaDeLancamento; quantidade: number; total: number }[] };

export function gerarRemessa(e: EntradaDaRemessa): ResultadoDaRemessa {
  const banco = num(e.empresa.banco, 3);
  const linhas: string[] = [];
  const hora = e.geradoEm.toISOString();
  const dataGeracao = dataDdMmAaaa(hora.slice(0, 10));
  const horaGeracao = hora.slice(11, 19).replace(/:/g, "");

  // ── Header de arquivo ──
  linhas.push(
    conferir(
      banco +
        "0000" +
        "0" +
        branco(9) +
        inscricao(e.empresa.documento) +
        alfa(e.empresa.convenio, 20) +
        contaDaEmpresa(e.empresa) +
        alfa(e.empresa.nome, 30) +
        alfa(e.empresa.nomeDoBanco || BANCOS[banco] || "", 30) +
        branco(10) +
        "1" +
        dataGeracao +
        horaGeracao +
        num(e.sequencial, 6) +
        "089" +
        "01600" +
        branco(20) +
        branco(20) +
        branco(29),
      "o header de arquivo"
    )
  );

  const porForma = new Map<FormaDeLancamento, PagamentoDaRemessa[]>();
  for (const p of e.pagamentos) {
    const f = formaDoPagamento(p, banco);
    porForma.set(f, [...(porForma.get(f) ?? []), p]);
  }
  const ordem: FormaDeLancamento[] = ["01", "05", "41"];
  const lotes: ResultadoDaRemessa["lotes"] = [];
  let numeroDoLote = 0;
  let total = 0;
  for (const forma of ordem) {
    const doLote = porForma.get(forma);
    if (!doLote?.length) continue;
    numeroDoLote++;
    const lote = num(numeroDoLote, 4);
    // ── Header de lote ──
    linhas.push(
      conferir(
        banco +
          lote +
          "1" +
          "C" +
          "30" +
          forma +
          "045" +
          branco(1) +
          inscricao(e.empresa.documento) +
          alfa(e.empresa.convenio, 20) +
          contaDaEmpresa(e.empresa) +
          alfa(e.empresa.nome, 30) +
          branco(40) +
          branco(30) +
          zeros(5) +
          branco(15) +
          branco(20) +
          zeros(5) +
          branco(3) +
          branco(2) +
          branco(2) +
          branco(6) +
          branco(10),
        "o header de lote"
      )
    );
    let seq = 0;
    let somaDoLote = 0;
    for (const p of doLote) {
      const camara = forma === "41" ? "018" : "000";
      linhas.push(
        conferir(
          banco +
            lote +
            "3" +
            num(++seq, 5) +
            "A" +
            "0" +
            "00" +
            camara +
            num(p.banco, 3) +
            num(p.agencia, 5) +
            alfa(p.agenciaDigito, 1) +
            num(p.conta, 12) +
            alfa(p.contaDigito, 1) +
            branco(1) +
            alfa(p.nome, 30) +
            alfa(p.seuNumero, 20) +
            dataDdMmAaaa(e.dataPagamento) +
            "BRL" +
            zeros(15) +
            valor(p.valor, 15) +
            branco(20) +
            zeros(8) +
            zeros(15) +
            branco(40) +
            branco(2) +
            branco(5) +
            branco(2) +
            branco(3) +
            "0" +
            branco(10),
          `o segmento A de ${p.nome}`
        )
      );
      linhas.push(
        conferir(
          banco +
            lote +
            "3" +
            num(++seq, 5) +
            "B" +
            branco(3) +
            "1" +
            num(p.cpf, 14) +
            branco(30) +
            zeros(5) +
            branco(15) +
            branco(15) +
            branco(20) +
            zeros(5) +
            branco(3) +
            branco(2) +
            dataDdMmAaaa(e.dataPagamento) +
            valor(p.valor, 15) +
            zeros(15) +
            zeros(15) +
            zeros(15) +
            zeros(15) +
            branco(15) +
            "0" +
            branco(6) +
            branco(8),
          `o segmento B de ${p.nome}`
        )
      );
      somaDoLote += Math.round(p.valor * 100);
    }
    // ── Trailer de lote: header + detalhes + trailer ──
    linhas.push(
      conferir(banco + lote + "5" + branco(9) + num(seq + 2, 6) + num(somaDoLote, 18) + zeros(18) + zeros(6) + branco(165) + branco(10), "o trailer de lote")
    );
    lotes.push({ forma, quantidade: doLote.length, total: somaDoLote / 100 });
    total += somaDoLote;
  }

  // ── Trailer de arquivo ──
  linhas.push(conferir(banco + "9999" + "9" + branco(9) + num(numeroDoLote, 6) + num(linhas.length + 1, 6) + zeros(6) + branco(205), "o trailer de arquivo"));

  return { conteudo: linhas.join("\r\n") + "\r\n", quantidade: e.pagamentos.length, total: total / 100, lotes };
}
