// O que a página do Repositório de fluxos entrega às telas de cliente
// (10/11/2026, pedido do Kauan). Só tipos: a tela de cliente importa daqui sem
// puxar o Prisma.

import type { Etapa } from "./etapas";

export type FluxoNaArvore = { id: string; titulo: string; versao: number };
export type PastaDaArvore = { id: string; titulo: string; icone: string | null; fluxos: FluxoNaArvore[] };

export type AnexoDoFluxo = {
  id: string;
  nome: string;
  mime: string;
  tamanho: number;
  /** Imagem e PDF abrem no navegador; o .drawio só baixa. */
  previa: boolean;
  /** ISO. */
  enviadoEm: string;
  enviadoPor: string | null;
};

export type VersaoNoHistorico = { versao: number; salvaEm: string; salvaPor: string };

export type FluxoAberto = {
  id: string;
  pastaId: string;
  titulo: string;
  donoId: string | null;
  /** Nulo com dono: a pessoa saiu do escritório. */
  donoNome: string | null;
  /** "AAAA-MM-DD". */
  revisadoEm: string | null;
  /** 0: criado e ainda sem "Salvar versão". */
  versao: number;
  metodologia: string | null;
  etapas: Etapa[];
  anexos: AnexoDoFluxo[];
  versoes: VersaoNoHistorico[];
};

/** Uma versão antiga, aberta em "Ver esta versão" — só leitura. */
export type VersaoAberta = {
  versao: number;
  titulo: string;
  etapas: Etapa[];
  metodologia: string | null;
  revisadoEm: string | null;
  salvaEm: string;
  salvaPor: string;
};

export type Pessoa = { id: string; nome: string };
export type OpcaoDeSetor = { codigo: string; rotulo: string };
export type OpcaoDeTela = { href: string; rotulo: string };
