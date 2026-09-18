// SIMA — o portal de Meio Ambiente de Curitiba.
//
// Traduzido do procedimento em `docs/fluxos/societario-robos.html`, que é o
// único dos seis com o **caminho de volta** descrito: login → Minhas
// solicitações → Ver detalhes. Por isso é o candidato a primeiro observador de
// verdade.
//
// ─── O que este arquivo faz, e o que ainda não ──────────────────────────────
//
// Faz: a **decisão**. O levantamento de 15/09/2026 com o setor (Ruli) trouxe o
// que faltava — as abas da lista, os selos e a frase do protocolo que não é
// daquele login —, e com isso `classificarSolicitacao` deixou de ser uma falha
// explícita e virou tabela, testada com os textos reais.
//
// Não faz: a **navegação**. O SIMA não tem área pública; tudo vive atrás do
// e-Cidadão, e uma sessão autenticada depende do certificado — decisão que
// ainda está com o escritório. Sem ela não há como ver o HTML, e inventar
// seletor é o defeito que esta automação não pode ter: marcar um processo como
// deferido sem ser faz o setor parar de acompanhar, o prazo do órgão correr, e
// a exigência aparecer quando já custou.
//
// O que falta está em `CONTRATO_PENDENTE`, abaixo — de oito itens sobraram três.

import type {
  ObservadorDeOrgao,
  LeituraDoOrgao,
  DadosDoProtocolo,
} from "@/lib/societario/observador";

/** Sigla do órgão no cadastro. É por ela que o registro casa o adaptador. */
export const SIGLA = "MA";

export const SIMA_BASE = "https://sima.curitiba.pr.gov.br/";

/**
 * O SIMA **não tem área pública**.
 *
 * Levantado no portal em 11/09/2026: `sima.curitiba.pr.gov.br` redireciona
 * direto para `autenticacao-ecidadao.curitiba.pr.gov.br` — não há consulta,
 * nem página de acompanhamento, sem estar logado. Todo o robô vive atrás da
 * autenticação.
 */
export const AUTENTICACAO = "https://autenticacao-ecidadao.curitiba.pr.gov.br";

/**
 * As quatro portas do e-Cidadão, medidas na tela de login.
 *
 * **Respondido em 15/09 (MA-1, MA-2):** a 41 entra por "Entrar com Certificado
 * Digital", com o certificado da 41 ou o do cliente, e **entra direto — nenhum
 * portal pede PIN ou aprovação a cada login**. Isso tira do caminho a dúvida
 * que era o eixo do robô: não há pessoa no laço a cada sessão.
 *
 * Duas consequências que ficam:
 *
 * - **a consulta tem de usar o mesmo certificado que abriu o pedido** (MA-3),
 *   então o protocolo precisa guardar com qual foi aberto — sem isso a consulta
 *   devolve "Nenhuma solicitação encontrada" e parece protocolo inexistente;
 * - **no primeiro acesso de cada identidade** o e-Cidadão mostra "Solicitação de
 *   Permissão" com "Aceitar e entrar". É uma vez por certificado, e vale também
 *   para o LISA — autenticação de Curitiba é compartilhada.
 */
export const PORTAS_DE_ENTRADA = ["cpf", "certificado_local", "certificado_nuvem", "govbr"] as const;

/** Provedores de certificado em nuvem aceitos, medidos na tela em 11/09/2026. */
export const PROVEDORES_EM_NUVEM = ["SafeID", "BirdID", "SERPRO ID", "VIDaaS"] as const;

/**
 * O protocolo do SIMA tem prefixo e ano no formato `AFU-26002918`.
 *
 * Medido num protocolo real do setor. Validar antes de consultar evita a classe
 * de erro mais boba destes robôs: pedir ao portal um número que alguém digitou
 * errado, receber "não encontrado", e registrar isso como se o órgão tivesse
 * recusado o pedido.
 */
const FORMATO_DO_PROTOCOLO = /^[A-Z]{2,4}-\d{6,12}$/;

export function protocoloValido(numero: string | null): boolean {
  if (!numero) return false;
  return FORMATO_DO_PROTOCOLO.test(numero.trim().toUpperCase());
}

/** Normaliza o que a pessoa digitou, sem inventar dígito. */
export function normalizarProtocolo(numero: string): string {
  return numero.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * O que ainda falta para este adaptador existir.
 *
 * Eram oito; o levantamento de 15/09 fechou cinco. Vive em código, e não num
 * documento à parte, porque é a lista que alguém consulta no momento em que
 * abre o portal para levantar — documento separado é o que fica desatualizado.
 */
export const CONTRATO_PENDENTE = [
  "A URL exata de 'Minhas Solicitações' e a de 'Ver detalhes' de um protocolo",
  "O texto do selo no DETALHE quando está em análise e quando há exigência (na lista já sabemos; MA-5/MA-6 responderam 'é a mesma tela', então muda só o status)",
  "Os selos da aba Finalizado que não sejam DEFERIDO — indeferido, cancelado, arquivado",
] as const;

export class ContratoNaoLevantado extends Error {
  constructor(oQueFalta: string) {
    super(
      `SIMA: contrato da página não levantado — ${oQueFalta}. ` +
        `Ver CONTRATO_PENDENTE em src/lib/societario/orgaos/sima.ts`
    );
    this.name = "ContratoNaoLevantado";
  }
}

/**
 * As três abas de "Minhas Solicitações", com contador, observadas em 15/09.
 *
 * A aba é metade da leitura: é ela que diz se o pedido está com o órgão ou de
 * volta com o requerente. A outra metade é o selo do cartão.
 */
export const ABAS = ["Pendente", "Em análise", "Finalizado"] as const;
export type Aba = (typeof ABAS)[number];

/**
 * Os selos da aba **Pendente** que significam exigência.
 *
 * O próprio portal diz que a complementação pedida pelo analista aparece em
 * Pendente com um destes dois. "Pendente" no SIMA quer dizer pendente **do
 * requerente**, não do órgão — é o contrário do que a palavra sugere, e é por
 * isso que esta constante existe com nome em vez de virar um `if` solto.
 */
export const SELOS_DE_EXIGENCIA = ["Aguardando Envio de Documento", "Aguardando Assinatura"] as const;

/** O selo de conclusão observado no detalhe de um protocolo real (`AFU-26003257`). */
export const SELO_DEFERIDO = "DEFERIDO";

/** O que a consulta mostra quando o protocolo não é daquele login (MA-8). */
export const SEM_SOLICITACAO = "Nenhuma solicitação encontrada";

/**
 * A consulta não achou o protocolo **naquele login**.
 *
 * Erro próprio, e não "pendente", porque quase sempre não significa que o
 * pedido não existe: significa que se consultou com o certificado errado. O
 * SIMA exige consultar com o mesmo que abriu (MA-3), e tratar isso como
 * "segue pendente" esconderia uma configuração errada por semanas.
 */
export class ProtocoloForaDoLogin extends Error {
  constructor(numero: string) {
    super(
      `SIMA: "${SEM_SOLICITACAO}" para ${numero} — provavelmente a consulta usou ` +
        `certificado diferente do que abriu o pedido (MA-3).`
    );
    this.name = "ProtocoloForaDoLogin";
  }
}

export class SeloNaoObservado extends Error {
  constructor(aba: string, status: string) {
    super(
      `SIMA: selo não observado na aba "${aba}": "${status}". ` +
        `Acrescentar em SELOS_DE_EXIGENCIA ou tratar na aba Finalizado, ` +
        `em src/lib/societario/orgaos/sima.ts — depois de ver a tela, não antes.`
    );
    this.name = "SeloNaoObservado";
  }
}

/** Compara selo sem depender de acento, caixa ou espaço duplo. */
export function normalizarSelo(selo: string): string {
  return selo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

const EXIGENCIA = new Set(SELOS_DE_EXIGENCIA.map(normalizarSelo));

/**
 * Uma solicitação como a lista a mostra: a aba em que o cartão está e o selo
 * dele.
 *
 * ─── Por que não é texto livre ───────────────────────────────────────────────
 *
 * A versão anterior desta função recebia `{ texto }` — o texto visível da
 * página, para casar frases. **Não serve**, e o motivo é concreto: a página de
 * detalhe tem abas chamadas "Documentos aguardando assinatura" e "Documentos
 * aguardando envio". Procurar "Aguardando Assinatura" no texto de um protocolo
 * DEFERIDO acha o nome da aba e classifica como exigência um processo que
 * terminou. O contrário — procurar "DEFERIDO" primeiro — trocaria o erro de
 * lado.
 *
 * Então a extração entrega os dois campos separados, e a decisão fica sem
 * ambiguidade. Quem escrever a navegação paga esse preço uma vez.
 */
export type SolicitacaoNaLista = {
  aba: Aba;
  /** O selo do cartão, verbatim. */
  selo: string;
};

/**
 * O que a lista diz sobre uma solicitação.
 *
 * ─── A regra, aba por aba ────────────────────────────────────────────────────
 *
 * - **Pendente** é pendente do requerente: um dos dois selos de exigência, e
 *   qualquer outro falha — é a aba onde uma leitura errada custa mais, porque
 *   exigência não vista é prazo correndo contra o cliente.
 * - **Em análise** é o órgão trabalhando. O selo dessa aba não foi observado, e
 *   **não precisa ser**: nenhum estado dentro dela conclui o processo, então a
 *   aba sozinha já decide. Exigir um selo conhecido aqui geraria erro em todo
 *   processo normal, sem proteger nada.
 * - **Finalizado** só conclui com `DEFERIDO`. Um finalizado que não é deferido
 *   (indeferido, cancelado) é justamente o caso que não vimos, e o mais caro de
 *   confundir com deferimento — falha até alguém ver a tela.
 */
export function classificarSolicitacao(s: SolicitacaoNaLista): LeituraDoOrgao {
  switch (s.aba) {
    case "Pendente": {
      if (!EXIGENCIA.has(normalizarSelo(s.selo))) throw new SeloNaoObservado(s.aba, s.selo);
      // A descrição é o próprio selo do órgão: é o que o analista pediu, na
      // palavra dele. `decidir()` recusa exigência sem descrição.
      return { desfecho: "EXIGENCIA", detalhe: s.selo.trim() };
    }
    case "Em análise":
      return { desfecho: "PENDENTE" };
    case "Finalizado": {
      if (normalizarSelo(s.selo) !== SELO_DEFERIDO) throw new SeloNaoObservado(s.aba, s.selo);
      return { desfecho: "DEFERIDO" };
    }
  }
}

/** A consulta voltou sem nenhum cartão? (MA-8) */
export function semSolicitacao(texto: string): boolean {
  return normalizarSelo(texto).includes(normalizarSelo(SEM_SOLICITACAO));
}

/**
 * O observador do SIMA.
 *
 * A decisão já existe (`classificarSolicitacao`); falta a navegação, que só se
 * escreve com uma sessão autenticada na frente — e essa depende do certificado.
 *
 * Registrar em `OBSERVADORES.MA` só depois de a navegação existir **e** de ter
 * rodado uma vez contra a tela real. Enquanto isso o cron pula este órgão, que
 * é o comportamento correto: o setor segue conferindo à mão, como sempre fez, e
 * ninguém recebe informação inventada.
 */
export const observadorSima: ObservadorDeOrgao = async (protocolo: DadosDoProtocolo) => {
  if (!protocoloValido(protocolo.numero)) {
    // Não é falha do portal: é número que não tem a cara de um protocolo do
    // SIMA. Falhar aqui evita bater no órgão para ouvir "não encontrado" e
    // registrar isso como recusa.
    throw new Error(`número fora do formato do SIMA: ${protocolo.numero ?? "(vazio)"}`);
  }
  throw new ContratoNaoLevantado("a navegação autenticada e a leitura da página");
};
