// Os feriados nacionais, calculados — sem cadastro e sem serviço externo
// (21/10/2026, pedido do Kauan de 15/10: "a importação deve ser automática").
//
// Até aqui o admin entrava em /admin/feriados na virada do ano e importava a
// lista da BrasilAPI. Agora os nacionais saem desta conta, para qualquer ano, e
// o cadastro fica só para as exceções: estaduais, municipais, pontes e recessos.
//
// Datas em texto "AAAA-MM-DD", como em `calendario.ts`, e lidas em UTC.

export type FeriadoNacional = { data: string; nome: string };

const p2 = (n: number) => String(n).padStart(2, "0");

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function domingoDePascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${p2(mes)}-${p2(dia)}`;
}

function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/**
 * Os nacionais do ano, em ordem de data.
 *
 * Carnaval e Corpus Christi são ponto facultativo, não feriado de lei — mas a
 * importação da BrasilAPI já os trazia e os prazos já os pulavam, então seguem
 * entrando (o Carnaval é a terça, como vinha). A segunda de Carnaval, quando o
 * escritório fecha, é exceção cadastrada na tela.
 */
export function feriadosNacionais(ano: number): FeriadoNacional[] {
  const pascoa = domingoDePascoa(ano);
  const fixo = (mes: number, dia: number, nome: string) => ({ data: `${ano}-${p2(mes)}-${p2(dia)}`, nome });
  const lista: FeriadoNacional[] = [
    fixo(1, 1, "Confraternização Universal"),
    { data: somarDias(pascoa, -47), nome: "Carnaval (ponto facultativo)" },
    { data: somarDias(pascoa, -2), nome: "Sexta-feira Santa" },
    fixo(4, 21, "Tiradentes"),
    fixo(5, 1, "Dia do Trabalho"),
    { data: somarDias(pascoa, 60), nome: "Corpus Christi (ponto facultativo)" },
    fixo(9, 7, "Independência do Brasil"),
    fixo(10, 12, "Nossa Senhora Aparecida"),
    fixo(11, 2, "Finados"),
    fixo(11, 15, "Proclamação da República"),
    fixo(12, 25, "Natal"),
  ];
  // Nacional desde 2024 (Lei 14.759/2023).
  if (ano >= 2024) lista.push(fixo(11, 20, "Dia Nacional de Zumbi e da Consciência Negra"));
  return lista.sort((x, y) => x.data.localeCompare(y.data));
}

/**
 * Os anos que a contagem de dias úteis precisa ter à mão: cinco para trás
 * (processo antigo ainda aberto) e cinco para a frente (repetição de
 * lançamento por meses). São uns 130 feriados, conta de microssegundos.
 */
export function anosDosFeriados(anoAtual: number): number[] {
  return Array.from({ length: 11 }, (_, i) => anoAtual - 5 + i);
}

export type FeriadoDoAno = {
  data: string;
  nome: string;
  /** Nacional, da conta acima: aparece na tela, mas não se edita. */
  automatico: boolean;
  /** Id do cadastro, para a exceção poder ser excluída. */
  id?: string;
};

/**
 * Os nacionais junto com as exceções do escritório, um por data.
 *
 * O cadastro que cai na data de um nacional (o que a importação antiga gravou)
 * não aparece de novo: o nacional já vale. Fica no banco, sem efeito.
 */
export function juntarFeriados(
  nacionais: FeriadoNacional[],
  cadastrados: { id: string; data: string; nome: string }[]
): FeriadoDoAno[] {
  const datas = new Set(nacionais.map((n) => n.data));
  return [
    ...nacionais.map((n) => ({ ...n, automatico: true })),
    ...cadastrados.filter((c) => !datas.has(c.data)).map((c) => ({ ...c, automatico: false })),
  ].sort((x, y) => x.data.localeCompare(y.data));
}
