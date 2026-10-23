export const MODULO_CONTABIL = "contabil_sped";
export const TIPOS_CONTABEIS = { entradas: "Notas de entrada", apoio: "Pagamentos sem nota", saidas: "Faturamento" } as const;
export type TipoContabil = keyof typeof TIPOS_CONTABEIS;
export type Linha = Record<string, unknown>;
export type ContextoContabil = { cnpj: string; periodo: string; tipos: TipoContabil[]; incluir_dominio: boolean };
export type EstabelecimentoContabil = { cnpj: string; nome: string; codigo_dominio: string; matriz: boolean };
export type ConfiguracaoContabil = {
  estabelecimentos: EstabelecimentoContabil[]; competencias: string[]; escrita: boolean;
  recentes?: { id: string; contexto: ContextoContabil; operacao: string; estado: string; criado_em: string }[];
  permissoes: { agir: boolean; excluir: boolean };
};
export type PendenciaContabil = {
  id: string; tipo: TipoContabil; cnpj_fornecedor: string; nome: string; cfop: string;
  qtd: number; valor: string; motivo: string; categoria?: string; falta?: string;
  chave_nome?: string; sugestao?: Linha | null; competencias: string[];
};
export type SecaoContabil = {
  tipo: TipoContabil; competencia: string; estado: "pronto" | "sem_movimento" | "origem_ausente";
  documentos: number; documentos_pendentes: number; lancamentos: number; valor: string; valor_pendente: string;
  pendencias: PendenciaContabil[]; descartados: Linha[]; linhas: Linha[]; avisos: string[];
  origem: string; destino: string; regras_fixas?: Linha[];
};
export type ArquivoContabil = { chave: string; nome: string; tamanho: number; tipo: TipoContabil };
export type PedidoContabil = {
  id: string; formato?: string; estado: "pendente" | "executando" | "concluida" | "erro" | "parada";
  contexto: ContextoContabil; operacao: "conferir" | "gerar"; revisao: string; desatualizado: boolean;
  progresso: { concluidos: number; total: number; etapa: string }; erro: string | null;
  secoes: SecaoContabil[]; arquivos: ArquivoContabil[];
};
export type RegrasContabeis = { fornecedor: Linha[]; cfop: Linha[]; categoria: Linha[]; nome: Linha[]; categorias?: { categoria: string; rotulo: string }[] };
export type PreviaCsv = { hash: string; inclusoes: number; atualizacoes: number; ignoradas: number; erros: string[]; amostra: Linha[] };
