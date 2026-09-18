// Alvará de Licença para Localização — Curitiba.
//
// ─── Este portal deixou de ser onde se acompanha ────────────────────────────
//
// Levantado no próprio site em 11/09/2026, consultando a inscrição municipal da
// 41 Contabilidade: a consulta é pública, de um campo só, e devolve a página
// inteira.
//
// **Em 15/09 o setor esclareceu que não é aqui que se acompanha o alvará.**
// Abertura de empresa, alteração de endereço e alteração de atividades seguem
// todas as licenças dentro do site da Junta Comercial, e a prefeitura integra —
// o acompanhamento é o painel da Junta (ver `junta.ts`), cujo layout é o mesmo
// em qualquer município. O site de Curitiba **é usado só para imprimir** o
// alvará já emitido.
//
// Então este arquivo é o **passo de impressão**, não um observador: consultar a
// inscrição, marcar o aceite e imprimir. O robô só chega aqui depois de a Junta
// mostrar o alvará emitido — e qualquer tela que não seja "alvará encontrado"
// vai para uma pessoa conferir, em vez de virar estado no sistema.
//
// ─── Sobre o reCAPTCHA ──────────────────────────────────────────────────────
//
// A página carrega reCAPTCHA v3, que é **invisível**: não há desafio, ele
// apenas pontua a sessão em segundo plano. Eu havia concluído que isso
// inviabilizava robô e que seria preciso pedir acesso à API da Prefeitura —
// **estava errado**, e o Kauan mostrou fazendo o processo à mão sem ver captcha
// nenhum.
//
// A consulta foi refeita em 11/09 **dirigindo o navegador**, preenchendo o
// campo e clicando em Consultar como uma pessoa faria, e funcionou. Deixar o
// reCAPTCHA rodar normalmente não é contorná-lo; o que este código não faz, e
// não deve fazer, é forjar token ou usar serviço de resolução.
//
// A consequência prática: o robô do alvará **precisa de navegador**, não de
// cliente HTTP. Chamar a API direto sem o token da página é o caminho que não
// se sabe se funciona, e é o que ficaria dependendo de acesso concedido.

export const SIGLA = "ALV";

export const CONSULTA =
  "https://alvarafuncionamento.curitiba.pr.gov.br/client/alvara-licenca-localizacao";

/**
 * A inscrição municipal tem 8 dígitos.
 *
 * O site a exibe formatada — `17 19 804.925-8` — e aceita só os oito números.
 * Normalizar antes evita a classe de erro mais boba: mandar a máscara e receber
 * "não encontrado", registrando isso como se a empresa não tivesse alvará.
 */
const OITO_DIGITOS = /^\d{8}$/;

export function normalizarInscricao(valor: string): string {
  return valor.replace(/\D/g, "");
}

export function inscricaoValida(valor: string | null): boolean {
  if (!valor) return false;
  return OITO_DIGITOS.test(normalizarInscricao(valor));
}

/**
 * O que a página mostra quando encontra o alvará.
 *
 * Campos observados, na ordem em que aparecem. `indicacaoFiscal` veio vazia na
 * consulta de 11/09 — por isso é opcional, e não obrigatória: tratar campo que
 * às vezes vem como sempre presente é o que faz um robô falhar no segundo
 * cliente.
 */
export type AlvaraEncontrado = {
  /** O número do alvará, no topo da página. Ex.: "1.700.407". */
  numero: string;
  inscricaoMunicipal: string;
  cnpj: string;
  indicacaoFiscal: string | null;
  nomeEmpresarial: string;
  atividadePrincipal: string;
  /**
   * A linha de observações, verbatim.
   *
   * Ex.: "Alvará emitido pelo Protocolo PRP2151987803, em 11/08/2023." É de
   * onde sai o protocolo de origem e a data de emissão — e guardar o texto
   * inteiro, além do que foi extraído dele, é o que permite reprocessar quando
   * a extração se revelar incompleta.
   */
  observacoes: string;
};

/**
 * O protocolo e a data de emissão, extraídos das observações.
 *
 * Devolve `null` quando o texto não tem a forma esperada, em vez de tentar
 * adivinhar: a observação é campo livre do órgão, e um regex que force um
 * casamento produziria data errada na ficha da empresa.
 */
export function lerObservacoes(
  observacoes: string
): { protocolo: string; emitidoEm: string } | null {
  const m = /Protocolo\s+([A-Z0-9]+),\s*em\s+(\d{2}\/\d{2}\/\d{4})/i.exec(observacoes);
  if (!m) return null;
  return { protocolo: m[1]!, emitidoEm: m[2]! };
}

export type LeituraDoAlvara =
  | { tipo: "encontrado"; dados: AlvaraEncontrado }
  /**
   * A inscrição existe mas não há alvará a imprimir.
   *
   * Continua sem print, e **deixou de bloquear**: desde 15/09 o robô só abre
   * esta consulta depois de a Junta mostrar o alvará emitido, então chegar aqui
   * e não achar alvará é divergência entre os dois órgãos — caso de uma pessoa
   * olhar, não de o robô decidir. Vale para `nao_encontrado` também.
   */
  | { tipo: "sem_alvara" }
  | { tipo: "nao_encontrado" };

export class TelaNaoObservada extends Error {
  constructor(oQueFalta: string) {
    super(
      `Alvará de Curitiba: ${oQueFalta}. Ver ALV-1 no formulário do Societário.`
    );
    this.name = "TelaNaoObservada";
  }
}

/**
 * O passo seguinte à consulta: o aceite e a impressão.
 *
 * A página pede marcar "Li e concordo" — declaração sobre legislação de
 * acessibilidade — antes de liberar "Imprimir Alvará".
 *
 * É um aceite de termo em nome do cliente, e quem marca assume a declaração.
 * Em 11/09 o desenho era o robô parar aqui e a impressão ficar com gente;
 * **em 15/09 o Kauan decidiu o contrário: o robô marca sozinho e imprime** —
 * é a decisão explícita de quem responde pelo escritório que aquele desenho
 * pedia, e ela foi tomada.
 *
 * O que a decisão obriga em troca: **cada aceite marcado pelo robô fica
 * registrado** — empresa, inscrição e data. Assumir a declaração em nome do
 * cliente sem deixar rastro de quando e para quem seria o mesmo que ninguém ter
 * assumido.
 *
 * O texto fica guardado verbatim porque é o que foi aceito. Se a prefeitura
 * mudar a redação, o robô precisa parar e alguém precisa reler — comparar com
 * esta constante é como se percebe.
 */
export const ACEITE_ANTES_DE_IMPRIMIR =
  "Estou ciente da legislação específica de acessibilidade e, caso o estabelecimento " +
  "comercial não as atenda integralmente, adequarei para início das atividades.";

/**
 * O que ainda falta para o robô existir.
 *
 * Um item. Os outros dois caíram em 15/09: o aceite foi decidido (o robô marca
 * e imprime), e as telas de "sem alvará" e "não encontrado" deixaram de ser
 * bloqueio — viraram divergência entre a Junta e a prefeitura, que vai para uma
 * pessoa.
 *
 * O arquivamento segue a convenção do Bombeiros (ALV-3), que já está em
 * `src/lib/societario/arquivamento.ts`: `Societário › Prefeitura › <órgão> ›
 * <ano>`, arquivo `<EMPRESA> - <tipo> <ano>`.
 */
export const CONTRATO_PENDENTE = [
  "Como o PDF do alvará sai da página depois do aceite: download direto, nova aba ou diálogo de impressão",
] as const;
