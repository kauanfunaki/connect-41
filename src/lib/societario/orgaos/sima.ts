// SIMA — o portal de Meio Ambiente de Curitiba.
//
// Traduzido do procedimento em `docs/fluxos/societario-robos.html`, que é o
// único dos seis com o **caminho de volta** descrito: login → Minhas
// solicitações → Ver detalhes. Por isso é o candidato a primeiro observador de
// verdade.
//
// ─── O que este arquivo NÃO faz, e por quê ──────────────────────────────────
//
// Não lê a página. O procedimento do setor descreve os passos que uma pessoa
// segue, e não contém nada do que um robô precisa para ler: nenhum seletor,
// nenhum nome de campo, e — o que mais importa — **nenhum texto que a página
// mostra em cada desfecho**.
//
// Escrever o matcher sem isso seria inventar o critério que decide "deferido", e
// marcar um processo como deferido sem ser é o pior defeito possível desta
// automação: o setor para de acompanhar, o prazo do órgão corre, e a exigência
// só aparece quando já custou.
//
// Então o que existe aqui é o que sabemos de fato (endereços, formato de
// protocolo, a regra do login) e **falhas explícitas** nos dois pontos que
// dependem do levantamento. Uma sessão com o portal aberto fecha isso — o que
// falta está listado em `CONTRATO_PENDENTE`, abaixo.

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
 * `certificado_nuvem` é a que muda a arquitetura do robô: o A1 **não precisa
 * morar na máquina dele**. A autenticação acontece no provedor, que expõe
 * fluxo próprio — em geral com PIN ou aprovação em aplicativo, o que pode
 * colocar uma pessoa no laço a cada login. Qual dos quatro provedores a 41 usa
 * decide se esse laço existe.
 *
 * `e-Cidadão` é autenticação **compartilhada de Curitiba**: resolver uma vez
 * provavelmente cobre também o Licenciamento Sanitário, que é do mesmo
 * município. Vale confirmar antes de tratar como dois problemas.
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
 * Vive em código, e não num documento à parte, porque é a lista que alguém
 * consulta no momento em que abre o portal para levantar — e documento separado
 * é o que fica desatualizado.
 */
export const CONTRATO_PENDENTE = [
  "Qual das quatro portas a 41 usa hoje, e — se for nuvem — qual provedor dos quatro",
  "Se o provedor de nuvem escolhido permite autenticar sem aprovação humana a cada login",
  // Levantado com o Kauan em 11/09: os A1 vivem no `certmgr` — o repositório de
  // certificados do Windows. Um robô em container Linux não enxerga aquilo. Ou
  // o robô roda em host Windows com o certificado instalado, ou o .pfx vai para
  // o cofre — e o .pfx só sai de lá se tiver sido importado como exportável,
  // que é escolha feita no momento da instalação e não dá para desfazer depois.
  "Se os A1 no certmgr foram importados como exportáveis (marca a chave privada como exportável)",
  "A URL exata de 'Minhas solicitações' e a de 'Ver detalhes' de um protocolo",
  "O texto que a página mostra quando o pedido está EM ANÁLISE",
  "O texto que a página mostra quando o pedido foi DEFERIDO",
  "O texto que a página mostra quando há EXIGÊNCIA, e onde fica a descrição dela",
  "Como a DAM aparece (link, botão, PDF embutido) e se dá para baixá-la sem clique",
  "O que a página mostra quando o protocolo não existe naquele login",
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

export type TextoDaConsulta = {
  /** O texto visível da página de detalhes, já extraído. */
  texto: string;
};

/**
 * Classifica o desfecho a partir do texto da página.
 *
 * **Separada da navegação de propósito.** Assim que alguém trouxer as três
 * frases que o portal usa, esta função vira uma tabela de padrões e ganha teste
 * com texto real — sem precisar de portal, certificado nem rede.
 *
 * É a peça que decide se um processo está deferido. Ela recusa enquanto não
 * souber: devolver "pendente" por não reconhecer o texto seria pior, porque um
 * deferimento passaria despercebido e o setor não saberia que parou de olhar.
 */
export function classificarDesfecho(_pagina: TextoDaConsulta): LeituraDoOrgao {
  throw new ContratoNaoLevantado("os textos de análise, deferimento e exigência");
}

/**
 * O observador do SIMA.
 *
 * Registrar em `OBSERVADORES.MA` só depois que os dois pontos acima existirem.
 * Enquanto isso o cron pula este órgão — que é o comportamento correto: o setor
 * segue conferindo à mão, como sempre fez, e ninguém recebe informação
 * inventada.
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
