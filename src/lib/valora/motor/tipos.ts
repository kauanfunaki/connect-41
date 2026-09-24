// Motor do Valora — tipos. Sem Next, sem Prisma, sem React: este diretório é copiado tal e qual
// para o 41-gestao por scripts/valora/sincronizar-motor.mjs. Editar só aqui, no Connect.

export type Regime = "MEI" | "SIMPLES" | "PRESUMIDO" | "REAL";

export const REGIMES: Regime[] = ["MEI", "SIMPLES", "PRESUMIDO", "REAL"];

export type Frequencia = "mensal" | "trimestral" | "anual" | "evento";

/** Quantas vezes a atividade acontece por mês para UM cliente. */
export type Quantidade =
  /** Número fixo por mês (1 = uma vez por mês; 0,04 = rateio de um evento raro da carteira). */
  | { tipo: "fixa"; valor: number }
  /** Proporcional a um volume declarado pelo cliente (funcionários, parcelamentos…) × fator. */
  | { tipo: "volume"; campo: string; fator?: number };

export type Atividade = {
  id: string; // estável: FIS-01, DP-02…
  setor: string; // código do setor: FIS, DP, CTB…
  grupo: string;
  nome: string;
  frequencia: Frequencia;
  /** Minutos por execução, por regime. Regime ausente ou 0 = a atividade não existe nele. */
  tempoMin: Partial<Record<Regime, number>>;
  quantidade: Quantidade;
  /** Só entra se o cliente tiver o marcador (ex.: "temICMS"). Ausente = sempre. */
  condicao?: string;
  /** Entra na empresa sem movimento (em vez de ser zerada). */
  semMovimento?: boolean;
  /** Custo de entrada, cobrado uma vez — não soma na mensalidade. */
  implantacao?: boolean;
  /** Serviço cobrado por execução (abertura, alteração, baixa…): vai para a tabela de avulsos, fora da mensalidade. */
  avulso?: boolean;
};

export type Complexidade = {
  id: string;
  setor: string;
  nome: string;
  /** % a mais no tempo do setor quando o cliente tem a situação. */
  pct: number;
};

export type Setor = {
  codigo: string;
  nome: string;
  /** Horas produtivas por mês da equipe (pessoas × horas × % em cliente × férias). */
  capacidadeHorasMes: number;
  /** R$/mês da equipe do setor: salários + encargos + benefícios. 0 = ainda não informado. */
  custoMensal: number;
  /** capacidade ÷ horas declaradas da carteira; multiplica todo tempo do setor. 1 = sem ajuste. */
  fatorCalibracao: number;
  /** Minutos/mês de uma empresa sem movimento neste setor (substitui as atividades). */
  minutosSemMovimento?: number;
};

export type ParametrosPreco = {
  /** R$/mês de despesas que não são de setor produtivo (aluguel, sistemas, gestão…), rateadas por hora. */
  despesasFixasMes: number;
  /** % sobre o PREÇO: impostos, inadimplência, taxas, comissão. */
  variaveisPct: number;
  /** Margem de lucro do preço alvo, % sobre o preço. */
  margemAlvoPct: number;
  /** Margem mínima aceitável — define o piso. 0 = empata. */
  margemPisoPct: number;
  /** Desconto máximo que o comercial pode dar sobre a tabela. */
  descontoMaximoPct: number;
};

/** Pergunta do formulário do cliente. `chave` é o `campo` de uma Quantidade ou a `condicao` de uma Atividade. */
export type CampoPerfil = {
  tipo: "volume" | "marcador";
  chave: string;
  rotulo: string;
  ajuda?: string;
};

export type Catalogo = {
  setores: Setor[];
  atividades: Atividade[];
  complexidades: Complexidade[];
  campos: CampoPerfil[];
};

/** O que se sabe do cliente — sai do formulário preenchido junto com ele. */
export type Perfil = {
  regime: Regime;
  semMovimento: boolean;
  /** Setores contratados (códigos). Setor fora da lista não entra no preço. */
  setores: string[];
  volumes: Record<string, number>;
  marcadores: Record<string, boolean>;
  /** Ids de Complexidade que se aplicam ao cliente. */
  complexidades: string[];
};

export type LinhaAtividade = {
  id: string;
  setor: string;
  nome: string;
  vezesMes: number;
  minutosExecucao: number; // já calibrado
  minutosMes: number;
};

export type ResultadoSetor = {
  codigo: string;
  nome: string;
  minutosMes: number; // calibrado, com complexidade
  complexidadePct: number;
  custoDireto: number;
  rateio: number;
  custo: number;
  semCusto: boolean; // custoMensal do setor ainda não informado
  atividades: LinhaAtividade[];
};

export type Precos = {
  custo: number;
  piso: number | null;
  alvo: number | null;
  tabela: number | null;
};

/** Preço de UMA execução de um serviço avulso, para este cliente (regime e complexidade dele). */
export type LinhaAvulso = {
  id: string;
  setor: string;
  nome: string;
  minutos: number; // calibrado, com complexidade
  precos: Precos;
};

export type Resultado = {
  setores: ResultadoSetor[];
  mensal: Precos;
  implantacao: Precos;
  /** Tabela de avulsos dos setores contratados. Não soma na mensalidade nem na implantação. */
  avulsos: LinhaAvulso[];
  horasMes: number;
  avisos: string[];
};
