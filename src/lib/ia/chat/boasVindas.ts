// As boas-vindas da Lígia e o aviso de mensagem nova no botão do canto
// (13/10/2026 — pedido do Kauan). Puro, testado em `boasVindas.test.ts`; quem
// usa é o `ChatDeIA`.
//
// ─── Uma vez por entrada, e não a cada recarregar ───────────────────────────
//
// O login grava um cookie com uma marca nova a cada entrada (`ENTRADA_COOKIE`,
// em `src/lib/auth/cookies.ts`), que a tela consegue ler. A tela guarda no
// navegador a última marca cujas boas-vindas a pessoa já viu; marca diferente
// = entrada nova = boas-vindas esperando. Recarregar a página não muda a marca,
// então não repete. Sessão aberta antes desta versão (sem cookie) conta como
// uma entrada só: vê uma vez.
//
// As boas-vindas não abrem o chat sozinhas: ficam esperando dentro dele, com o
// aviso no botão — o tutorial do primeiro acesso aparece na mesma hora, e os
// dois não podem disputar a tela. Abrir o chat mostra a mensagem e marca como
// vista. São texto local: nenhuma ida ao modelo.
//
// Só para quem tem a Lígia do setor ativo (o agente do setor que a pessoa está
// usando); a Ajuda, que atende todo mundo, não dá boas-vindas.

import { ENTRADA_COOKIE } from "@/lib/auth/cookies";
import { NOME_DA_ASSISTENTE } from "@/lib/ia/ligia";

/** Onde a tela guarda a marca da entrada cujas boas-vindas a pessoa já viu. */
export const CHAVE_DAS_BOAS_VINDAS = "c41:ligia:boas-vindas";

/** A entrada de quem abriu a sessão antes do cookie existir. */
export const ENTRADA_SEM_MARCA = "sem-marca";

/** O valor de um cookie em `document.cookie`, ou `null`. */
export function lerCookie(cookies: string, nome: string): string | null {
  for (const parte of cookies.split(";")) {
    const i = parte.indexOf("=");
    if (i < 0) continue;
    if (parte.slice(0, i).trim() !== nome) continue;
    const valor = parte.slice(i + 1).trim();
    try {
      return decodeURIComponent(valor) || null;
    } catch {
      return valor || null;
    }
  }
  return null;
}

/** A marca da entrada atual, a partir de `document.cookie`. */
export function entradaAtual(cookies: string): string {
  return lerCookie(cookies, ENTRADA_COOKIE) ?? ENTRADA_SEM_MARCA;
}

/** As boas-vindas desta entrada ainda não foram vistas? */
export function boasVindasPendentes({ entrada, vista, temAgenteDoSetor }: { entrada: string; vista: string | null; temAgenteDoSetor: boolean }): boolean {
  return temAgenteDoSetor && entrada !== vista;
}

/** O texto das boas-vindas: curto, com o setor e o primeiro nome. */
export function textoDasBoasVindas({ primeiroNome, especialidade }: { primeiroNome: string; especialidade: string }): string {
  const oi = primeiroNome ? `Oi, ${primeiroNome}!` : "Oi!";
  return `${oi} Eu sou a ${NOME_DA_ASSISTENTE} e estou aqui para ajudar no ${especialidade}. Consulto o Connect com o mesmo acesso que você tem e não altero nada sozinha. Pode perguntar — ou comece por uma destas:`;
}

/** As sugestões que viram botão nas boas-vindas: as do agente do setor, até três. */
export function sugestoesDasBoasVindas(sugestoes: readonly string[]): string[] {
  return sugestoes.slice(0, 3);
}

/** Quantas mensagens novas o botão do canto avisa. */
export function mensagensNovas({ boasVindasEsperando, respostaNaoLida }: { boasVindasEsperando: boolean; respostaNaoLida: boolean }): number {
  return (boasVindasEsperando ? 1 : 0) + (respostaNaoLida ? 1 : 0);
}

/** "1 mensagem nova da Lígia" — o nome acessível do aviso. `null` sem mensagem nova. */
export function rotuloDoAviso(quantas: number): string | null {
  if (quantas <= 0) return null;
  return quantas === 1 ? `1 mensagem nova da ${NOME_DA_ASSISTENTE}` : `${quantas} mensagens novas da ${NOME_DA_ASSISTENTE}`;
}

/**
 * Chegou uma resposta: fica como não lida se o chat estava fechado nessa hora.
 * Com o chat aberto, a pessoa está vendo — nada muda.
 */
export function respostaNaoLidaDepois({ chatAberto, jaHavia }: { chatAberto: boolean; jaHavia: boolean }): boolean {
  return chatAberto ? jaHavia : true;
}
