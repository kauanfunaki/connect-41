// Eventos do mês colados de uma planilha ou do relatório do Pontomais
// (12/11/2026, fase 2 do DP 2).
//
// A maioria dos clientes controla o ponto à mão e manda uma planilha; alguns
// usam o Pontomais, que exporta os totais do período por colaborador. Os dois
// chegam aqui do mesmo jeito: o DP copia do Excel (tabulação) ou do CSV (";")
// e cola. A primeira linha é o cabeçalho.
//
// - A pessoa é achada pelo CPF (coluna "CPF") ou, sem CPF, pelo nome exato.
// - Cada outra coluna vira uma rubrica pelo código ("002"), pelo nome
//   ("Horas extras 50%") ou por um apelido comum ("HE 50", "Extra 50%",
//   "Noturno", "Faltas"). Coluna que não casa com nada é listada e ignorada.
// - Horas aceitam "10:30" (o formato do Pontomais) ou "10,5". Valores em
//   reais aceitam "1.234,56".
//
// Puro, sem banco.

import { lerNumero } from "./entrada";
import { PAPEIS_LANCAVEIS, type LancamentoDaRubrica, type PapelDaRubrica, type TipoDaRubrica } from "./rubricas";

export type RubricaParaImportar = {
  id: string;
  codigo: string;
  nome: string;
  tipo: TipoDaRubrica;
  papel: PapelDaRubrica | null;
  lancamento: LancamentoDaRubrica;
  ativa: boolean;
};

export type PessoaParaImportar = { id: string; nome: string; cpf: string | null };

export type EventoImportado = { personId: string; rubricaId: string; quantidade: number | null; valor: number | null };

export type ResultadoDaImportacao = {
  eventos: EventoImportado[];
  /** "HE 50 → 002 · Horas extras 50%". */
  colunas: { cabecalho: string; rubrica: string | null }[];
  avisos: string[];
};

/** Apelidos de cabeçalho, já sem acento e em minúsculas, para cada papel. */
const APELIDOS: Partial<Record<PapelDaRubrica, string[]>> = {
  HE50: ["he 50", "he50", "he 50%", "extra 50", "extras 50", "extra 50%", "extras 50%", "hora extra 50%", "horas extras 50%", "horas extras 50", "he diurna 50%"],
  HE100: ["he 100", "he100", "he 100%", "extra 100", "extras 100", "extra 100%", "extras 100%", "hora extra 100%", "horas extras 100%", "horas extras 100", "he domingos e feriados"],
  NOTURNO: ["noturno", "adicional noturno", "ad noturno", "ad. noturno", "horas noturnas", "adic noturno"],
  FALTA: ["falta", "faltas", "dias de falta", "faltas (dias)", "faltas injustificadas"],
  DSR_FALTA: ["dsr falta", "dsr das faltas", "dsr perdido", "dsr descontado"],
  ATRASO: ["atraso", "atrasos", "horas de atraso", "atrasos (horas)", "horas faltantes"],
  ADIANTAMENTO: ["adiantamento", "vale", "adiantamento salarial"],
  PENSAO: ["pensao", "pensao alimenticia"],
};

const COLUNAS_DA_PESSOA = new Set(["cpf", "nome", "colaborador", "funcionario", "empregado", "matricula", "pis", "cargo", "departamento", "equipe"]);

export function normalizar(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** "10:30" → 10,5; "10,5" → 10,5; "-" ou vazio → null. */
export function lerHoras(bruto: string): number | null {
  const t = bruto.trim();
  if (!t || t === "-" || t === "--") return null;
  const hm = /^(-?)(\d{1,4}):([0-5]\d)(?::[0-5]\d)?$/.exec(t);
  if (hm) {
    const n = Number(hm[2]) + Number(hm[3]) / 60;
    return Math.round((hm[1] ? -n : n) * 100) / 100;
  }
  return lerNumero(t);
}

function separar(linha: string): string[] {
  return linha.includes("\t") ? linha.split("\t") : linha.split(";");
}

/** As rubricas que podem vir de uma planilha: as lançáveis do motor e as livres de provento ou desconto. */
export function podeImportar(r: RubricaParaImportar): boolean {
  if (!r.ativa) return false;
  if (r.papel) return PAPEIS_LANCAVEIS.has(r.papel);
  return r.tipo !== "INFORMATIVA";
}

export function rubricaDaColuna(cabecalho: string, rubricas: readonly RubricaParaImportar[]): RubricaParaImportar | null {
  const c = normalizar(cabecalho);
  if (!c) return null;
  const candidatas = rubricas.filter(podeImportar);
  const codigo = /^(\d{1,10})(\b|\s|-|·)/.exec(c)?.[1];
  if (codigo) {
    const r = candidatas.find((x) => x.codigo === codigo || x.codigo.replace(/^0+/, "") === codigo.replace(/^0+/, ""));
    if (r) return r;
  }
  const porNome = candidatas.find((x) => normalizar(x.nome) === c);
  if (porNome) return porNome;
  for (const x of candidatas) {
    if (x.papel && APELIDOS[x.papel]?.includes(c)) return x;
  }
  return null;
}

export function importarEventos(texto: string, rubricas: readonly RubricaParaImportar[], pessoas: readonly PessoaParaImportar[]): ResultadoDaImportacao {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim());
  const avisos: string[] = [];
  if (linhas.length < 2) return { eventos: [], colunas: [], avisos: ["Cole o cabeçalho e ao menos uma linha de colaborador."] };

  const cabecalho = separar(linhas[0]).map((c) => c.trim());
  const indiceCpf = cabecalho.findIndex((c) => normalizar(c) === "cpf");
  const indiceNome = cabecalho.findIndex((c) => ["nome", "colaborador", "funcionario", "empregado"].includes(normalizar(c)));
  if (indiceCpf < 0 && indiceNome < 0) return { eventos: [], colunas: [], avisos: ["O cabeçalho precisa de uma coluna CPF ou Nome."] };

  const colunas: ResultadoDaImportacao["colunas"] = [];
  const mapa = new Map<number, RubricaParaImportar>();
  cabecalho.forEach((c, i) => {
    if (i === indiceCpf || i === indiceNome || COLUNAS_DA_PESSOA.has(normalizar(c)) || !c) return;
    const r = rubricaDaColuna(c, rubricas);
    colunas.push({ cabecalho: c, rubrica: r ? `${r.codigo} · ${r.nome}` : null });
    if (r) mapa.set(i, r);
  });
  if (mapa.size === 0) avisos.push("Nenhuma coluna casou com uma rubrica: use o código (002), o nome da rubrica ou HE 50, HE 100, Noturno, Faltas, Atrasos.");

  const porCpf = new Map(pessoas.filter((p) => p.cpf).map((p) => [p.cpf!.replace(/\D/g, ""), p]));
  const porNome = new Map<string, PessoaParaImportar[]>();
  for (const p of pessoas) {
    const k = normalizar(p.nome);
    porNome.set(k, [...(porNome.get(k) ?? []), p]);
  }

  const eventos: EventoImportado[] = [];
  linhas.slice(1).forEach((linha, i) => {
    const partes = separar(linha);
    const cpf = indiceCpf >= 0 ? (partes[indiceCpf] ?? "").replace(/\D/g, "") : "";
    const nome = indiceNome >= 0 ? (partes[indiceNome] ?? "").trim() : "";
    let pessoa: PessoaParaImportar | undefined;
    if (cpf) pessoa = porCpf.get(cpf);
    if (!pessoa && nome) {
      const achadas = porNome.get(normalizar(nome)) ?? [];
      if (achadas.length > 1) {
        avisos.push(`Linha ${i + 2}: há mais de um ${nome} na empresa; use o CPF.`);
        return;
      }
      pessoa = achadas[0];
    }
    if (!pessoa) {
      if (cpf || nome) avisos.push(`Linha ${i + 2}: ${nome || cpf} não é colaborador desta empresa com contrato no DP 2.`);
      return;
    }
    for (const [indice, r] of mapa) {
      const bruto = (partes[indice] ?? "").trim();
      if (!bruto) continue;
      const porQuantidade = r.papel !== null && r.lancamento !== "VALOR";
      const n = porQuantidade ? lerHoras(bruto) : lerNumero(bruto);
      if (n === null) {
        avisos.push(`Linha ${i + 2}, ${r.nome}: "${bruto}" não é um número.`);
        continue;
      }
      if (n === 0) continue;
      if (n < 0) {
        avisos.push(`Linha ${i + 2}, ${r.nome}: valor negativo ignorado.`);
        continue;
      }
      eventos.push({ personId: pessoa.id, rubricaId: r.id, quantidade: porQuantidade ? n : null, valor: porQuantidade ? null : n });
    }
  });
  return { eventos, colunas, avisos };
}
