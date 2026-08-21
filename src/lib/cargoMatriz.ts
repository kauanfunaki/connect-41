// Matriz de cargos e salários — bloco 4 do escopo de RH/DP ("Organização de
// cargos por família, área ou hierarquia" + "criação de matriz simples").
//
// A ordem de SENIORITY_ORDER É a trilha de progressão: a matriz usa isso pra
// ordenar as colunas e pra detectar degrau invertido (nível mais alto pagando
// menos que o anterior na mesma família).
import type { CargoSeniority } from "@/generated/prisma/enums";

export const SENIORITY_ORDER: CargoSeniority[] = [
  "ESTAGIO",
  "APRENDIZ",
  "JUNIOR",
  "PLENO",
  "SENIOR",
  "ESPECIALISTA",
  "COORDENACAO",
  "GERENCIA",
  "DIRETORIA",
];

export const SENIORITY_LABEL: Record<CargoSeniority, string> = {
  ESTAGIO: "Estágio",
  APRENDIZ: "Aprendiz",
  JUNIOR: "Júnior",
  PLENO: "Pleno",
  SENIOR: "Sênior",
  ESPECIALISTA: "Especialista",
  COORDENACAO: "Coordenação",
  GERENCIA: "Gerência",
  DIRETORIA: "Diretoria",
};

export function seniorityIndex(s: CargoSeniority | null): number {
  if (!s) return -1;
  const i = SENIORITY_ORDER.indexOf(s);
  return i === -1 ? -1 : i;
}

export const SEM_FAMILIA = "__sem_familia__";

export type CargoLike = {
  id: string;
  name: string;
  family: string | null;
  seniority: CargoSeniority | null;
  area: string | null;
  companyName: string;
  peopleCount: number;
  salaryRangeMin: number | null;
  salaryRangeMid: number | null;
  salaryRangeMax: number | null;
};

export type FamiliaGroup = {
  family: string;
  /** Rótulo de exibição — cargos sem família caem num grupo próprio. */
  label: string;
  cargos: CargoLike[];
  totalPessoas: number;
  /** Nível cuja faixa inicial é menor que a do nível anterior da trilha. */
  degrausInvertidos: { cargo: CargoLike; anterior: CargoLike }[];
};

// Agrupa por família e ordena cada família pela trilha de senioridade. Cargo
// sem nível vai pro fim do grupo (não tem posição na trilha).
export function agruparPorFamilia(cargos: CargoLike[]): FamiliaGroup[] {
  const byFamily = new Map<string, CargoLike[]>();
  for (const c of cargos) {
    const key = c.family?.trim() || SEM_FAMILIA;
    const list = byFamily.get(key);
    if (list) list.push(c);
    else byFamily.set(key, [c]);
  }

  const groups: FamiliaGroup[] = [];
  for (const [family, list] of byFamily) {
    const ordered = [...list].sort((a, b) => {
      const ia = seniorityIndex(a.seniority);
      const ib = seniorityIndex(b.seniority);
      if (ia !== ib) {
        if (ia === -1) return 1; // sem nível vai pro fim
        if (ib === -1) return -1;
        return ia - ib;
      }
      return a.name.localeCompare(b.name, "pt-BR");
    });

    groups.push({
      family,
      label: family === SEM_FAMILIA ? "Sem família definida" : family,
      cargos: ordered,
      totalPessoas: ordered.reduce((sum, c) => sum + c.peopleCount, 0),
      degrausInvertidos: detectarDegrausInvertidos(ordered),
    });
  }

  // Família sem nome sempre por último; o resto alfabético.
  return groups.sort((a, b) => {
    if (a.family === SEM_FAMILIA) return 1;
    if (b.family === SEM_FAMILIA) return -1;
    return a.label.localeCompare(b.label, "pt-BR");
  });
}

// Degrau invertido: subir de nível na mesma família deveria elevar (ou ao menos
// manter) a faixa. Quando o piso do nível seguinte é MENOR que o do anterior, a
// trilha de progressão está incoerente — é o tipo de distorção estrutural que o
// levantamento pede pra identificar na implantação.
export function detectarDegrausInvertidos(
  cargosOrdenados: CargoLike[]
): { cargo: CargoLike; anterior: CargoLike }[] {
  const comNivelEFaixa = cargosOrdenados.filter(
    (c) => seniorityIndex(c.seniority) >= 0 && c.salaryRangeMin != null
  );

  const problemas: { cargo: CargoLike; anterior: CargoLike }[] = [];
  for (let i = 1; i < comNivelEFaixa.length; i++) {
    const atual = comNivelEFaixa[i]!;
    const anterior = comNivelEFaixa[i - 1]!;
    // Só compara níveis diferentes — dois cargos do mesmo nível podem ter
    // faixas distintas legitimamente (empresas ou áreas diferentes).
    if (seniorityIndex(atual.seniority) === seniorityIndex(anterior.seniority)) continue;
    if (atual.salaryRangeMin! < anterior.salaryRangeMin!) {
      problemas.push({ cargo: atual, anterior });
    }
  }
  return problemas;
}

// ─── Padronização de nomenclatura ────────────────────────────────────────────

// "Padronização de nomenclaturas de cargos" do escopo: nomes que só diferem em
// caixa/acento/espaço são quase sempre o mesmo cargo cadastrado duas vezes em
// empresas diferentes. Não corrige sozinho — aponta pra decisão humana.
export function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // marcas de acento separadas pelo NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type DivergenciaNome = { normalizado: string; variantes: { nome: string; empresa: string }[] };

export function detectarDivergenciasNome(
  cargos: { name: string; companyName: string }[]
): DivergenciaNome[] {
  const byNorm = new Map<string, { nome: string; empresa: string }[]>();
  for (const c of cargos) {
    const key = normalizarNome(c.name);
    if (!key) continue;
    const list = byNorm.get(key);
    if (list) list.push({ nome: c.name, empresa: c.companyName });
    else byNorm.set(key, [{ nome: c.name, empresa: c.companyName }]);
  }

  const divergencias: DivergenciaNome[] = [];
  for (const [normalizado, variantes] of byNorm) {
    // Só é divergência se a grafia EXATA varia — mesmo nome repetido em
    // empresas diferentes com a mesma grafia é padronização correta.
    const grafias = new Set(variantes.map((v) => v.nome));
    if (grafias.size > 1) divergencias.push({ normalizado, variantes });
  }
  return divergencias.sort((a, b) => b.variantes.length - a.variantes.length);
}
