// Os modelos da janela "Criar espaço" (05/11/2026, o "Usar modelos" do
// ClickUp): o espaço já nasce com as listas e as colunas de um trabalho comum
// do escritório contábil. Tudo se renomeia e se ajusta depois, na lista.
//
// Cada coluna diz o tipo de status (o mesmo `StageType` das colunas criadas à
// mão): a última é sempre a concluída.

import type { StageType } from "@/generated/prisma/enums";

export type ColunaDoModelo = { nome: string; cor: string; tipo: StageType };
export type ModeloDeEspaco = {
  id: string;
  nome: string;
  /** Uma linha: para que serve. */
  resumo: string;
  listas: { nome: string; descricao?: string }[];
  colunas: ColunaDoModelo[];
};

const CINZA = "#586577";
const AZUL = "#2E6FB8";
const MOSTARDA = "#C8860D";
const ROXO = "#7C5CBF";
const VERDE = "#1E8E5A";

export const MODELOS_DE_ESPACO: readonly ModeloDeEspaco[] = [
  {
    id: "fechamento",
    nome: "Fechamento mensal",
    resumo: "O mês de cada cliente, da conciliação à entrega.",
    listas: [
      { nome: "Conciliações" },
      { nome: "Apuração de impostos" },
      { nome: "Entrega ao cliente" },
    ],
    colunas: [
      { nome: "A fazer", cor: CINZA, tipo: "NOT_STARTED" },
      { nome: "Em andamento", cor: AZUL, tipo: "IN_PROGRESS" },
      { nome: "Em revisão", cor: ROXO, tipo: "PENDING" },
      { nome: "Concluído", cor: VERDE, tipo: "DONE" },
    ],
  },
  {
    id: "obrigacoes",
    nome: "Obrigações acessórias",
    resumo: "As declarações do período, separadas por esfera.",
    listas: [{ nome: "Federais" }, { nome: "Estaduais" }, { nome: "Municipais" }],
    colunas: [
      { nome: "A fazer", cor: CINZA, tipo: "NOT_STARTED" },
      { nome: "Em preparação", cor: AZUL, tipo: "IN_PROGRESS" },
      { nome: "Aguardando cliente", cor: MOSTARDA, tipo: "PENDING" },
      { nome: "Transmitida", cor: VERDE, tipo: "DONE" },
    ],
  },
  {
    id: "entrada",
    nome: "Entrada de cliente",
    resumo: "O cliente novo, dos documentos ao primeiro fechamento.",
    listas: [
      { nome: "Documentação" },
      { nome: "Cadastros e acessos" },
      { nome: "Primeiro fechamento" },
    ],
    colunas: [
      { nome: "A fazer", cor: CINZA, tipo: "NOT_STARTED" },
      { nome: "Aguardando cliente", cor: MOSTARDA, tipo: "PENDING" },
      { nome: "Em andamento", cor: AZUL, tipo: "IN_PROGRESS" },
      { nome: "Concluído", cor: VERDE, tipo: "DONE" },
    ],
  },
  {
    id: "solicitacoes",
    nome: "Solicitações de clientes",
    resumo: "O que os clientes pedem, do pedido à resposta.",
    listas: [{ nome: "Solicitações" }],
    colunas: [
      { nome: "Nova", cor: CINZA, tipo: "NOT_STARTED" },
      { nome: "Em atendimento", cor: AZUL, tipo: "IN_PROGRESS" },
      { nome: "Aguardando cliente", cor: MOSTARDA, tipo: "PENDING" },
      { nome: "Resolvida", cor: VERDE, tipo: "DONE" },
    ],
  },
];

export function modeloDeEspaco(id: unknown): ModeloDeEspaco | null {
  return typeof id === "string" ? (MODELOS_DE_ESPACO.find((m) => m.id === id) ?? null) : null;
}

/** As colunas no formato do `PipelineStage` — a última é a concluída. */
export function colunasDoModelo(modelo: ModeloDeEspaco) {
  return modelo.colunas.map((c, i) => ({
    name: c.nome,
    order: i,
    color: c.cor,
    type: c.tipo,
    isTerminal: c.tipo === "DONE",
  }));
}

// ─── Ícone do espaço ────────────────────────────────────────────────────────
// Os nomes que a janela oferece no quadrado do espaço. O nome fica no banco; o
// desenho (lucide) mora no componente, para esta lista servir ao servidor.

export const ICONES_DO_ESPACO = [
  "pasta",
  "calculadora",
  "recibo",
  "grafico",
  "predio",
  "pessoas",
  "documento",
  "calendario",
  "maleta",
  "balanca",
  "escudo",
  "estrela",
] as const;
export type IconeDoEspaco = (typeof ICONES_DO_ESPACO)[number];

export function lerIcone(valor: unknown): IconeDoEspaco | null {
  return typeof valor === "string" && (ICONES_DO_ESPACO as readonly string[]).includes(valor) ? (valor as IconeDoEspaco) : null;
}

/** A inicial que o quadrado mostra sem ícone: a primeira letra ou número do nome. */
export function inicialDoEspaco(nome: string): string {
  const letra = nome.trim().match(/[\p{L}\p{N}]/u)?.[0];
  return letra ? letra.toLocaleUpperCase("pt-BR") : "?";
}
