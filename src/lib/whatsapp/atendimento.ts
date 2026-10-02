// O que acontece quando um candidato manda mensagem.
//
// A cola entre as peças puras (`decisao`, o `lerEvento` do provedor) e as
// impuras (banco, agente, envio). Vive fora da rota porque a rota tem um
// trabalho só: autenticar e responder 200.
//
// ─── Reentrega ──────────────────────────────────────────────────────────────
//
// Provedor de webhook reentrega quando não recebe 200 a tempo. Como a resposta
// depende de uma conversa com o modelo — que leva segundos, às vezes mais —
// reentrega acontece, e reentrega seria segunda mensagem ao candidato. O
// `waMessageId` único é o que segura isso, e é a primeira coisa que este módulo
// faz.

import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { conversarComAgente } from "@/lib/ai";
import { lerConfig } from "@/lib/integracoes/data";
import {
  decidir,
  decidirComARespostaDoAgente,
  montarMensagens,
  pausaAntesDe,
  pediuParaSair,
  voltouAConversar,
  CONFIRMACAO_DE_SAIDA,
  type EstadoDaConversa,
  type Parte,
} from "@/lib/whatsapp/decisao";
import { LIMPEZA_AO_ENCERRAR } from "@/lib/whatsapp/atendimentos";
import { atendimentoAberto, fecharAtendimentos, garantirAtendimentoAberto } from "@/lib/whatsapp/atendimentos-dados";
import { esperar, naFila } from "@/lib/whatsapp/fila";
import { enviarERegistrar, registrarBloqueio } from "@/lib/whatsapp/envio";
import { avisarMensagemNova } from "@/lib/whatsapp/conversas";
import { avisarSobreConversa } from "@/lib/whatsapp/avisos";
import { respondeAMidia, rotuloDaMidia, textoDaMidia } from "@/lib/whatsapp/midia";
import { avisarSobreAVaga } from "@/lib/recrutamento/avisos";
import { montarPerguntaComHistorico, MAX_MENSAGENS_NO_HISTORICO } from "@/lib/whatsapp/historico";
import {
  nomeConfere,
  MAX_TENTATIVAS_DO_NOME,
  PERGUNTA_DO_NOME,
  PEDIR_NOME_DE_NOVO,
  NOME_NAO_CONFIRMADO,
  NOTA_DE_VINCULO_CONFIRMADO,
} from "@/lib/whatsapp/vinculo";
import { pessoaPeloTelefone, candidaturaPrincipal } from "@/lib/whatsapp/vinculo-dados";
import type {
  DocumentoRecebido,
  MensagemIgnorada,
  MensagemRecebida,
  ProvedorWhatsapp,
} from "@/lib/whatsapp/provedores/tipos";
import {
  classificarDocumento,
  ehPdf,
  nomeDoArquivoParaTela,
  mensagemDeCurriculoRecebido,
  CURRICULO_SEM_VINCULO,
  MAX_BYTES_DO_CURRICULO,
} from "@/lib/whatsapp/documento";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const AGENTE = "atendente_de_candidato";

/**
 * O prompt do atendente.
 *
 * O nome do escritório entra por parâmetro: até 14/09 estava escrito "41
 * Contábil", e o candidato de qualquer outro cliente do Connect leria o nome
 * errado.
 */
function sistema(nomeDoEscritorio: string): string {
  return (
    `Você é o assistente virtual do Recrutamento da ${nomeDoEscritorio}, conversando por WhatsApp com um ` +
    "candidato. Escreva como alguém simpático da equipe escreveria no WhatsApp: português do Brasil, " +
    "natural e acolhedor, sem formatação, sem asteriscos e sem listas. Mensagens curtas: quando tiver " +
    "mais de uma ideia, separe com uma linha em branco — cada bloco vira uma mensagem no WhatsApp, " +
    "e são no máximo três.\n" +
    "Chame a pessoa pelo primeiro nome só quando ver_meu_processo trouxer primeiroNome. Sem ele, não " +
    "use nome nenhum: nunca invente um, nunca use o nome que aparece no WhatsApp e nunca use o seu.\n" +
    "Tom de conversa, não de sistema: prefira " +
    "\"não achei\" a \"não consegui localizar\" e \"deixa eu ver\" a \"verificarei\"; nada de " +
    "\"prezado\", \"informamos\" ou \"sua solicitação\". Um emoji cai bem quando combina (😊, 🙌, 👍, 📄) — " +
    "no máximo um por mensagem, e nenhum em assunto delicado, como reprovação, atraso ou reclamação. " +
    "Se a pessoa mandou várias mensagens seguidas, responda a todas de uma vez. " +
    "Não comece toda mensagem do mesmo jeito: responda direto ao que a pessoa escreveu. Se ainda " +
    "não há mensagem sua na conversa, o sistema já põe antes do seu texto uma apresentação que " +
    "cumprimenta — então não diga \"oi\" nem se apresente de novo.\n" +
    "Se perguntarem se você é robô ou pessoa, diga com naturalidade que é o assistente virtual da " +
    "equipe e que pode chamar alguém, se a pessoa preferir. Nunca finja ser uma pessoa.\n" +
    "Consulte as ferramentas antes de afirmar qualquer coisa sobre o processo da pessoa; nunca " +
    "invente etapa, prazo ou resultado.\n" +
    "Você não inscreve ninguém: a inscrição é pelo portal de vagas. Quem quiser se candidatar " +
    "recebe o link de inscrição da vaga, que vem em listar_vagas_abertas — mande o link, nunca um " +
    "endereço que não veio da ferramenta. Se já mostrou as vagas nesta conversa, não ofereça de " +
    "novo: continue de onde a pessoa está.\n" +
    "Se a pessoa disser que já se inscreveu e ver_meu_processo não achar candidatura, diga que não " +
    "achou inscrição com este número de WhatsApp (pode ter usado outro na inscrição) e use " +
    "pedir_ajuda_humana para alguém da equipe conferir.\n" +
    "VOCÊ NUNCA: reprova alguém, comenta, compara ou negocia salário, diz a faixa salarial da vaga, " +
    "faz ou insinua proposta, confirma contratação, promete prazo que não leu no sistema, nem pede " +
    "CPF, RG, data de nascimento, endereço, bairro, cidade ou qualquer documento.\n" +
    "Só quando a conversa estiver ligada a uma candidatura — nunca antes, nem para \"adiantar\" " +
    "uma inscrição — ver_meu_processo diz o que ainda falta " +
    "perguntar (pretensão salarial mensal, disponibilidade para começar, tempo até o local de " +
    "trabalho). Pergunte uma coisa de cada vez, sem insistir, e registre cada resposta com " +
    "registrar_respostas_do_candidato assim que ela vier. Da pretensão, só pergunte e registre — " +
    "se a pessoa perguntar sobre o salário da vaga, use pedir_ajuda_humana. Do deslocamento, " +
    "pergunte quanto tempo a pessoa levaria para chegar ao local, nunca onde ela mora.\n" +
    "Em qualquer um desses casos — e sempre que não tiver certeza — use a ferramenta " +
    "pedir_ajuda_humana. Não é derrota: é o certo a fazer.\n" +
    "Só a ferramenta pedir_ajuda_humana chama uma pessoa. Nunca escreva que vai passar, transferir " +
    "ou encaminhar a conversa, nem que alguém vai entrar em contato, sem usá-la.\n" +
    "Leia a conversa até aqui antes de responder: se a pessoa aceitou algo que você ofereceu, faça " +
    "— não pergunte de novo."
  );
}

/** O motivo que o agente deu ao pedir uma pessoa, se pediu. */
function motivoDoPedidoDeAjuda(propostas: { ferramenta: string; argumentos: Record<string, unknown> }[]): string | null {
  const pedido = propostas.find((p) => p.ferramenta === "pedir_ajuda_humana");
  return typeof pedido?.argumentos.motivo === "string" ? pedido.argumentos.motivo : null;
}

async function nomeDoEscritorio(tenantId: string): Promise<string> {
  const tenant = await getPrisma().tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  return tenant?.name.trim() || "nossa empresa";
}

/** Grava a mensagem recebida e diz quando. `null` quando já tínhamos visto este id. */
async function registrarEntrada(
  tenantId: string,
  threadId: string,
  m: MensagemRecebida
): Promise<{ createdAt: Date } | null> {
  const prisma = getPrisma();
  try {
    return await prisma.whatsappMessage.create({
      data: {
        tenantId,
        threadId,
        direction: "ENTRADA",
        waMessageId: m.waMessageId,
        body: m.texto,
      },
      select: { createdAt: true },
    });
  } catch {
    // Violação da chave única em `waMessageId` — reentrega do provedor. É o
    // caminho normal, não erro: é exatamente aqui que a segunda resposta ao
    // candidato morre.
    return null;
  }
}

async function acharOuCriarThread(params: {
  tenantId: string;
  integrationId: string;
  waPhone: string;
}) {
  const prisma = getPrisma();
  const existente = await prisma.whatsappThread.findUnique({
    where: {
      integrationId_waPhone: { integrationId: params.integrationId, waPhone: params.waPhone },
    },
  });
  if (existente) return existente;
  try {
    return await prisma.whatsappThread.create({
      data: {
        tenantId: params.tenantId,
        integrationId: params.integrationId,
        waPhone: params.waPhone,
      },
    });
  } catch (err) {
    // Duas primeiras mensagens de um número novo chegando juntas: a outra criou
    // a conversa primeiro. Usa a dela.
    const criadaPelaOutra = await prisma.whatsappThread.findUnique({
      where: { integrationId_waPhone: { integrationId: params.integrationId, waPhone: params.waPhone } },
    });
    if (criadaPelaOutra) return criadaPelaOutra;
    throw err;
  }
}

/** Mensagens seguidas esperam este tanto por outras, para virar uma resposta só. */
export const JANELA_DA_RAJADA_MS = 4_000;

type Destino = {
  tenantId: string;
  threadId: string;
  provedor: ProvedorWhatsapp;
  config: ReturnType<typeof lerConfig>;
  paraE164: string;
};

/**
 * Manda as partes de uma resposta, uma de cada vez, com a pausa de quem
 * digita. A apresentação e o texto fixo saem marcados como automáticos; o que
 * o agente escreveu leva a execução dele. Se uma parte falha, as seguintes não
 * saem: o candidato leria o fim sem o começo.
 */
async function enviarPartes(destino: Destino, partes: Parte[], agentRunId: string | null): Promise<boolean> {
  for (const [i, parte] of partes.entries()) {
    if (i > 0) await esperar(pausaAntesDe(parte.texto));
    const r = await enviarERegistrar({
      ...destino,
      texto: parte.texto,
      ...(parte.fixa || !agentRunId ? { automatica: true } : { agentRunId }),
    });
    if (!r.ok) return false;
  }
  return true;
}

/**
 * O atendimento em que a mensagem entra. Sem nenhum aberto, abre um começando
 * pela primeira mensagem que chegou depois do último fechamento — numa rajada,
 * as mensagens que vieram juntas são todas deste atendimento.
 */
async function atendimentoDaMensagem(tenantId: string, threadId: string, chegouEm: Date) {
  const aberto = await atendimentoAberto(threadId);
  if (aberto) return aberto;
  const prisma = getPrisma();
  const fechado = await prisma.whatsappAtendimento.findFirst({
    where: { threadId, encerradoEm: { not: null } },
    orderBy: { encerradoEm: "desc" },
    select: { encerradoEm: true },
  });
  const primeira = await prisma.whatsappMessage.findFirst({
    where: { threadId, direction: "ENTRADA", ...(fechado?.encerradoEm ? { createdAt: { gt: fechado.encerradoEm } } : {}) },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  const inicio = primeira && primeira.createdAt < chegouEm ? primeira.createdAt : chegouEm;
  return garantirAtendimentoAberto(tenantId, threadId, inicio);
}

async function transferir(threadId: string, motivo: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.whatsappThread.update({
    where: { id: threadId },
    data: { handoffAt: new Date(), handoffReason: motivo.slice(0, 300) },
  });
  // Transferir sem avisar era o defeito: a conversa ficava marcada, e ninguém via.
  await avisarSobreConversa(threadId, { tipo: "transferida", motivo });
}

/**
 * O que o candidato lê quando o robô passa a conversa sem ter respondido.
 *
 * Sem isto, para quem está do outro lado o robô simplesmente parou — visto em
 * 25/09: a resposta saiu vazia, a conversa foi para uma pessoa, e o candidato
 * mandou mais duas mensagens sem retorno. Não promete prazo: quem assume pode
 * demorar, e prometer e não cumprir é pior.
 */
export const AVISO_DE_TRANSFERENCIA =
  "Vou chamar alguém da equipe de Recrutamento para continuar com você por aqui. Assim que puderem, te respondem. 🙂";

/** Avisa o candidato da transferência. Falha no envio não impede a transferência. */
async function avisarCandidato(params: {
  tenantId: string;
  threadId: string;
  provedor: ProvedorWhatsapp;
  config: ReturnType<typeof lerConfig>;
  paraE164: string;
}): Promise<void> {
  try {
    await enviarERegistrar({ ...params, texto: AVISO_DE_TRANSFERENCIA, automatica: true });
  } catch (err) {
    console.error("[whatsapp] aviso de transferência não saiu", params.threadId, err);
  }
}

export type Conexao = {
  id: string;
  tenantId: string;
  integrationCode: string;
  enabled: boolean;
  configEnc: string;
};

/**
 * Trata uma mensagem recebida, do começo ao fim.
 *
 * Devolve o que aconteceu, para o log — a rota não usa, mas quem investigar
 * "por que este candidato não recebeu resposta" vai procurar exatamente isto.
 */
export async function atenderMensagem(
  conexao: Conexao,
  provedor: ProvedorWhatsapp,
  m: MensagemRecebida
): Promise<string> {
  const inicial = await acharOuCriarThread({
    tenantId: conexao.tenantId,
    integrationId: conexao.id,
    waPhone: m.de,
  });

  // A entrada é gravada fora da fila, na hora: é assim que a mensagem que
  // está esperando a vez descobre que chegou outra depois dela.
  const entrada = await registrarEntrada(conexao.tenantId, inicial.id, m);
  if (!entrada) return "reentrega ignorada";

  return naFila(inicial.id, () => atenderNaVez(conexao, provedor, m, inicial.id, entrada.createdAt));
}

/** O atendimento de uma mensagem, já na vez dela — ver `src/lib/whatsapp/fila.ts`. */
async function atenderNaVez(
  conexao: Conexao,
  provedor: ProvedorWhatsapp,
  m: MensagemRecebida,
  threadId: string,
  chegouEm: Date
): Promise<string> {
  const prisma = getPrisma();

  // ─── Rajada ───────────────────────────────────────────────────────────────
  //
  // Quem escreve em rajada ("kkkk", "kkkkk", "e a vaga?") recebe uma resposta
  // só, que leva todas em conta: esta mensagem espera um pouco, e se outra
  // chegou depois, é a outra que responde — o agente lê as duas no histórico.
  // O PARAR não espera: é atendido na hora, na ordem em que chegou.
  if (!pediuParaSair(m.texto)) {
    await esperar(chegouEm.getTime() + JANELA_DA_RAJADA_MS - Date.now());
    const seguinte = await prisma.whatsappMessage.findFirst({
      where: { threadId, direction: "ENTRADA", createdAt: { gt: chegouEm } },
      select: { id: true },
    });
    if (seguinte) return "agrupada: a mensagem seguinte responde por esta também";
  }

  // Lida de novo, e não a de quando a mensagem chegou: quem estava antes na
  // fila pode ter mudado a conversa (PARAR, vínculo, transferência).
  const thread = await prisma.whatsappThread.findUniqueOrThrow({ where: { id: threadId } });
  const agora = new Date();

  // Quem pediu para parar e escreveu de novo — "oi", uma pergunta — está
  // voltando: é o que a confirmação do PARAR promete. Um "ok, obrigado" logo
  // depois do PARAR não é volta, e continua sem resposta. Ver `voltouAConversar`.
  // Vale qualquer mensagem depois do PARAR, não só esta: numa rajada "oi" +
  // "ok", o "oi" já é a volta.
  let optedOutAt = thread.optedOutAt;
  if (optedOutAt) {
    const depoisDoParar = await prisma.whatsappMessage.findMany({
      where: { threadId, direction: "ENTRADA", createdAt: { gt: optedOutAt } },
      select: { body: true },
    });
    if (depoisDoParar.some((d) => voltouAConversar(d.body))) {
      await prisma.whatsappThread.update({ where: { id: thread.id }, data: { optedOutAt: null } });
      optedOutAt = null;
    }
  }

  // O atendimento desta mensagem. Sem nenhum aberto — alguém encerrou, ou é a
  // volta depois do PARAR —, ela abre um novo: o assistente se apresenta de
  // novo e só lê o que foi dito dali em diante. Quem continua calado não abre nada.
  const atendimento = optedOutAt ? null : await atendimentoDaMensagem(conexao.tenantId, thread.id, chegouEm);
  const desde = atendimento?.abertoEm ?? thread.createdAt;

  const [saidas, respostasNaUltimaHora] = await Promise.all([
    prisma.whatsappMessage.count({
      where: { threadId: thread.id, direction: "SAIDA", status: "ENVIADA", createdAt: { gte: desde } },
    }),
    prisma.whatsappMessage.count({
      where: {
        threadId: thread.id,
        direction: "SAIDA",
        agentRunId: { not: null },
        createdAt: { gte: new Date(agora.getTime() - 3_600_000) },
      },
    }),
  ]);

  const estado: EstadoDaConversa = {
    integracaoLigada: conexao.enabled,
    optedOutAt,
    handoffAt: thread.handoffAt,
    // A janela conta da mensagem ANTERIOR: esta ainda não foi carimbada.
    lastInboundAt: thread.lastInboundAt,
    respostasNaUltimaHora,
    jaSeApresentou: saidas > 0,
    janelaLivreHoras: provedor.politica.janelaLivreHoras,
  };

  const decisao = decidir(estado, m.texto, agora);

  // Carimba o inbound depois de decidir, e sempre — inclusive quando ninguém
  // responde. É o relógio da janela, e ele não depende de termos falado.
  await prisma.whatsappThread.update({
    where: { id: thread.id },
    data: { lastInboundAt: m.recebidaEm },
  });

  if (decisao.tipo === "silenciar") {
    // Com gente, o robô cala — e quem está com a conversa precisa saber que o
    // candidato voltou. Só quando ela reabre depois de um silêncio, não a cada linha.
    if (thread.handoffAt && !thread.optedOutAt && avisarMensagemNova(thread.lastInboundAt, m.recebidaEm)) {
      await avisarSobreConversa(thread.id, { tipo: "mensagem_nova" });
    }
    return `silenciado: ${decisao.motivo}`;
  }

  if (decisao.tipo === "transferir") {
    await transferir(thread.id, decisao.motivo);
    // Transferir em silêncio deixava o candidato sem saber se alguém leu (achado
    // de 29/09). Só não avisa quando não dá para mandar: conexão desligada ou
    // fora da janela do WhatsApp.
    if (decisao.avisar) {
      await avisarCandidato({ tenantId: conexao.tenantId, threadId: thread.id, provedor, config: lerConfig(conexao.configEnc), paraE164: m.de });
    }
    return `transferido: ${decisao.motivo}`;
  }

  const config = lerConfig(conexao.configEnc);

  if (decisao.tipo === "confirmar_saida") {
    // PARAR também encerra o atendimento, pelo próprio candidato: se ele
    // voltar, volta para o assistente, num atendimento novo.
    await prisma.whatsappThread.update({
      where: { id: thread.id },
      data: { optedOutAt: agora, ...LIMPEZA_AO_ENCERRAR },
    });
    // A marca vem antes do envio: se o envio falhar, a pessoa fica sem a
    // confirmação, o que é chato. Na ordem inversa ela ficaria sem a marca, o
    // que é receber mensagem depois de ter pedido para parar. O atendimento
    // fecha depois da confirmação (a tela marca o fim depois dela), e fecha
    // mesmo que o envio estoure.
    try {
      await enviarERegistrar({
        tenantId: conexao.tenantId,
        threadId: thread.id,
        provedor,
        config,
        paraE164: m.de,
        texto: CONFIRMACAO_DE_SAIDA,
        automatica: true,
      });
    } finally {
      await fecharAtendimentos(thread.id, { agora: new Date(), porId: null, desfecho: "PEDIU_PARA_PARAR" });
    }
    return "saída confirmada";
  }

  const escritorio = await nomeDoEscritorio(conexao.tenantId);

  // ─── Vínculo com a candidatura ────────────────────────────────────────────
  //
  // Antes do agente, e sem ele: perguntar e conferir o nome é regra, não
  // conversa — ver `src/lib/whatsapp/vinculo.ts`. Só entra quando a conversa
  // ainda não tem vínculo e ninguém desistiu dele.
  let acabouDeConfirmar = false;
  if (!thread.personId && !thread.candidaturaId && !thread.linkFailedAt) {
    const enviar = (texto: string) =>
      enviarPartes(
        { tenantId: conexao.tenantId, threadId: thread.id, provedor, config, paraE164: m.de },
        montarMensagens(texto, decisao.apresentar, escritorio),
        null
      );

    if (thread.linkPendingPersonId) {
      const pessoa = await prisma.person.findFirst({
        where: { id: thread.linkPendingPersonId, tenantId: conexao.tenantId },
        select: { id: true, name: true },
      });

      if (pessoa && nomeConfere(m.texto, pessoa.name)) {
        await prisma.whatsappThread.update({
          where: { id: thread.id },
          data: {
            personId: pessoa.id,
            candidaturaId: await candidaturaPrincipal(conexao.tenantId, pessoa.id),
            linkPendingPersonId: null,
            linkAttempts: 0,
          },
        });
        acabouDeConfirmar = true;
      } else {
        const tentativas = thread.linkAttempts + 1;
        if (pessoa && tentativas < MAX_TENTATIVAS_DO_NOME) {
          await prisma.whatsappThread.update({ where: { id: thread.id }, data: { linkAttempts: tentativas } });
          await enviar(PEDIR_NOME_DE_NOVO);
          return "vínculo: nome não conferiu, pedido de novo";
        }
        // Pessoa apagada do cadastro no meio da confirmação também cai aqui:
        // não há mais com quem conferir.
        await prisma.whatsappThread.update({
          where: { id: thread.id },
          data: { linkPendingPersonId: null, linkAttempts: tentativas, linkFailedAt: agora },
        });
        await enviar(NOME_NAO_CONFIRMADO);
        return "vínculo: nome não conferiu, desistiu";
      }
    } else {
      const achada = await pessoaPeloTelefone(conexao.tenantId, m.de);
      if (achada) {
        await prisma.whatsappThread.update({
          where: { id: thread.id },
          data: { linkPendingPersonId: achada.personId, linkAttempts: 0 },
        });
        // A pergunta não diz o nome nem a vaga que achou: quem recebeu o número
        // por engano não pode sair daqui sabendo de quem é a inscrição.
        await enviar(PERGUNTA_DO_NOME);
        return "vínculo: pediu o nome";
      }
    }
  }

  // ─── Responder ────────────────────────────────────────────────────────────

  // O que já foi trocado nesta conversa — ver `src/lib/whatsapp/historico.ts`.
  // Busca uma a mais e tira a mensagem nova em memória: filtrar por
  // `waMessageId` no banco descartaria também as saídas sem id (NULL não passa
  // em `NOT =`).
  const recentes = await prisma.whatsappMessage.findMany({
    where: {
      threadId: thread.id,
      createdAt: { gte: desde },
      OR: [{ direction: "ENTRADA" }, { direction: "SAIDA", status: "ENVIADA" }],
    },
    orderBy: { createdAt: "desc" },
    take: MAX_MENSAGENS_NO_HISTORICO + 1,
    select: { direction: true, body: true, waMessageId: true },
  });
  const anteriores = recentes
    .filter((r) => r.waMessageId !== m.waMessageId)
    .slice(0, MAX_MENSAGENS_NO_HISTORICO)
    .reverse()
    .map((r) => ({ direcao: r.direction, texto: r.body }));

  let resposta;
  try {
    resposta = await conversarComAgente({
      tenantId: conexao.tenantId,
      agentCode: AGENTE,
      system: sistema(escritorio),
      pergunta: montarPerguntaComHistorico(
        anteriores,
        acabouDeConfirmar ? `${NOTA_DE_VINCULO_CONFIRMADO}${m.texto}` : m.texto
      ),
      maxTokens: 800,
      // `CRON` não: foi o candidato que provocou. `SISTEMA` é o que descreve
      // "efeito de algo que chegou de fora", e é o que separa este gasto do
      // que alguém do escritório pediu clicando.
      contexto: { trigger: "SISTEMA", entityType: "whatsapp", entityId: thread.id },
      escopo: { threadId: thread.id },
    });
  } catch (err) {
    // Teto atingido, agente desligado, provedor fora do ar: nenhum desses é
    // motivo para o candidato ficar sem resposta. Vai para uma pessoa.
    const motivo = err instanceof Error ? err.message : "falha ao consultar o assistente";
    console.error("[whatsapp] agente falhou", thread.id, err);
    await transferir(thread.id, motivo);
    await avisarCandidato({ tenantId: conexao.tenantId, threadId: thread.id, provedor, config, paraE164: m.de });
    return `transferido: ${motivo}`;
  }

  const desfecho = decidirComARespostaDoAgente(
    {
      texto: resposta.valor,
      propostas: resposta.propostas.length,
      truncado: resposta.truncado,
      motivoDaAjuda: motivoDoPedidoDeAjuda(resposta.propostas),
    },
    provedor.politica.maxCaracteres
  );

  if (desfecho.tipo === "transferir") {
    await transferir(thread.id, desfecho.motivo);
    await avisarCandidato({ tenantId: conexao.tenantId, threadId: thread.id, provedor, config, paraE164: m.de });
    // Guarda o que o robô teria dito, marcado como bloqueada: quem assumir a
    // conversa vê o rascunho, e a trilha não perde o que foi decidido não
    // mandar.
    await registrarBloqueio({
      tenantId: conexao.tenantId,
      threadId: thread.id,
      texto: resposta.valor,
      motivo: desfecho.motivo,
    });
    return `transferido: ${desfecho.motivo}`;
  }

  await enviarPartes(
    { tenantId: conexao.tenantId, threadId: thread.id, provedor, config, paraE164: m.de },
    montarMensagens(desfecho.texto, decisao.apresentar, escritorio),
    resposta.runId ?? null
  );

  // A resposta prometeu uma pessoa sem o agente chamar a ferramenta: a mensagem
  // já saiu, então a promessa passa a ser verdade — transferir **depois** de
  // enviar, para o robô silenciar a partir da próxima mensagem.
  if (desfecho.tipo === "enviar_e_transferir") {
    await transferir(thread.id, desfecho.motivo);
    return `respondido e transferido: ${desfecho.motivo}`;
  }
  return "respondido";
}

/**
 * Uma mensagem que não é texto. Currículo em PDF é guardado (ver
 * `src/lib/whatsapp/documento.ts`); o resto entra na conversa ("[imagem]
 * legenda") e vai para uma pessoa, com o aviso ao candidato de que alguém vai
 * continuar.
 */
export async function tratarNaoTexto(
  conexao: Conexao,
  provedor: ProvedorWhatsapp,
  i: MensagemIgnorada
): Promise<string> {
  const inicial = await acharOuCriarThread({
    tenantId: conexao.tenantId,
    integrationId: conexao.id,
    waPhone: i.de,
  });
  return naFila(inicial.id, () => tratarNaoTextoNaVez(conexao, provedor, i, inicial.id));
}

async function tratarNaoTextoNaVez(
  conexao: Conexao,
  provedor: ProvedorWhatsapp,
  i: MensagemIgnorada,
  threadId: string
): Promise<string> {
  const thread = await getPrisma().whatsappThread.findUniqueOrThrow({ where: { id: threadId } });
  // Arquivo, áudio ou figurinha não reabrem o PARAR: não dá para ler se é volta.
  if (thread.optedOutAt) return "ignorado: pediu para parar";
  const atendimento = await garantirAtendimentoAberto(conexao.tenantId, thread.id, new Date());

  if (i.documento && provedor.baixarMidia && conexao.enabled) {
    return tratarDocumento(conexao, provedor, thread, i, i.documento, atendimento.abertoEm);
  }

  // Entra na conversa, com a legenda: até 02/10/2026 sumia — quem abria a
  // conversa não via o que o candidato mandou. O `waMessageId` único barra a
  // reentrega, como no texto.
  const prisma = getPrisma();
  const agora = new Date();
  try {
    await prisma.whatsappMessage.create({
      data: {
        tenantId: conexao.tenantId,
        threadId: thread.id,
        direction: "ENTRADA",
        waMessageId: i.waMessageId,
        body: i.documento
          ? `[arquivo: ${nomeDoArquivoParaTela(i.documento.nomeDoArquivo)}]${i.legenda?.trim() ? ` ${i.legenda.trim()}` : ""}`
          : textoDaMidia(i.tipo, i.legenda),
      },
    });
  } catch {
    return "reentrega ignorada";
  }
  await prisma.whatsappThread.update({ where: { id: thread.id }, data: { lastInboundAt: agora } });

  // Com gente, o robô cala — e quem está com a conversa é avisado, como no texto.
  if (thread.handoffAt) {
    if (avisarMensagemNova(thread.lastInboundAt, agora)) await avisarSobreConversa(thread.id, { tipo: "mensagem_nova" });
    return "registrado: já está com uma pessoa";
  }
  // O robô não responde ao conteúdo (não ouviu o áudio, não viu a imagem), mas
  // diz que alguém vai continuar — calar era o candidato achar que ninguém leu.
  await transferir(thread.id, `candidato mandou ${rotuloDaMidia(i.tipo)}, que o robô não lê`);
  if (conexao.enabled && respondeAMidia(i.tipo)) {
    await avisarCandidato({ tenantId: conexao.tenantId, threadId: thread.id, provedor, config: lerConfig(conexao.configEnc), paraE164: i.de });
  }
  return `transferido: ${i.tipo}`;
}

type ThreadDoAtendimento = Awaited<ReturnType<typeof acharOuCriarThread>>;

async function tratarDocumento(
  conexao: Conexao,
  provedor: ProvedorWhatsapp,
  thread: ThreadDoAtendimento,
  i: MensagemIgnorada,
  doc: DocumentoRecebido,
  /** Início do atendimento em curso — a apresentação conta a partir dele. */
  desde: Date
): Promise<string> {
  const prisma = getPrisma();
  const agora = new Date();
  const nome = nomeDoArquivoParaTela(doc.nomeDoArquivo);

  // Registra a entrada antes de qualquer coisa, pelo mesmo motivo do texto: o
  // `waMessageId` único é o que impede a reentrega de baixar e responder duas
  // vezes. E a conversa passa a mostrar que um arquivo chegou.
  let mensagemId: string;
  try {
    const criada = await prisma.whatsappMessage.create({
      data: {
        tenantId: conexao.tenantId,
        threadId: thread.id,
        direction: "ENTRADA",
        waMessageId: i.waMessageId,
        body: `[arquivo: ${nome}]`,
      },
      select: { id: true },
    });
    mensagemId = criada.id;
  } catch {
    return "reentrega ignorada";
  }
  await prisma.whatsappThread.update({ where: { id: thread.id }, data: { lastInboundAt: agora } });

  // Uma pessoa já conduz a conversa: o arquivo fica guardado, mas o robô não
  // fala — e quem está com ela é avisado, como numa mensagem de texto.
  const podeFalar = !thread.handoffAt;
  if (!podeFalar && avisarMensagemNova(thread.lastInboundAt, agora)) {
    await avisarSobreConversa(thread.id, { tipo: "mensagem_nova" });
  }
  const config = lerConfig(conexao.configEnc);
  const passarParaPessoa = async (motivo: string) => {
    if (podeFalar) {
      await transferir(thread.id, motivo);
      // O candidato fica sabendo que alguém vai continuar (achado de 29/09).
      await avisarCandidato({ tenantId: conexao.tenantId, threadId: thread.id, provedor, config, paraE164: i.de });
    }
    return `transferido: ${motivo}`;
  };

  const classe = classificarDocumento(doc);
  if (classe === "nao_pdf") return passarParaPessoa(`candidato mandou ${nome}, que o robô não lê`);
  if (classe === "grande_demais") return passarParaPessoa(`candidato mandou um PDF maior que 5 MB (${nome})`);

  const baixado = await provedor.baixarMidia!(config, doc.referencia);
  if (!baixado.ok) {
    await prisma.whatsappMessage.update({ where: { id: mensagemId }, data: { error: baixado.erro.slice(0, 500) } });
    return passarParaPessoa(`não deu para baixar o arquivo ${nome}`);
  }
  if (baixado.bytes.length > MAX_BYTES_DO_CURRICULO || !ehPdf(baixado.bytes)) {
    return passarParaPessoa(`o arquivo ${nome} não é um PDF válido de até 5 MB`);
  }

  // Mesmo lugar e mesmo formato do portal de carreiras — é o que faz o arquivo
  // servir ao funil da vaga e ao "Extrair dados" sem nada novo do lado deles.
  const arquivo = `${randomUUID()}.pdf`;
  const pasta = path.join(process.cwd(), "storage", "resumes", conexao.tenantId);
  await mkdir(pasta, { recursive: true });
  await writeFile(path.join(pasta, arquivo), baixado.bytes);
  const resumeUrl = `${conexao.tenantId}/${arquivo}`;

  await prisma.whatsappMessage.update({
    where: { id: mensagemId },
    data: { mediaUrl: resumeUrl, mediaFileName: nome, mediaMimeType: "application/pdf" },
  });

  const saidas = await prisma.whatsappMessage.count({
    where: { threadId: thread.id, direction: "SAIDA", status: "ENVIADA", createdAt: { gte: desde } },
  });
  const escritorio = await nomeDoEscritorio(conexao.tenantId);
  const responder = (texto: string) =>
    enviarPartes(
      { tenantId: conexao.tenantId, threadId: thread.id, provedor, config, paraE164: i.de },
      montarMensagens(texto, saidas === 0, escritorio),
      null
    );

  const candidatura = thread.candidaturaId
    ? await prisma.candidatura.findFirst({
        where: { id: thread.candidaturaId, tenantId: conexao.tenantId },
        select: { id: true, person: { select: { name: true } }, vaga: { select: { title: true, responsibleUserId: true } } },
      })
    : null;

  if (candidatura) {
    // Substitui o do portal, se houver: quem manda de novo manda o atualizado.
    // O arquivo antigo continua no disco. Zera o perfil extraído e a falha da
    // triagem, como a conta do candidato no portal faz: sem isso, a inscrição
    // marcada "Sem currículo em PDF" nunca voltava à fila da pontuação (achado
    // de 29/09). Já pontuada não é repontuada sozinha — o recrutador é avisado.
    await prisma.candidatura.update({
      where: { id: candidatura.id },
      data: { resumeUrl, perfilProfissional: Prisma.DbNull, perfilProfissionalEm: null, triagemFalha: null, triagemFalhaEm: null },
    });
    await avisarSobreAVaga(candidatura.vaga, {
      tenantId: conexao.tenantId,
      type: "CANDIDATE_UPDATE",
      message: `${candidatura.person.name} enviou um currículo novo pelo WhatsApp (vaga "${candidatura.vaga.title}").`.slice(0, 255),
      entityType: "PERSON",
      entityId: thread.personId ?? undefined,
    }).catch((err) => console.error("[whatsapp] aviso de currículo novo", thread.id, err));
    if (podeFalar) await responder(mensagemDeCurriculoRecebido(candidatura.vaga.title));
    return "currículo juntado à candidatura";
  }

  // Sem vínculo (ou vínculo ainda sendo confirmado pelo nome): não dá para saber
  // de quem é. Fica na conversa, e uma pessoa liga.
  if (podeFalar) {
    await responder(CURRICULO_SEM_VINCULO);
    await transferir(thread.id, `candidato sem vínculo mandou currículo (${nome}) — está na conversa`);
  }
  return "currículo guardado na conversa, sem vínculo";
}
