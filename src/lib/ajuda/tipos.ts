// O artigo da base de conhecimento (02/10/2026): o passo a passo de uma tela.
//
// Decisão de 30/09: a base mora dentro do Connect, o Claude escreve os artigos
// iniciais lendo o código e a equipe revisa e grava os vídeos. Ficam no código,
// e não no banco, para a revisão passar pelo PR — e para o "?" de cada tela
// achar o artigo sem consulta.

export type SecaoDoArtigo = {
  /** "Como abrir uma transferência" — uma tarefa só por seção. */
  titulo: string;
  /** Os passos, em ordem, com os nomes de botão como estão na tela. */
  passos: string[];
};

export type ArtigoDeAjuda = {
  /**
   * O código do módulo (`module-catalog.ts`) ou, nas telas que não são módulo,
   * `geral:<nome>` (ex.: `geral:transferencias`). Vira o endereço `/ajuda/<chave>`.
   */
  chave: string;
  /** O nome da tela, como no menu. */
  titulo: string;
  /**
   * As rotas que o artigo explica. O "?" do topo abre este artigo quando a tela
   * atual começa por uma delas (a mais específica ganha).
   */
  caminhos: string[];
  /** Uma ou duas frases: para que a tela serve. */
  resumo: string;
  secoes: SecaoDoArtigo[];
  /** Regras e avisos curtos: quem vê, o que não dá para desfazer. */
  dicas?: string[];
  /** Vídeo no YouTube (não listado). Vazio até a equipe gravar e subir. */
  video?: string;
};
