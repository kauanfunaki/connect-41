// Porte de `extrato/bancos/bradesco_colunas.py`: Bradesco Net Empresa lido por coordenada, com
// colunas, históricos multilinha e seções independentes ("Extrato" e "Últimos Lançamentos").

import { naoNegativo, type Dec } from "../../motor/decimal";
import { agruparLinhas, bloco, gerarFitid, parseData, parseValor, type Bloco, type Palavra, type Transacao } from "../comum";
import { ErroDeLeitura } from "../leitura";
import { casefold, len, re } from "../py";

const MOEDA = re("^-?\\d{1,3}(?:\\.\\d{3})*,\\d{2}$");
const DATA = re("^\\d{2}/\\d{2}/\\d{4}$");
const SALDOS_INVEST = re("^Saldos Invest", "i");
const ULTIMOS_LANCAMENTOS = re("^[ÚU]ltimos Lan[cç]amentos", "i");
const TOTAL = re("^Total\\b", "i");
const IGNORAR = re(
  "^(Os dados|Extrato de:|Ag[eê]ncia\\s*\\||\\d{5}\\s*\\||" + "Nome do usu|Data da opera|Folha\\s|Extrato Mensal)",
  "i",
);

function erro(mensagem: string): never {
  throw new ErroDeLeitura(mensagem);
}

type Colunas = { historico: number; documento: number; credito: number; saldo: number };

function colunasDaLinha(linha: readonly Palavra[]): Colunas | null {
  const nomes = new Set(linha.map((w) => casefold(w.text)));
  if (!["data", "dcto.", "saldo"].every((n) => nomes.has(n))) return null;

  const localizar = (...rotulos: string[]): number | null => {
    const w = linha.find((p) => rotulos.includes(casefold(p.text)));
    return w === undefined ? null : Number(w.x0) - 5;
  };

  const historico = localizar("lançamento", "lancamento");
  const documento = localizar("dcto.");
  const credito = localizar("crédito", "credito");
  const saldo = localizar("saldo");
  if (historico === null || documento === null || credito === null || saldo === null) return null;
  return { historico, documento, credito, saldo };
}

type Evento =
  | { tipo: "secao" }
  | { tipo: "saldo"; data: string | null; saldo: Dec | null }
  | { tipo: "total"; total: Dec | null }
  | { tipo: "texto"; texto: string }
  | { tipo: "movimento"; data: string | null; descricao: string; documento: string; valor: Dec | null; saldo: Dec | null };

function eventos(paginas: readonly (readonly Palavra[])[]): Evento[] {
  let colunas: Colunas | null = null;
  const lista: Evento[] = [];
  for (const pagina of paginas) {
    for (const linha of agruparLinhas(pagina)) {
      const texto = linha.map((w) => w.text).join(" ");
      const novas = colunasDaLinha(linha);
      if (novas) {
        colunas = novas;
        continue;
      }
      if (SALDOS_INVEST.match(texto)) return lista;
      if (ULTIMOS_LANCAMENTOS.match(texto)) {
        lista.push({ tipo: "secao" });
        continue;
      }
      if (!colunas) continue;
      const credito = colunas.credito;
      const valores = linha.filter((w) => MOEDA.fullmatch(w.text) && Number(w.x0) >= credito);
      const data = linha.find((w) => DATA.fullmatch(w.text))?.text ?? null;
      if (texto.toUpperCase().includes("SALDO ANTERIOR")) {
        if (valores.length !== 1) erro("Saldo anterior Bradesco não identificado.");
        lista.push({ tipo: "saldo", data, saldo: parseValor(valores[0].text) });
        continue;
      }
      if (TOTAL.match(texto)) {
        if (valores.length) lista.push({ tipo: "total", total: parseValor(valores[valores.length - 1].text) });
        continue;
      }
      if (IGNORAR.match(texto)) continue;
      const { historico, documento: xDocumento } = colunas;
      const descricao = linha
        .filter((w) => historico <= Number(w.x0) && Number(w.x0) < xDocumento)
        .map((w) => w.text)
        .join(" ");
      const documento = linha
        .filter((w) => xDocumento <= Number(w.x0) && Number(w.x0) < credito)
        .map((w) => w.text)
        .join(" ");
      if (valores.length === 2) {
        lista.push({
          tipo: "movimento",
          data,
          descricao,
          documento,
          valor: parseValor(valores[0].text),
          saldo: parseValor(valores[1].text),
        });
      } else if (descricao) {
        lista.push({ tipo: "texto", texto: descricao });
      } else if (valores.length) {
        erro("Linha monetária Bradesco não reconhecida; confira o documento.");
      }
    }
  }
  return lista;
}

/** A chave de um `Decimal` num dicionário do Python: valores iguais (1.0 e 1.00) são a mesma chave. */
function chaveDec(d: Dec): string {
  if (d.coeficiente === BigInt(0)) return "0";
  let c = d.coeficiente;
  let e = d.expoente;
  const dez = BigInt(10);
  while (c % dez === BigInt(0)) {
    c /= dez;
    e++;
  }
  return `${d.negativo ? "-" : ""}${c}e${e}`;
}

export function extrair(paginas: readonly (readonly Palavra[])[], referenciaAno: number): Bloco[] {
  const lidos = eventos(paginas);
  // Aprende os rótulos das linhas numéricas sem descrição deste documento: assim um rótulo antes da
  // quebra de página pode acompanhar seu movimento.
  const tipos = new Set<string>();
  lidos.forEach((e, i) => {
    const anterior = i ? lidos[i - 1] : null;
    if (anterior && e.tipo === "movimento" && !e.descricao && anterior.tipo === "texto") tipos.add(anterior.texto);
  });

  const blocos: Bloco[] = [];
  let atuais: Transacao[] = [];
  let pendentes: string[] = [];
  let documentos: string[] = [];
  let anterior: Dec | null = null;
  let final: Dec | null = null;
  let dataAtual: string | null = null;

  const completar = (textos: readonly string[]) => {
    if (textos.length) {
      if (!atuais.length) erro("Complemento Bradesco sem lançamento de origem.");
      const alvo = atuais[atuais.length - 1];
      atuais[atuais.length - 1] = { ...alvo, historico: [alvo.historico, ...textos].join(" ") };
    }
  };

  const fechar = () => {
    completar(pendentes);
    if (atuais.length) {
      const contagens = new Map<string, number>();
      const transacoes: Transacao[] = [];
      atuais.forEach((t, i) => {
        const documento = documentos[i];
        if (len(t.historico) > 500) erro("Histórico Bradesco excede 500 caracteres; nenhum texto foi truncado.");
        const chave = JSON.stringify([t.data, t.historico, chaveDec(t.valor), documento]);
        const ordem = contagens.get(chave) ?? 0;
        contagens.set(chave, ordem + 1);
        transacoes.push({ ...t, fitid: gerarFitid(t.data, t.historico + "|DOC:" + documento, t.valor, ordem) });
      });
      blocos.push(bloco(transacoes, anterior, final));
    }
    atuais = [];
    documentos = [];
    pendentes = [];
    anterior = null;
    final = null;
  };

  for (const evento of lidos) {
    if (evento.tipo === "texto") {
      pendentes.push(evento.texto);
    } else if (evento.tipo === "secao" || evento.tipo === "saldo") {
      fechar();
      dataAtual = null;
      if (evento.tipo === "saldo") {
        dataAtual = evento.data ? parseData(evento.data, referenciaAno) : null;
        anterior = evento.saldo;
      }
    } else if (evento.tipo === "total") {
      completar(pendentes);
      pendentes = [];
      final = evento.total;
    } else {
      const { data, descricao, documento, saldo } = evento;
      const valor = evento.valor!;
      if (data) dataAtual = parseData(data, referenciaAno);
      let prefixo = "";
      if (pendentes.length && (!descricao || tipos.has(pendentes[pendentes.length - 1]))) prefixo = pendentes.pop()!;
      completar(pendentes);
      pendentes = [];
      const historico = [prefixo, descricao].filter(Boolean).join(" ");
      if (!dataAtual || !historico) erro("Lançamento Bradesco sem data ou histórico identificado.");
      atuais.push({
        fitid: "",
        data: dataAtual,
        valor,
        historico,
        tipoOfx: naoNegativo(valor) ? "CREDIT" : "DEBIT",
        saldoApos: saldo,
        ordem: atuais.length,
      });
      documentos.push(documento);
    }
  }
  fechar();
  return blocos;
}
