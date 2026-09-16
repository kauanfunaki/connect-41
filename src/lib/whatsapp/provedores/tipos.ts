// O contrato de um provedor de WhatsApp.
//
// ─── Por que existe ─────────────────────────────────────────────────────────
//
// O atendimento de 11/09 nasceu para a Meta Cloud API, e quatro coisas nele
// são da Meta e de mais ninguém: como o webhook se autentica (HMAC com o App
// Secret), o formato do envelope, o endpoint de envio e a política (janela de
// 24h, 4096 caracteres). O resto — decidir se o robô responde, falar com o
// agente, opt-out, transferência, as telas, as tabelas — é igual qualquer que
// seja o número do outro lado.
//
// Em 14/09 o Kauan decidiu testar com a Evolution API num número pessoal antes
// de ir para a BM da Meta. Em vez de um `if (evolution)` espalhado pelo
// atendimento, as quatro coisas viraram esta interface, e cada provedor é um
// arquivo em `provedores/`.

/** A configuração decifrada da integração — os campos que o catálogo declara. */
export type ConfigDoProvedor = Record<string, string>;

/** Uma mensagem de texto recebida, já sem o envelope do provedor. */
export type MensagemRecebida = {
  /**
   * Id da mensagem no provedor. É a chave de idempotência (`WhatsappMessage.waMessageId`,
   * único): provedor que reentrega o mesmo evento esbarra nela e não gera
   * segunda resposta ao candidato.
   */
  waMessageId: string;
  /** Telefone de quem mandou, só dígitos com DDI, sem "+". */
  de: string;
  texto: string;
  recebidaEm: Date;
  /** O nome que a pessoa pôs no próprio perfil. Não é cadastro. */
  nomeDoPerfil: string | null;
};

/**
 * Um arquivo mandado como documento. `referencia` é opaca: é o que o próprio
 * provedor precisa de volta para baixar (na Evolution, a mensagem inteira), e o
 * atendimento só a repassa.
 */
export type DocumentoRecebido = {
  nomeDoArquivo: string | null;
  mimetype: string | null;
  /** Tamanho declarado pelo WhatsApp, antes de baixar. `null` quando não veio. */
  tamanhoBytes: number | null;
  referencia: unknown;
};

/**
 * Mensagem que chegou mas não é texto — áudio, imagem, documento. Vai para uma
 * pessoa, a não ser que seja um documento que o atendimento sabe tratar (hoje,
 * currículo em PDF).
 */
export type MensagemIgnorada = { waMessageId: string; tipo: string; de: string; documento?: DocumentoRecebido };

export type MidiaBaixada =
  | { ok: true; bytes: Buffer; mimetype: string | null; nomeDoArquivo: string | null }
  | { ok: false; erro: string };

export type EventoRecebido = {
  mensagens: MensagemRecebida[];
  ignoradas: MensagemIgnorada[];
  /**
   * O evento só traz atualização de status (entregue, lido) ou nada que nos
   * interesse. É a maior parte do volume e sai cedo, com 200.
   */
  somenteStatus: boolean;
};

export type VerificacaoDoWebhook = { ok: true } | { ok: false; motivo: string };

export type ResultadoDoEnvio =
  | { ok: true; waMessageId: string | null }
  | { ok: false; erro: string };

export type PoliticaDoProvedor = {
  /**
   * Horas depois da última mensagem recebida em que mensagem livre ainda sai.
   * `null` = o provedor não tem janela (a Evolution não tem; a Meta tem 24h).
   */
  janelaLivreHoras: number | null;
  /** Tamanho máximo de uma mensagem de texto. */
  maxCaracteres: number;
};

export type RequisicaoDoWebhook = {
  /** O corpo exatamente como chegou — assinatura é sobre os bytes, não sobre o JSON. */
  corpoBruto: string;
  cabecalhos: Headers;
  url: URL;
};

export interface ProvedorWhatsapp {
  /** O `integrationCode` em `INTEGRATION_CATALOG` que este provedor atende. */
  codigo: string;
  politica: PoliticaDoProvedor;

  /**
   * A verificação de posse por GET, quando o provedor faz uma (a Meta faz, ao
   * cadastrar o webhook). Ausente = o provedor não verifica, e o GET responde 405.
   */
  verificarPosse?(url: URL, config: ConfigDoProvedor): { ok: true; resposta: string } | { ok: false; motivo: string };

  /**
   * Quem chamou é mesmo o provedor?
   *
   * A rota é pública e o id na URL não é segredo: **só isto** separa uma
   * mensagem de candidato de alguém inventando uma. Não pode lançar — exceção
   * aqui viraria 500, e 500 é pedido de reentrega.
   */
  autenticar(req: RequisicaoDoWebhook, config: ConfigDoProvedor): VerificacaoDoWebhook;

  /** Lê o evento inteiro. Lixo e formato inesperado devolvem listas vazias, nunca lançam. */
  lerEvento(payload: unknown): EventoRecebido;

  /** Manda um texto. Não lança: devolve o erro, porque quem chama está no meio de um webhook. */
  enviarTexto(config: ConfigDoProvedor, paraE164: string, texto: string): Promise<ResultadoDoEnvio>;

  /**
   * O número está conectado? Ausente = o provedor não tem como informar (a Meta,
   * por enquanto: o contrato dela não foi conferido). Não lança: provedor fora
   * do ar é justamente um dos estados que a tela precisa mostrar.
   */
  consultarConexao?(config: ConfigDoProvedor): Promise<EstadoDaConexao>;

  /**
   * Baixa o arquivo de um documento recebido. Ausente = o provedor não sabe
   * baixar (a Meta, por enquanto), e o documento vai para uma pessoa como antes.
   * Não lança.
   */
  baixarMidia?(config: ConfigDoProvedor, referencia: unknown): Promise<MidiaBaixada>;
}

/**
 * O estado do número, como a tela mostra. `indisponivel` é "não deu para
 * perguntar" (credencial errada, instância inexistente, servidor fora) — e é
 * diferente de `desconectado`, que é o provedor respondendo que o WhatsApp caiu.
 */
export type EstadoDaConexao = {
  estado: "conectado" | "conectando" | "desconectado" | "indisponivel";
  detalhe: string | null;
};
