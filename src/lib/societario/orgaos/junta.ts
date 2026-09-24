// Junta Comercial (Empresa Fácil) — o painel de acompanhamento do processo.
//
// É **onde o alvará é acompanhado**, e não no site de alvará de Curitiba:
// abertura de empresa, alteração de endereço e alteração de atividades seguem
// todas as licenças dentro do site da Junta, e a prefeitura integra (setor, em
// 15/09/2026). O site de Curitiba ficou só com a impressão — ver
// `alvara-curitiba.ts`.
//
// O que torna este o primeiro observador que vale escrever: **o layout é o
// mesmo em qualquer município**. Um leitor serve todos os clientes, em vez de
// um por prefeitura.
//
// ─── O que está escrito aqui, e o que não está ──────────────────────────────
//
// Está: a **decisão** — dado o que o painel mostra em cada etapa, o que isso
// significa para o processo. Saiu do print do ALV-1 (15/09) e foi completada
// pelas respostas e prints da Ruli em 24/09: os selos de análise e de
// cancelamento, o caminho até o painel e onde fica o texto da exigência.
//
// Não está: a **navegação automática**, e agora pelo motivo certo. O caminho é
// conhecido (ver `ACESSO`), mas o login pelo gov.br mostra CAPTCHA — "clique no
// animal que a bola nunca toca", na maioria das vezes duas vezes. Contornar
// CAPTCHA está fora de questão (mesma decisão do Bombeiros, 15/09). O que resta
// é uma pessoa resolver o CAPTCHA e o robô ler o painel na mesma sessão —
// `CONTRATO_PENDENTE` lista o que falta para decidir se isso compensa.

import type { LeituraDoOrgao } from "@/lib/societario/observador";

/** Sigla do órgão no cadastro — a mesma do seed (`scripts/seed-societario.ts`). */
export const SIGLA = "JUCEPAR";

/**
 * Como se chega no painel, pela Ruli em 24/09.
 *
 * O número do protocolo vai em "Acompanhamento do Protocolo" na página inicial
 * do Empresa Fácil; "Acompanhar" leva ao login do gov.br, onde o escritório
 * entra **sempre com o e-CNPJ da 41** (não o do cliente, diferente do SIMA). O
 * painel de um protocolo tem endereço próprio — visto no print do PRN2676221371.
 */
export const ACESSO = {
  inicio: "https://www.empresafacil.pr.gov.br/",
  login: "gov.br, com o certificado do escritório (e-CNPJ da 41)",
  captcha: true,
} as const;

export function urlDoPainel(protocolo: string): string {
  return `https://www.empresafacil.pr.gov.br/sigfacil/processo/acompanhar/co_protocolo/${encodeURIComponent(protocolo.trim())}`;
}

/**
 * As etapas observadas no painel, na ordem em que aparecem.
 *
 * Serve de referência para quem for escrever a extração: não é uma lista
 * fechada (município com licença a mais mostra etapa a mais), e a classificação
 * abaixo **não depende** dela — trabalha com o que vier. Só entram as linhas
 * com selo: "Declaração de Responsabilidade Contador", "Contrato Social",
 * "Solicitação de Recurso" e "Reaproveitar Solicitação" são botões, não etapas.
 */
export const ETAPAS_OBSERVADAS = [
  "Dados da Coleta",
  "Ficha de Cadastro Nacional (FCN)",
  "Ato Constitutivo",
  "Solicitação",
  "Consulta Prévia",
  "Inscrição Municipal",
  "Alvará de Localização e Funcionamento",
] as const;

export type EtapaDoPainel = {
  /** O nome da etapa, como o painel escreve. */
  nome: string;
  /** O selo da etapa, verbatim. Ex.: "DEFERIDA", "EMITIDO", "EM EXIGÊNCIA". */
  status: string;
  /**
   * O texto de "Visualizar Motivos de Exigência", quando a etapa está em
   * exigência e a extração conseguiu abri-lo. Fica atrás desse botão, no mesmo
   * painel (Ruli, 24/09). Opcional porque abrir custa um clique a mais: sem ele
   * o processo ainda é classificado, só com descrição mais pobre.
   */
  exigencia?: string | null;
};

/**
 * Compara selo sem depender de acento, caixa ou espaço duplo.
 *
 * "EM EXIGÊNCIA", "Em Exigência" e "em exigencia" são o mesmo estado, e um
 * deles escapando por diferença de acento seria um processo em exigência
 * classificado como desconhecido.
 */
export function normalizarStatus(status: string): string {
  return status
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Selos que significam etapa concluída (bolinha verde no painel).
 *
 * Observados: `DEFERIDA` (Consulta Prévia), `EMITIDO` (Inscrição Municipal),
 * `COLETADA` (Dados da Coleta) e `TRANSMITIDO` (FCN). As variantes de gênero
 * entram porque são a **mesma palavra concordando com o nome da etapa**, não um
 * estado novo — "Alvará DEFERIDO" e "Consulta Prévia DEFERIDA" dizem a mesma
 * coisa.
 */
const CONCLUIDA = new Set([
  "DEFERIDA", "DEFERIDO", "EMITIDA", "EMITIDO", "COLETADA", "COLETADO", "TRANSMITIDA", "TRANSMITIDO",
]);

/** Etapa com o órgão (bolinha amarela). Observada no Ato Constitutivo em 24/09. */
const EM_ANALISE = new Set(["EM ANALISE"]);

/** Selo de etapa que voltou para o requerente (bolinha vermelha). ALV-1 e 24/09. */
const EXIGENCIA = new Set(["EM EXIGENCIA"]);

/** Processo encerrado sem deferimento (bolinha vermelha). Visto em 24/09. */
const CANCELADA = new Set(["CANCELADA", "CANCELADO"]);

export class StatusNaoObservado extends Error {
  constructor(etapa: string, status: string) {
    super(
      `Junta: selo não observado na etapa "${etapa}": "${status}". ` +
        `Acrescentar em CONCLUIDA, EM_ANALISE, EXIGENCIA ou CANCELADA em ` +
        `src/lib/societario/orgaos/junta.ts depois de ver a tela — não antes.`
    );
    this.name = "StatusNaoObservado";
  }
}

/**
 * O protocolo foi cancelado.
 *
 * Erro, e não um desfecho, porque cancelamento não é resultado que o robô
 * resolva: no caso visto em 24/09, o processo foi **reaproveitado** e ganhou
 * outro protocolo — quem acompanha precisa trocar o número, senão o robô fica
 * lendo um processo morto para sempre. Virar erro faz ele aparecer na tela do
 * protocolo para uma pessoa.
 */
export class ProtocoloCancelado extends Error {
  readonly novoProtocolo: string | null;
  constructor(novoProtocolo: string | null) {
    super(
      novoProtocolo
        ? `Junta: protocolo cancelado por reaproveitamento — o processo continua no protocolo ${novoProtocolo}.`
        : "Junta: protocolo cancelado no painel — conferir se foi reaproveitado em outro número."
    );
    this.name = "ProtocoloCancelado";
    this.novoProtocolo = novoProtocolo;
  }
}

/**
 * O protocolo novo que o aviso de reaproveitamento cita.
 *
 * Texto visto em 24/09: "ESTE PROCESSO ESTÁ CANCELADO POR TER SIDO
 * REAPROVEITADO PELO USUÁRIO … GERANDO OUTRO PROTOCOLO DE NÚMERO: PRP2523827360."
 */
export function protocoloDoReaproveitamento(aviso: string | null | undefined): string | null {
  if (!aviso) return null;
  const m = /PROTOCOLO\s+DE\s+N[UÚ]MERO:?\s*([A-Z]{2,4}\d{6,})/i.exec(aviso);
  return m ? m[1]!.toUpperCase() : null;
}

export class PainelSemEtapas extends Error {
  constructor() {
    super("Junta: painel sem nenhuma etapa com selo — a extração falhou ou o protocolo não está ali.");
    this.name = "PainelSemEtapas";
  }
}

/**
 * O que o painel inteiro diz sobre o processo.
 *
 * ─── As regras, na ordem em que valem ─────────────────────────────────────
 *
 * 0. **Cancelada em qualquer etapa encerra a leitura** com `ProtocoloCancelado`
 *    — o processo morreu ou mudou de número, e isso é para uma pessoa.
 * 1. **Exigência em qualquer etapa ganha.** É o único estado que precisa de uma
 *    pessoa, e ela precisa saber hoje: o prazo do órgão corre enquanto o
 *    processo espera o escritório.
 * 2. **Deferido só quando todas as etapas estão concluídas.** O processo na
 *    Junta é a soma das licenças; dar por encerrado com o alvará ainda em
 *    análise é o erro que faz o setor parar de acompanhar cedo demais.
 * 3. **O resto é pendente** — em análise, ou parte concluída e parte não —, que
 *    é o caso comum e não precisa de ninguém.
 *
 * `aviso` é a caixa "ATENÇÃO" do painel, quando existe; é dela que sai o
 * protocolo novo de um processo reaproveitado.
 *
 * ─── Por que selo desconhecido falha em vez de virar "pendente" ───────────
 *
 * Porque a partir do dia em que o robô existe, ninguém abre mais o painel à
 * mão. Um selo que não reconhecemos virando "pendente" é um processo que fica
 * parado sem que ninguém saiba que o robô não entendeu; virando erro, ele
 * aparece em `checkError` na tela do protocolo e alguém olha. A mensagem leva o
 * texto verbatim de propósito: completar a tabela é uma linha, depois de ver.
 */
export function classificarPainel(etapas: EtapaDoPainel[], aviso?: string | null): LeituraDoOrgao {
  if (etapas.length === 0) throw new PainelSemEtapas();

  for (const e of etapas) {
    const s = normalizarStatus(e.status);
    if (!CONCLUIDA.has(s) && !EM_ANALISE.has(s) && !EXIGENCIA.has(s) && !CANCELADA.has(s)) {
      throw new StatusNaoObservado(e.nome, e.status);
    }
  }

  if (etapas.some((e) => CANCELADA.has(normalizarStatus(e.status)))) {
    throw new ProtocoloCancelado(protocoloDoReaproveitamento(aviso));
  }

  const emExigencia = etapas.filter((e) => EXIGENCIA.has(normalizarStatus(e.status)));
  if (emExigencia.length > 0) {
    return { desfecho: "EXIGENCIA", detalhe: descricaoDaExigencia(emExigencia) };
  }

  if (etapas.every((e) => CONCLUIDA.has(normalizarStatus(e.status)))) {
    return { desfecho: "DEFERIDO" };
  }

  return { desfecho: "PENDENTE" };
}

/**
 * A descrição que vai para a exigência gravada no processo.
 *
 * Quando o painel deu o texto, é ele que vale — palavra do órgão. Quando não
 * deu, dizemos **qual etapa** travou e que o texto está no painel: é menos do
 * que o ideal e mais do que nada, e `decidir()` recusa exigência sem descrição
 * (ver `observador.ts`), o que deixaria o processo pendente em silêncio.
 *
 * O prefixo existe para ninguém confundir o que escrevemos com o que o órgão
 * escreveu — a pessoa que lê a exigência precisa saber de quem é a frase.
 */
function descricaoDaExigencia(etapas: EtapaDoPainel[]): string {
  return etapas
    .map((e) => {
      const texto = e.exigencia?.trim();
      return texto
        ? `${e.nome}: ${texto}`
        : `${e.nome}: em exigência — ver "Visualizar Motivos de Exigência" no painel da Junta.`;
    })
    .join(" · ");
}

/**
 * O que falta para o observador existir de fato.
 *
 * Vive em código, e não num documento à parte, porque é a lista que alguém
 * consulta no momento em que abre o painel para levantar.
 */
export const CONTRATO_PENDENTE = [
  "Se, depois de uma pessoa resolver o CAPTCHA do login, a mesma sessão abre outros protocolos pela URL do painel sem pedir CAPTCHA de novo — é o que decide se vale o robô com uma pessoa no laço",
  "O HTML do painel (onde ficam nome da etapa, selo e a caixa ATENÇÃO), visto numa sessão aberta",
  "O selo de etapa indeferida, que ainda não apareceu em nenhum print",
] as const;
