// O envio ao cliente no fim do processo (09/11/2026) — a regra, sem banco.
//
// Todo roteiro do Societário termina numa etapa de envio ao cliente marcada
// para o robô ("Envio ao cliente" no alvará, "Envio de documentação ao
// cliente" nos outros), e até aqui nada a fazia sozinha: alguém concluía à mão
// e avisava o cliente por fora. Agora, quando ela é a única etapa em aberto, o
// Connect avisa o cliente pelo portal e por e-mail — o e-mail só avisa e leva o
// link da tela do processo, onde estão os documentos; arquivo não vai anexo —
// e conclui a etapa como feita pelo robô. A gravação está em
// ./conclusaoServidor.ts; aqui fica só o que decide, para ser testado.

import type { StatusDaEtapa, StatusDoProcesso } from "./processo";

/** O código gravado em `ProcessStep.automationRef` quando o robô conclui o envio. */
export const AUTOMACAO_DO_ENVIO = "envio_ao_cliente";

/** O texto da etapa na tela da equipe, quando o roteiro não tem descrição própria. */
export const DESCRICAO_DO_ENVIO =
  "O Connect avisa o cliente pelo portal e por e-mail, com o link para os documentos, e conclui esta etapa sozinho quando as outras terminam e o checklist dela está marcado. Sem usuário ativo no portal da empresa, ela fica com a equipe.";

export type EtapaParaOEnvio = {
  templateStepId: string;
  position: number;
  label: string;
  expectedActor: "PESSOA" | "ROBO" | "INTEGRACAO";
  organId: string | null;
};

export type EtapaDaInstanciaParaOEnvio = {
  templateStepId: string;
  status: StatusDaEtapa;
  /** Itens obrigatórios do checklist ainda não marcados. */
  itensObrigatoriosPendentes: number;
};

function normalizado(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * O rótulo é de envio: começa por "envi" — Envio, Enviar, Enviado —, sem olhar
 * acento nem maiúscula.
 *
 * Tolerante de propósito: outra sessão está fazendo o editor de roteiro, e
 * "Envio de documentação ao cliente" pode virar "Enviar documentos ao cliente".
 * O nome do órgão ou do documento não entra na regra; só o verbo do começo.
 */
export function rotuloDeEnvio(label: string): boolean {
  return normalizado(label).startsWith("envi");
}

/**
 * A etapa de envio ao cliente do roteiro, ou `null` quando não há uma.
 *
 * As quatro condições, e por que cada uma:
 * - **Última posição**: o envio é o fim do fluxo. O roteiro tem outras etapas
 *   de robô no meio (levantamento de débitos, acompanhamento do registro), e
 *   nenhuma delas é aviso ao cliente.
 * - **Executor esperado ROBO**: é o roteiro dizendo que o setor quer isto
 *   automático. A "Comunicação ao cliente" da Regularização é de PESSOA e
 *   continua com gente.
 * - **Sem órgão**: etapa de órgão se encerra pelo protocolo, nunca à mão nem
 *   pelo robô do envio.
 * - **Rótulo que começa com "envi"** (`rotuloDeEnvio`): a trava contra o
 *   editor de roteiro pôr outra etapa de robô no fim — "Acompanhamento até
 *   deferimento", por exemplo. Concluir essa sozinho seria o robô fingir um
 *   trabalho que não fez; se o rótulo deixar de bater, a etapa só volta a ser
 *   de gente, como era antes desta regra.
 *
 * Mais de uma candidata na última posição é palpite, e palpite não manda nada
 * ao cliente: devolve `null`.
 */
export function etapaDeEnvioAoCliente(roteiro: readonly EtapaParaOEnvio[]): string | null {
  if (roteiro.length === 0) return null;
  const ultima = Math.max(...roteiro.map((e) => e.position));
  const candidatas = roteiro.filter(
    (e) => e.position === ultima && e.expectedActor === "ROBO" && e.organId === null && rotuloDeEnvio(e.label)
  );
  return candidatas.length === 1 ? candidatas[0].templateStepId : null;
}

function encerrada(status: StatusDaEtapa): boolean {
  return status === "CONCLUIDA" || status === "DISPENSADA";
}

/**
 * Pausado pela equipe ou encerrado sem conclusão: o robô não fala com o
 * cliente. Esperando o cliente ou suspenso é decisão de gente, e "concluímos o
 * seu processo" desmentiria a pausa; ao retomar, o envio sai.
 */
const PROCESSO_SEM_ENVIO: readonly StatusDoProcesso[] = ["SUSPENSO", "AGUARDANDO_CLIENTE", "CANCELADO", "INDEFERIDO"];

export type DecisaoDoEnvio =
  | { enviar: true; templateStepId: string }
  | { enviar: false; motivo: "sem_etapa_de_envio" | "ja_encerrada" | "falta_etapa" | "processo_parado" }
  | { enviar: false; motivo: "checklist_pendente"; templateStepId: string; itensPendentes: number };

/**
 * É hora do robô mandar o envio ao cliente?
 *
 * Sim quando a etapa de envio está em aberto e **todas as outras estão
 * encerradas** — concluídas ou dispensadas. É mais que "estar liberada"
 * (`etapasLiberadas`): uma etapa paralela na mesma última posição ainda aberta
 * libera o envio mas não terminou o processo, e o aviso diz ao cliente que
 * terminou.
 *
 * Item obrigatório do checklist do envio em aberto segura o robô, como segura
 * a conclusão à mão (`itensObrigatoriosPendentes`): no Distrato, o checklist
 * do envio é a lista dos documentos que o cliente vai procurar no portal.
 */
export function decidirEnvioAoCliente(
  roteiro: readonly EtapaParaOEnvio[],
  instancia: readonly EtapaDaInstanciaParaOEnvio[],
  statusDoProcesso: StatusDoProcesso
): DecisaoDoEnvio {
  const envio = etapaDeEnvioAoCliente(roteiro);
  if (!envio) return { enviar: false, motivo: "sem_etapa_de_envio" };

  const porEtapa = new Map(instancia.map((e) => [e.templateStepId, e]));
  const daEtapa = porEtapa.get(envio);
  if (!daEtapa || encerrada(daEtapa.status)) return { enviar: false, motivo: "ja_encerrada" };

  const outrasEncerradas = roteiro
    .filter((e) => e.templateStepId !== envio)
    .every((e) => encerrada(porEtapa.get(e.templateStepId)?.status ?? "PENDENTE"));
  if (!outrasEncerradas) return { enviar: false, motivo: "falta_etapa" };

  if (PROCESSO_SEM_ENVIO.includes(statusDoProcesso)) return { enviar: false, motivo: "processo_parado" };

  if (daEtapa.itensObrigatoriosPendentes > 0) {
    return { enviar: false, motivo: "checklist_pendente", templateStepId: envio, itensPendentes: daEtapa.itensObrigatoriosPendentes };
  }
  return { enviar: true, templateStepId: envio };
}

// ─── O aviso à equipe quando o robô não envia ───────────────────────────────

export type MotivoParaAEquipe =
  | { tipo: "checklist_pendente"; itensPendentes: number }
  | { tipo: "sem_portal" }
  | { tipo: "tela_bloqueada" }
  | { tipo: "sem_smtp" }
  | { tipo: "falha_no_email"; falhas: number }
  | { tipo: "falha_no_aviso" };

/**
 * O texto do aviso ao responsável. Os três primeiros deixam a etapa com a
 * equipe; os outros dizem que o processo foi concluído e o que não saiu.
 */
export function avisoParaAEquipe(motivo: MotivoParaAEquipe, processoNome: string): string {
  switch (motivo.tipo) {
    case "checklist_pendente":
      return motivo.itensPendentes === 1
        ? `Envio ao cliente de ${processoNome} espera 1 item obrigatório do checklist. Marque e o Connect envia sozinho.`
        : `Envio ao cliente de ${processoNome} espera ${motivo.itensPendentes} itens obrigatórios do checklist. Marque e o Connect envia sozinho.`;
    case "sem_portal":
      return `Envio ao cliente de ${processoNome} ficou com você: a empresa não tem usuário ativo no portal. Avise o cliente e conclua a etapa.`;
    case "tela_bloqueada":
      return `Envio ao cliente de ${processoNome} ficou com você: a tela de Processos está bloqueada no portal. Libere a tela ou avise o cliente e conclua a etapa.`;
    case "sem_smtp":
      return `${processoNome} foi concluído e aparece assim no portal, mas o e-mail ao cliente não saiu: o SMTP do workspace não está configurado.`;
    case "falha_no_email":
      return motivo.falhas === 1
        ? `${processoNome} foi concluído e aparece assim no portal, mas 1 e-mail ao cliente falhou.`
        : `${processoNome} foi concluído e aparece assim no portal, mas ${motivo.falhas} e-mails ao cliente falharam.`;
    case "falha_no_aviso":
      return `${processoNome} foi concluído, mas o aviso ao cliente falhou. Ele vê o processo concluído ao entrar no portal.`;
  }
}
