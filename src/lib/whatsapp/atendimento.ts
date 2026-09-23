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
import { conversarComAgente } from "@/lib/ai";
import { lerConfig } from "@/lib/integracoes/data";
import {
  decidir,
  decidirComARespostaDoAgente,
  montarMensagem,
  CONFIRMACAO_DE_SAIDA,
  type EstadoDaConversa,
} from "@/lib/whatsapp/decisao";
import { enviarERegistrar, registrarBloqueio } from "@/lib/whatsapp/envio";
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
    `Você é o atendente virtual do Recrutamento da ${nomeDoEscritorio}, falando por WhatsApp com um ` +
    "candidato. Escreva em português do Brasil, curto — no máximo três frases —, educado e " +
    "direto, como se estivesse no WhatsApp mesmo, sem formatação e sem listas longas.\n" +
    "Consulte as ferramentas antes de afirmar qualquer coisa sobre o processo da pessoa; nunca " +
    "invente etapa, prazo ou resultado.\n" +
    "VOCÊ NUNCA: reprova alguém, comenta, compara ou negocia salário, diz a faixa salarial da vaga, " +
    "faz ou insinua proposta, confirma contratação, promete prazo que não leu no sistema, nem pede " +
    "CPF, RG, data de nascimento, endereço, bairro, cidade ou qualquer documento.\n" +
    "Quando a conversa estiver ligada a uma candidatura, ver_meu_processo diz o que ainda falta " +
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

async function nomeDoEscritorio(tenantId: string): Promise<string> {
  const tenant = await getPrisma().tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  return tenant?.name.trim() || "nossa empresa";
}

/** Grava a mensagem recebida. `false` quando já tínhamos visto este id. */
async function registrarEntrada(
  tenantId: string,
  threadId: string,
  m: MensagemRecebida
): Promise<boolean> {
  const prisma = getPrisma();
  try {
    await prisma.whatsappMessage.create({
      data: {
        tenantId,
        threadId,
        direction: "ENTRADA",
        waMessageId: m.waMessageId,
        body: m.texto,
      },
    });
    return true;
  } catch {
    // Violação da chave única em `waMessageId` — reentrega do provedor. É o
    // caminho normal, não erro: é exatamente aqui que a segunda resposta ao
    // candidato morre.
    return false;
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
  return prisma.whatsappThread.create({
    data: {
      tenantId: params.tenantId,
      integrationId: params.integrationId,
      waPhone: params.waPhone,
    },
  });
}

async function transferir(threadId: string, motivo: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.whatsappThread.update({
    where: { id: threadId },
    data: { handoffAt: new Date(), handoffReason: motivo.slice(0, 300) },
  });
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
  const agora = new Date();
  const prisma = getPrisma();

  const thread = await acharOuCriarThread({
    tenantId: conexao.tenantId,
    integrationId: conexao.id,
    waPhone: m.de,
  });

  const novo = await registrarEntrada(conexao.tenantId, thread.id, m);
  if (!novo) return "reentrega ignorada";

  const [saidas, respostasNaUltimaHora] = await Promise.all([
    prisma.whatsappMessage.count({
      where: { threadId: thread.id, direction: "SAIDA", status: "ENVIADA" },
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
    optedOutAt: thread.optedOutAt,
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

  if (decisao.tipo === "silenciar") return `silenciado: ${decisao.motivo}`;

  if (decisao.tipo === "transferir") {
    await transferir(thread.id, decisao.motivo);
    return `transferido: ${decisao.motivo}`;
  }

  const config = lerConfig(conexao.configEnc);

  if (decisao.tipo === "confirmar_saida") {
    await prisma.whatsappThread.update({
      where: { id: thread.id },
      data: { optedOutAt: agora },
    });
    // A marca vem antes do envio: se o envio falhar, a pessoa fica sem a
    // confirmação, o que é chato. Na ordem inversa ela ficaria sem a marca, o
    // que é receber mensagem depois de ter pedido para parar.
    await enviarERegistrar({
      tenantId: conexao.tenantId,
      threadId: thread.id,
      provedor,
      config,
      paraE164: m.de,
      texto: CONFIRMACAO_DE_SAIDA,
    });
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
      enviarERegistrar({
        tenantId: conexao.tenantId,
        threadId: thread.id,
        provedor,
        config,
        paraE164: m.de,
        texto: montarMensagem(texto, decisao.apresentar, escritorio),
      });

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
    return `transferido: ${motivo}`;
  }

  const desfecho = decidirComARespostaDoAgente(
    {
      texto: resposta.valor,
      propostas: resposta.propostas.length,
      truncado: resposta.truncado,
    },
    provedor.politica.maxCaracteres
  );

  if (desfecho.tipo === "transferir") {
    await transferir(thread.id, desfecho.motivo);
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

  await enviarERegistrar({
    tenantId: conexao.tenantId,
    threadId: thread.id,
    provedor,
    config,
    paraE164: m.de,
    texto: montarMensagem(desfecho.texto, decisao.apresentar, escritorio),
    agentRunId: resposta.runId ?? null,
  });

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
 * `src/lib/whatsapp/documento.ts`); o resto vai para uma pessoa, sem resposta.
 */
export async function tratarNaoTexto(
  conexao: Conexao,
  provedor: ProvedorWhatsapp,
  i: MensagemIgnorada
): Promise<string> {
  const thread = await acharOuCriarThread({
    tenantId: conexao.tenantId,
    integrationId: conexao.id,
    waPhone: i.de,
  });
  if (thread.optedOutAt) return "ignorado: pediu para parar";

  if (i.documento && provedor.baixarMidia && conexao.enabled) {
    return tratarDocumento(conexao, provedor, thread, i, i.documento);
  }

  if (thread.handoffAt) return "ignorado: já está com uma pessoa";
  // Responder a um áudio com um robô que não o ouviu é pior que não responder.
  await transferir(thread.id, `candidato mandou ${i.tipo}, que o robô não lê`);
  return `transferido: ${i.tipo}`;
}

type ThreadDoAtendimento = Awaited<ReturnType<typeof acharOuCriarThread>>;

async function tratarDocumento(
  conexao: Conexao,
  provedor: ProvedorWhatsapp,
  thread: ThreadDoAtendimento,
  i: MensagemIgnorada,
  doc: DocumentoRecebido
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

  // Uma pessoa já conduz a conversa: o arquivo fica guardado, mas o robô não fala.
  const podeFalar = !thread.handoffAt;
  const passarParaPessoa = async (motivo: string) => {
    if (podeFalar) await transferir(thread.id, motivo);
    return `transferido: ${motivo}`;
  };

  const classe = classificarDocumento(doc);
  if (classe === "nao_pdf") return passarParaPessoa(`candidato mandou ${nome}, que o robô não lê`);
  if (classe === "grande_demais") return passarParaPessoa(`candidato mandou um PDF maior que 5 MB (${nome})`);

  const config = lerConfig(conexao.configEnc);
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
    where: { threadId: thread.id, direction: "SAIDA", status: "ENVIADA" },
  });
  const escritorio = await nomeDoEscritorio(conexao.tenantId);
  const responder = (texto: string) =>
    enviarERegistrar({
      tenantId: conexao.tenantId,
      threadId: thread.id,
      provedor,
      config,
      paraE164: i.de,
      texto: montarMensagem(texto, saidas === 0, escritorio),
    });

  const candidatura = thread.candidaturaId
    ? await prisma.candidatura.findFirst({
        where: { id: thread.candidaturaId, tenantId: conexao.tenantId },
        select: { id: true, vaga: { select: { title: true } } },
      })
    : null;

  if (candidatura) {
    // Substitui o do portal, se houver: quem manda de novo manda o atualizado.
    // O arquivo antigo continua no disco.
    await prisma.candidatura.update({ where: { id: candidatura.id }, data: { resumeUrl } });
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
