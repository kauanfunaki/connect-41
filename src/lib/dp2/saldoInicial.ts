// Saldo inicial das médias do DP 2 (25/11/2026, funcionalidade-747, entrega 1.3).
//
// Quem já trabalha na empresa quando o DP 2 começa a calcular tem um histórico
// na Domínio: as rubricas variáveis de cada mês (horas extras, adicional
// noturno, comissões…), que entram na média de férias, 13º e rescisão. A
// Domínio mostra isso em Utilitários › Lançamentos › "Lançamento de Rubricas
// para Médias"; o DP copia as linhas (da tela ou de uma planilha) e cola aqui:
//
//   CPF ; competência ; código da rubrica ; valor
//   123.456.789-09 ; 03/2026 ; 150 ; 412,30
//
// Separador ";" ou tabulação; competência "MM/AAAA" ou "AAAA-MM"; o código é o
// da rubrica no catálogo do DP 2. Linhas repetidas (mesma pessoa, mês e
// rubrica) somam.
//
// Puro, sem banco.

import { r2 } from "@/lib/rescisao/constantes";
import { lerNumero } from "./entrada";
import type { MesDaMedia } from "./medias";

export type PessoaDoSaldo = { id: string; cpf: string | null };
export type RubricaDoSaldo = { id: string; codigo: string; nome: string; tipo: string; mediaFerias: boolean; mediaDecimo: boolean; mediaRescisao: boolean };

export type LinhaDoSaldo = { personId: string; competencia: string; rubricaId: string; valor: number };

export type LeituraDoSaldo = { linhas: LinhaDoSaldo[]; erros: string[]; avisos: string[] };

const soDigitos = (s: string) => s.replace(/\D/g, "");

/** "03/2026", "3/2026", "2026-03" ou "032026" → "2026-03"; `null` se não for um mês. */
export function lerCompetencia(bruto: string): string | null {
  const s = bruto.trim();
  let ano: number;
  let mes: number;
  let m = /^(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) [mes, ano] = [Number(m[1]), Number(m[2])];
  else if ((m = /^(\d{4})-(\d{1,2})$/.exec(s))) [ano, mes] = [Number(m[1]), Number(m[2])];
  else if ((m = /^(\d{2})(\d{4})$/.exec(s))) [mes, ano] = [Number(m[1]), Number(m[2])];
  else return null;
  if (mes < 1 || mes > 12 || ano < 1990 || ano > 2100) return null;
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

/**
 * Lê o texto colado. `antesDe` ("AAAA-MM") é o primeiro mês do DP 2: o saldo
 * inicial é só do que veio antes dele (o resto o DP 2 já calcula).
 */
export function lerSaldoInicial(texto: string, pessoas: readonly PessoaDoSaldo[], rubricas: readonly RubricaDoSaldo[], antesDe?: string): LeituraDoSaldo {
  const porCpf = new Map(pessoas.filter((p) => p.cpf).map((p) => [soDigitos(p.cpf!), p]));
  const porCodigo = new Map(rubricas.map((r) => [r.codigo.trim().replace(/^0+(?=\d)/, ""), r]));
  const somadas = new Map<string, LinhaDoSaldo>();
  const erros: string[] = [];
  const foraDaMedia = new Set<string>();
  const descontos = new Set<string>();

  texto.split(/\r?\n/).forEach((bruta, i) => {
    const linha = bruta.trim();
    if (!linha) return;
    const n = i + 1;
    const campos = linha.split(/\t|;/).map((c) => c.trim());
    // Cabeçalho ("CPF;Competência;…"): o primeiro campo não tem número.
    if (!/\d/.test(campos[0] ?? "")) return;
    if (campos.length < 4) return void erros.push(`Linha ${n}: são 4 campos (CPF; competência; rubrica; valor).`);
    const [cpfBruto, compBruta, codigoBruto, valorBruto] = campos;
    const pessoa = porCpf.get(soDigitos(cpfBruto).padStart(11, "0"));
    if (!pessoa) return void erros.push(`Linha ${n}: CPF ${cpfBruto} não é de nenhum colaborador desta empresa.`);
    const competencia = lerCompetencia(compBruta);
    if (!competencia) return void erros.push(`Linha ${n}: competência "${compBruta}" ilegível (use MM/AAAA).`);
    if (antesDe && competencia >= antesDe) return void erros.push(`Linha ${n}: ${compBruta} já é mês do DP 2 (o saldo inicial vai até o mês anterior a ${antesDe.split("-").reverse().join("/")}).`);
    const rubrica = porCodigo.get(codigoBruto.replace(/^0+(?=\d)/, ""));
    if (!rubrica) return void erros.push(`Linha ${n}: rubrica ${codigoBruto} não está no catálogo do DP 2.`);
    const valor = lerNumero(valorBruto);
    if (valor === null || valor < 0) return void erros.push(`Linha ${n}: valor "${valorBruto}" ilegível.`);
    if (rubrica.tipo !== "PROVENTO") descontos.add(`${rubrica.codigo} · ${rubrica.nome}`);
    else if (!rubrica.mediaFerias && !rubrica.mediaDecimo && !rubrica.mediaRescisao) foraDaMedia.add(`${rubrica.codigo} · ${rubrica.nome}`);
    const chave = `${pessoa.id}|${competencia}|${rubrica.id}`;
    const ja = somadas.get(chave);
    if (ja) ja.valor = r2(ja.valor + valor);
    else somadas.set(chave, { personId: pessoa.id, competencia, rubricaId: rubrica.id, valor: r2(valor) });
  });

  const avisos: string[] = [];
  if (foraDaMedia.size) avisos.push(`Não entram em média nenhuma (veja as marcações em Rubricas): ${[...foraDaMedia].join(", ")}.`);
  if (descontos.size) avisos.push(`Não são proventos e não entram na média: ${[...descontos].join(", ")}.`);
  return { linhas: [...somadas.values()], erros, avisos };
}

/**
 * Os meses do saldo inicial no formato da média (medias.ts), fora os meses em
 * que a pessoa já tem competência fechada no DP 2 (`jaNoDp2`): o cálculo do
 * DP 2 vale mais que o histórico.
 */
export function mesesDoSaldoInicial(
  linhas: readonly { competencia: string; valor: number; rubrica: Pick<RubricaDoSaldo, "tipo" | "mediaFerias" | "mediaDecimo" | "mediaRescisao"> }[],
  jaNoDp2: ReadonlySet<string>
): MesDaMedia[] {
  const porMes = new Map<string, MesDaMedia & { itens: MesDaMedia["itens"][number][] }>();
  for (const l of linhas) {
    if (jaNoDp2.has(l.competencia)) continue;
    const mes = porMes.get(l.competencia) ?? { competencia: l.competencia, itens: [] };
    mes.itens.push({ valor: l.valor, tipo: l.rubrica.tipo, mediaFerias: l.rubrica.mediaFerias, mediaDecimo: l.rubrica.mediaDecimo, mediaRescisao: l.rubrica.mediaRescisao });
    porMes.set(l.competencia, mes);
  }
  return [...porMes.values()];
}

export type ResumoDoSaldo = { personId: string; meses: number; de: string; ate: string; total: number; pendentes: number };

/** Por pessoa: quantos meses vieram, de quando a quando, o total e o que falta conferir. */
export function resumirSaldoInicial(linhas: readonly { personId: string; competencia: string; valor: number; conferido: boolean }[]): ResumoDoSaldo[] {
  const por = new Map<string, { meses: Set<string>; total: number; pendentes: number }>();
  for (const l of linhas) {
    const r = por.get(l.personId) ?? { meses: new Set<string>(), total: 0, pendentes: 0 };
    r.meses.add(l.competencia);
    r.total += l.valor;
    if (!l.conferido) r.pendentes += 1;
    por.set(l.personId, r);
  }
  return [...por.entries()].map(([personId, r]) => {
    const meses = [...r.meses].sort();
    return { personId, meses: meses.length, de: meses[0], ate: meses[meses.length - 1], total: r2(r.total), pendentes: r.pendentes };
  });
}
