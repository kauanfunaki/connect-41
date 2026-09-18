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
// significa para o processo. Sai inteira do print do ALV-1, que o setor mandou
// justamente por estar com uma etapa em exigência.
//
// Não está: a **navegação**. Não temos a URL do painel, não sabemos se ele
// exige login, e não vimos o HTML. Inventar seletor é o defeito que esta
// automação não pode ter: marcar processo como deferido sem ser faz o setor
// parar de acompanhar, o prazo do órgão correr, e a exigência aparecer quando
// já custou. `CONTRATO_PENDENTE` lista o que falta.

import type { LeituraDoOrgao } from "@/lib/societario/observador";

/** Sigla do órgão no cadastro — a mesma do seed (`scripts/seed-societario.ts`). */
export const SIGLA = "JUCEPAR";

/**
 * As etapas observadas no painel, na ordem em que aparecem.
 *
 * Serve de referência para quem for escrever a extração: não é uma lista
 * fechada (município com licença a mais mostra etapa a mais), e a classificação
 * abaixo **não depende** dela — trabalha com o que vier.
 */
export const ETAPAS_OBSERVADAS = [
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
   * O texto de "Ver Exigência(s)", quando a etapa está em exigência e a
   * extração conseguiu abri-lo. Opcional porque abrir custa um clique a mais:
   * sem ele o processo ainda é classificado, só com descrição mais pobre.
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
 * Selos que significam etapa concluída.
 *
 * Observados: `DEFERIDA` (Consulta Prévia) e `EMITIDO` (Inscrição Municipal).
 * As variantes de gênero entram porque são a **mesma palavra concordando com o
 * nome da etapa**, não um estado novo — "Alvará DEFERIDO" e "Consulta Prévia
 * DEFERIDA" dizem a mesma coisa.
 */
const CONCLUIDA = new Set(["DEFERIDA", "DEFERIDO", "EMITIDA", "EMITIDO"]);

/** Selo de etapa que voltou para o requerente. Observado no print do ALV-1. */
const EXIGENCIA = new Set(["EM EXIGENCIA"]);

export class StatusNaoObservado extends Error {
  constructor(etapa: string, status: string) {
    super(
      `Junta: selo não observado na etapa "${etapa}": "${status}". ` +
        `Acrescentar em CONCLUIDA ou EXIGENCIA em src/lib/societario/orgaos/junta.ts ` +
        `depois de ver a tela — não antes.`
    );
    this.name = "StatusNaoObservado";
  }
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
 * ─── As três regras, na ordem em que valem ────────────────────────────────
 *
 * 1. **Exigência em qualquer etapa ganha.** É o único estado que precisa de uma
 *    pessoa, e ela precisa saber hoje: o prazo do órgão corre enquanto o
 *    processo espera o escritório.
 * 2. **Deferido só quando todas as etapas estão concluídas.** O processo na
 *    Junta é a soma das licenças; dar por encerrado com o alvará ainda em
 *    análise é o erro que faz o setor parar de acompanhar cedo demais.
 * 3. **O resto é pendente**, que é o caso comum e não precisa de ninguém.
 *
 * ─── Por que selo desconhecido falha em vez de virar "pendente" ───────────
 *
 * Porque a partir do dia em que o robô existe, ninguém abre mais o painel à
 * mão. Um selo que não reconhecemos virando "pendente" é um processo que fica
 * parado sem que ninguém saiba que o robô não entendeu; virando erro, ele
 * aparece em `checkError` na tela do protocolo e alguém olha. A mensagem leva o
 * texto verbatim de propósito: completar a tabela é uma linha, depois de ver.
 */
export function classificarPainel(etapas: EtapaDoPainel[]): LeituraDoOrgao {
  if (etapas.length === 0) throw new PainelSemEtapas();

  for (const e of etapas) {
    const s = normalizarStatus(e.status);
    if (!CONCLUIDA.has(s) && !EXIGENCIA.has(s)) throw new StatusNaoObservado(e.nome, e.status);
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
      return texto ? `${e.nome}: ${texto}` : `${e.nome}: em exigência — ver "Ver Exigência(s)" no painel da Junta.`;
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
  "A URL do painel de acompanhamento e como se chega nele a partir do protocolo",
  "Se o painel exige login (e, se exigir, qual certificado — como no SIMA, pode ser o mesmo que abriu)",
  "Os selos das etapas que ainda não foram vistas — em análise, indeferida, cancelada",
  "Onde fica o texto de 'Ver Exigência(s)': na mesma página ou atrás de um clique",
] as const;
