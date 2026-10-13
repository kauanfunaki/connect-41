// Os tipos que vão e voltam entre a tela e o servidor na exclusão — sem
// Prisma, para o diálogo (componente de cliente) poder importar.

/** O cadastro que se exclui, no vocabulário da tela. */
export type TipoDeCadastro = "empresa" | "pessoa" | "usuario";

/** O que acontece com uma coisa ligada. */
export type Efeito = "apagar" | "desligar" | "reatribuir";

export type ItemDaPrevia = {
  /** Estável, para a lista do React ("FiscalDocument.companyId"). */
  chave: string;
  /** Já com o número: "312 notas fiscais". */
  texto: string;
  quantidade: number;
  efeito: Efeito;
  /** Se há um que seja, a exclusão pede o nome digitado. */
  historico: boolean;
};

/** A caixa de marcar do diálogo — "Excluir também os 12 funcionários". */
export type OpcaoDaExclusao = {
  rotulo: string;
  ajuda?: string;
  /** Marcar a caixa traz histórico junto: a exclusão passa a pedir o nome. */
  trazHistorico: boolean;
  /** O que vem junto quando a caixa está marcada, já com o número. */
  itens: ItemDaPrevia[];
};

export type Previa = {
  tipo: TipoDeCadastro;
  id: string;
  /** O que a pessoa digita para confirmar — exatamente o nome mostrado. */
  nome: string;
  /** CNPJ, CPF ou e-mail, formatado. */
  detalhe: string | null;
  /** Só o que tem quantidade. */
  itens: ItemDaPrevia[];
  temHistorico: boolean;
  /**
   * Motivo para não excluir de jeito nenhum por aqui (ex.: empresa com mais
   * de 2.000 notas fiscais). Com bloqueio, o diálogo só explica.
   */
  bloqueio: string | null;
  /** Frases soltas que a pessoa precisa ler antes — "a conta de acesso continua". */
  avisos: string[];
  opcao: OpcaoDaExclusao | null;
  /** O botão do modo com histórico: "Excluir com tudo o que está ligado". */
  rotuloDoModoCompleto: string;
};

export type ModoDaExclusao = "simples" | "completo";

export type PedidoDeExclusao = {
  tipo: TipoDeCadastro;
  id: string;
  modo: ModoDaExclusao;
  /** O nome digitado. Obrigatório no modo completo. */
  confirmacao?: string;
  /** A caixa de marcar da prévia (funcionários da empresa, ficha da pessoa do usuário). */
  incluirOpcao?: boolean;
};

export type ResultadoDaExclusao =
  | {
      ok: true;
      nome: string;
      /** O que saiu, já com o número: "312 notas fiscais". */
      resumo: string[];
      /** Arquivos que não saíram do disco (ficam órfãos, sem aparecer para ninguém). */
      arquivosNaoApagados: number;
      /** Para onde a tela volta. */
      destino: string;
    }
  | { ok: false; erro: string };

/** Exclusão em massa de empresas: o que saiu e o que ficou, com o porquê. */
export type ResultadoEmMassa = {
  excluidas: { id: string; nome: string }[];
  recusadas: { id: string; nome: string; motivo: string }[];
};

