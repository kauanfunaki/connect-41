import { parseHexColor, toHex } from "@/lib/color";
import { SECTOR_COLOR_PALETTE } from "@/lib/sector-constants";

// Cores das pessoas e dos times no calendário do GitHub (04/11/2026). A cor diz
// QUEM contribuiu no dia; a intensidade (calendarLevel) continua dizendo QUANTO.
// Num dia com mais de uma pessoa (ou time), as cores se misturam pelo peso de cada
// uma, em OKLab — na média em RGB, azul com laranja vira cinza-barro.

export type ModoDeCor = "pessoa" | "time";
/** `cor` já resolvida: a escolhida pelo coordenador ou a automática. `time` é o id do time. */
export type PessoaDoPainel = { login: string; name: string | null; cor: string; time: string | null };
export type TimeDoPainel = { id: string; nome: string; cor: string };
/** Chaveada pelo `GithubUser.id` da resposta (o mesmo id das partes de cada dia). */
export type Paleta = { pessoas: Record<string, PessoaDoPainel>; times: TimeDoPainel[] };
/** Quem contribuiu no dia: [GithubUser.id, contribuições]. */
export type ParteDoDia = [string, number];

/** O cinza fica de fora das automáticas: é a cor de quem está sem time. */
export const CORES_AUTOMATICAS: readonly string[] = [...SECTOR_COLOR_PALETTE.filter(cor => cor !== "#586577"), "#B8327A"];
export const COR_SEM_TIME = "#8A94A6";
export const MODOS_DE_COR: readonly ModoDeCor[] = ["pessoa", "time"];

/** "#rgb", "#rrggbb" ou sem "#" → "#RRGGBB"; null se não for cor. (O `hexCanonico` do seletor é de componente cliente.) */
export function hexDaCor(valor: string): string | null {
  const rgb = parseHexColor(valor);
  return rgb ? toHex(rgb) : null;
}

/** Sempre a mesma cor para a mesma pessoa, sem precisar gravar nada. */
export function corAutomatica(chave: string): string {
  let hash = 2166136261;
  for (let i = 0; i < chave.length; i++) hash = Math.imul(hash ^ chave.charCodeAt(i), 16777619);
  return CORES_AUTOMATICAS[(hash >>> 0) % CORES_AUTOMATICAS.length]!;
}

export function corDaPessoa(id: string, paleta: Paleta, modo: ModoDeCor): string {
  const pessoa = paleta.pessoas[id];
  if (!pessoa) return modo === "time" ? COR_SEM_TIME : corAutomatica(id);
  if (modo === "pessoa") return pessoa.cor;
  return paleta.times.find(time => time.id === pessoa.time)?.cor ?? COR_SEM_TIME;
}

/** A cor de um dia: a mistura das cores de quem contribuiu, pesada pelas contribuições. */
export function corDoDia(partes: readonly ParteDoDia[], paleta: Paleta, modo: ModoDeCor): string {
  return misturar(partes.map(([id, peso]) => ({ cor: corDaPessoa(id, paleta, modo), peso })));
}

/**
 * Quem está nas partes, já agrupado pelo modo: por pessoa, cada uma; por time, cada
 * time (e "Sem time"). Do maior para o menor — é o texto do dia e a legenda.
 */
export function quemContribuiu(partes: readonly ParteDoDia[], paleta: Paleta, modo: ModoDeCor): { chave: string; rotulo: string; cor: string; total: number }[] {
  const grupos = new Map<string, { chave: string; rotulo: string; cor: string; total: number }>();
  for (const [id, total] of partes) {
    const pessoa = paleta.pessoas[id], time = modo === "time" ? paleta.times.find(item => item.id === pessoa?.time) : undefined;
    const chave = modo === "pessoa" ? id : time?.id ?? "";
    const rotulo = modo === "pessoa" ? pessoa?.name ?? pessoa?.login ?? "Pessoa" : time?.nome ?? "Sem time";
    const grupo = grupos.get(chave) ?? { chave, rotulo, cor: corDaPessoa(id, paleta, modo), total: 0 };
    grupo.total += total; grupos.set(chave, grupo);
  }
  return [...grupos.values()].sort((a, b) => b.total - a.total || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

type Lab = [number, number, number];
const linear = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const gamma = (v: number) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)));

function paraOklab(hex: string): Lab | null {
  const rgb = parseHexColor(hex); if (!rgb) return null;
  const r = linear(rgb.r), g = linear(rgb.g), b = linear(rgb.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

function deOklab([L, A, B]: Lab): string {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return toHex({ r: gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), g: gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), b: gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s) }).toUpperCase();
}

/** Média ponderada em OKLab. Uma cor só (ou todas iguais) volta igual; sem partes, o cinza de "sem time". */
export function misturar(partes: readonly { cor: string; peso: number }[]): string {
  const validas = partes.flatMap(({ cor, peso }) => { const lab = peso > 0 ? paraOklab(cor) : null; return lab ? [{ cor, lab, peso }] : []; });
  if (!validas.length) return COR_SEM_TIME;
  const primeira = validas[0]!.cor.toUpperCase();
  if (validas.every(parte => parte.cor.toUpperCase() === primeira)) return primeira;
  const total = validas.reduce((soma, parte) => soma + parte.peso, 0), mistura: Lab = [0, 0, 0];
  for (const { lab, peso } of validas) for (let i = 0; i < 3; i++) mistura[i]! += lab[i]! * peso / total;
  return deOklab(mistura);
}
