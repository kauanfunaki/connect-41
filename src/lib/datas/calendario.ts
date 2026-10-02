// Datas de calendário como TEXTO — "AAAA-MM-DD", "AAAA-MM", "HH:mm" — e nunca
// como `Date` local (02/10/2026, date picker do Connect).
//
// `new Date("2026-10-06")` é meia-noite UTC, que em São Paulo ainda é 05/10 às
// 21h: é assim que uma data "anda um dia" quando alguém a formata no fuso do
// navegador. Aqui a data fica em texto do começo ao fim, e onde a conta precisa
// de calendário (dia da semana, somar dias) ela passa por `Date.UTC` e volta
// lida em UTC, sem fuso nenhum no meio. O formulário recebe o mesmo texto que o
// `<input type="date">` mandava, então as actions não mudam.

export type Ymd = { ano: number; mes: number; dia: number };

export const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** Semana começando na segunda, como o calendário de escritório. */
export const INICIAIS_DA_SEMANA = ["S", "T", "Q", "Q", "S", "S", "D"];
export const DIAS_DA_SEMANA = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"];

const p2 = (n: number) => String(n).padStart(2, "0");

export function paraIso({ ano, mes, dia }: Ymd): string {
  return `${ano}-${p2(mes)}-${p2(dia)}`;
}

export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

export function ehDataValida(ano: number, mes: number, dia: number): boolean {
  return (
    Number.isInteger(ano) && Number.isInteger(mes) && Number.isInteger(dia) &&
    ano >= 1000 && ano <= 9999 && mes >= 1 && mes <= 12 && dia >= 1 && dia <= diasNoMes(ano, mes)
  );
}

/** "AAAA-MM-DD" válido → partes; qualquer outra coisa → `null`. */
export function lerIso(texto: string | null | undefined): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto ?? "");
  if (!m) return null;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return ehDataValida(ano, mes, dia) ? { ano, mes, dia } : null;
}

/** 0 = segunda … 6 = domingo. */
export function diaDaSemana(iso: string): number {
  const d = lerIso(iso);
  if (!d) return 0;
  return (new Date(Date.UTC(d.ano, d.mes - 1, d.dia)).getUTCDay() + 6) % 7;
}

export function ehFimDeSemana(iso: string): boolean {
  return diaDaSemana(iso) >= 5;
}

export function somarDias(iso: string, n: number): string {
  const d = lerIso(iso);
  if (!d) return iso;
  const t = new Date(Date.UTC(d.ano, d.mes - 1, d.dia + n));
  return paraIso({ ano: t.getUTCFullYear(), mes: t.getUTCMonth() + 1, dia: t.getUTCDate() });
}

export function somarMeses(ano: number, mes: number, n: number): { ano: number; mes: number } {
  const i = ano * 12 + (mes - 1) + n;
  return { ano: Math.floor(i / 12), mes: (((i % 12) + 12) % 12) + 1 };
}

/** Mesmo dia em outro mês; sem esse dia (31 → fevereiro), o último do mês. */
export function somarMesesNaData(iso: string, n: number): string {
  const d = lerIso(iso);
  if (!d) return iso;
  const { ano, mes } = somarMeses(d.ano, d.mes, n);
  return paraIso({ ano, mes, dia: Math.min(d.dia, diasNoMes(ano, mes)) });
}

/**
 * As seis semanas da grade, de segunda a domingo. Sempre seis: com cinco em uns
 * meses e seis em outros, o painel mudaria de altura a cada ‹ ›.
 */
export function gradeDoMes(ano: number, mes: number): string[][] {
  const primeiro = paraIso({ ano, mes, dia: 1 });
  const inicio = somarDias(primeiro, -diaDaSemana(primeiro));
  return Array.from({ length: 6 }, (_, s) => Array.from({ length: 7 }, (_, d) => somarDias(inicio, s * 7 + d)));
}

/** Hoje no escritório (São Paulo), e não no relógio de quem roda o código. */
export function hojeIso(agora: Date = new Date()): string {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(agora)
      .map((p) => [p.type, p.value])
  );
  return `${partes.year}-${partes.month}-${partes.day}`;
}

/** Ano de dois dígitos: até dez anos à frente é deste século; o resto, do passado (nascimento em "85"). */
function anoCompleto(texto: string, anoAtual: number): number {
  if (texto.length === 4) return Number(texto);
  const ano = 2000 + Number(texto);
  return ano > anoAtual + 10 ? ano - 100 : ano;
}

/**
 * O que a pessoa digitou → "AAAA-MM-DD", ou `null`. Aceita 06/10/2026,
 * 6/10/2026, 06102026, 06/10/26, 061026 e o ISO colado de outro lugar.
 */
export function lerDataDigitada(texto: string, anoAtual: number = new Date().getUTCFullYear()): string | null {
  const t = texto.trim();
  if (!t) return null;
  if (lerIso(t)) return t;
  let dia: number, mes: number, ano: number;
  const comBarra = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (comBarra) {
    [dia, mes, ano] = [Number(comBarra[1]), Number(comBarra[2]), anoCompleto(comBarra[3], anoAtual)];
  } else if (/^\d{8}$/.test(t) || /^\d{6}$/.test(t)) {
    [dia, mes, ano] = [Number(t.slice(0, 2)), Number(t.slice(2, 4)), anoCompleto(t.slice(4), anoAtual)];
  } else {
    return null;
  }
  return ehDataValida(ano, mes, dia) ? paraIso({ ano, mes, dia }) : null;
}

/**
 * Máscara enquanto digita (dd/mm/aaaa): só dígitos, com as barras no lugar. Quem
 * digita a barra depois de um dígito só ("6/") quis dizer "06/". A barra só
 * aparece depois que o próximo número chega (ou quando a pessoa a digita): uma
 * barra posta sozinha voltaria a cada Backspace e prenderia o cursor.
 */
export function mascararData(texto: string): string {
  return mascarar(texto, [2, 2, 4]);
}

export function mascararMes(texto: string): string {
  return mascarar(texto, [2, 4]);
}

function mascarar(texto: string, blocos: number[], separador = "/"): string {
  const total = blocos.reduce((a, b) => a + b, 0);
  const pedacos = texto.split(/[/.:h-]/);
  let digitos = "";
  pedacos.forEach((pedaco, i) => {
    const so = pedaco.replace(/\D/g, "");
    // O bloco onde este pedaço começa, e se ele começa bem no início dele.
    let inicio = 0;
    let bloco = 0;
    while (bloco < blocos.length && inicio + blocos[bloco] <= digitos.length) inicio += blocos[bloco++];
    const fechou = i < pedacos.length - 1;
    if (fechou && digitos.length === inicio && so.length === 1 && blocos[bloco] === 2) digitos += `0${so}`;
    else digitos += so;
  });
  digitos = digitos.slice(0, total);

  const saida: string[] = [];
  let pos = 0;
  for (const b of blocos) {
    if (pos >= digitos.length) break;
    saida.push(digitos.slice(pos, pos + b));
    pos += b;
  }
  const ultimoCompleto = saida.length > 0 && saida.length < blocos.length && saida[saida.length - 1].length === blocos[saida.length - 1];
  return saida.join(separador) + (ultimoCompleto && /[/.:h-]\s*$/.test(texto) ? separador : "");
}

export function dataBR(iso: string | null | undefined): string {
  const d = lerIso(iso);
  return d ? `${p2(d.dia)}/${p2(d.mes)}/${d.ano}` : "";
}

/** "06 out 2026". */
export function dataPorExtenso(iso: string | null | undefined): string {
  const d = lerIso(iso);
  return d ? `${p2(d.dia)} ${MESES_CURTOS[d.mes - 1]} ${d.ano}` : "";
}

/** Para leitor de tela: "segunda-feira, 6 de outubro de 2026". */
export function dataParaLeitura(iso: string): string {
  const d = lerIso(iso);
  return d ? `${DIAS_DA_SEMANA[diaDaSemana(iso)]}, ${d.dia} de ${MESES[d.mes - 1]} de ${d.ano}` : "";
}

/** "06 – 10 out 2026", "28 set – 03 out 2026", "28 dez 2025 – 03 jan 2026". */
export function periodoPorExtenso(de: string, ate: string): string {
  const a = lerIso(de);
  const b = lerIso(ate);
  if (a && !b) return `a partir de ${dataPorExtenso(de)}`;
  if (!a && b) return `até ${dataPorExtenso(ate)}`;
  if (!a || !b) return "";
  if (de === ate) return dataPorExtenso(de);
  if (a.ano === b.ano && a.mes === b.mes) return `${p2(a.dia)} – ${dataPorExtenso(ate)}`;
  if (a.ano === b.ano) return `${p2(a.dia)} ${MESES_CURTOS[a.mes - 1]} – ${dataPorExtenso(ate)}`;
  return `${dataPorExtenso(de)} – ${dataPorExtenso(ate)}`;
}

/** Fora de `min`/`max` (ambos "AAAA-MM-DD"; texto ISO compara na ordem certa). */
export function foraDoLimite(iso: string, min?: string, max?: string): boolean {
  return Boolean((min && iso < min) || (max && iso > max));
}

// ── Mês ("AAAA-MM") ────────────────────────────────────────────────────────

export function lerMesIso(texto: string | null | undefined): { ano: number; mes: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(texto ?? "");
  if (!m) return null;
  const [ano, mes] = [Number(m[1]), Number(m[2])];
  return ano >= 1000 && mes >= 1 && mes <= 12 ? { ano, mes } : null;
}

export function mesIso(ano: number, mes: number): string {
  return `${ano}-${p2(mes)}`;
}

/** 10/2026, 1/2026, 102026, 10/26 ou "2026-10" → "2026-10". */
export function lerMesDigitado(texto: string, anoAtual: number = new Date().getUTCFullYear()): string | null {
  const t = texto.trim();
  if (lerMesIso(t)) return t;
  let mes: number, ano: number;
  const comBarra = /^(\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (comBarra) [mes, ano] = [Number(comBarra[1]), anoCompleto(comBarra[2], anoAtual)];
  else if (/^\d{6}$/.test(t) || /^\d{4}$/.test(t)) [mes, ano] = [Number(t.slice(0, 2)), anoCompleto(t.slice(2), anoAtual)];
  else return null;
  return mes >= 1 && mes <= 12 && ano >= 1000 ? mesIso(ano, mes) : null;
}

export function mesBR(iso: string | null | undefined): string {
  const m = lerMesIso(iso);
  return m ? `${p2(m.mes)}/${m.ano}` : "";
}

/** "out 2026". */
export function mesPorExtenso(iso: string | null | undefined): string {
  const m = lerMesIso(iso);
  return m ? `${MESES_CURTOS[m.mes - 1]} ${m.ano}` : "";
}

export function mesCurto(mes: number): string {
  return MESES_CURTOS[mes - 1];
}

// ── Hora ("HH:mm") ─────────────────────────────────────────────────────────

/** 09:30, 9:30, 0930, 930, 9 → "09:30" / "09:00". */
export function lerHoraDigitada(texto: string): string | null {
  const t = texto.trim();
  let h: number, m: number;
  const comDoisPontos = /^(\d{1,2})[:h.](\d{2})?$/.exec(t);
  if (comDoisPontos) [h, m] = [Number(comDoisPontos[1]), Number(comDoisPontos[2] ?? 0)];
  else if (/^\d{1,2}$/.test(t)) [h, m] = [Number(t), 0];
  else if (/^\d{3,4}$/.test(t)) [h, m] = [Number(t.slice(0, t.length - 2)), Number(t.slice(-2))];
  else return null;
  return h <= 23 && m <= 59 ? `${p2(h)}:${p2(m)}` : null;
}

export function mascararHora(texto: string): string {
  return mascarar(texto, [2, 2], ":");
}

// ── Atalhos de período ─────────────────────────────────────────────────────

export type Atalho = { rotulo: string; de: string; ate: string };

export function atalhosDePeriodo(hoje: string): Atalho[] {
  const d = lerIso(hoje);
  if (!d) return [];
  const inicioDoMes = paraIso({ ano: d.ano, mes: d.mes, dia: 1 });
  const anterior = somarMeses(d.ano, d.mes, -1);
  return [
    { rotulo: "Hoje", de: hoje, ate: hoje },
    { rotulo: "Últimos 7 dias", de: somarDias(hoje, -6), ate: hoje },
    { rotulo: "Últimos 30 dias", de: somarDias(hoje, -29), ate: hoje },
    { rotulo: "Este mês", de: inicioDoMes, ate: paraIso({ ano: d.ano, mes: d.mes, dia: diasNoMes(d.ano, d.mes) }) },
    {
      rotulo: "Mês passado",
      de: paraIso({ ...anterior, dia: 1 }),
      ate: paraIso({ ...anterior, dia: diasNoMes(anterior.ano, anterior.mes) }),
    },
  ];
}
