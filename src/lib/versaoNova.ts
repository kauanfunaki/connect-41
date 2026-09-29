// Aba aberta antes de um deploy continua chamando as server actions da versão
// anterior, que o servidor novo não tem mais: o Next responde "Server Action
// não encontrada" e a aba não se conserta sozinha — só recarregando. Visto em
// 29/09: o alerta de reunião de uma aba antiga batia no servidor a cada 45 s,
// o dia todo, e a pessoa ficava sem alerta sem saber.
//
// Quem pega o erro chama `tratarVersaoAntiga`; o aviso do layout
// (`AvisoDeVersaoNova`) escuta o evento e oferece o botão de recarregar.
// Não recarrega sozinho: a pessoa pode estar com um formulário preenchido.
import { unstable_isUnrecognizedActionError } from "next/navigation";

export const EVENTO_VERSAO_NOVA = "connect:versao-nova";

export function ehVersaoAntiga(erro: unknown): boolean {
  return unstable_isUnrecognizedActionError(erro);
}

export function avisarVersaoNova(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENTO_VERSAO_NOVA));
}

/** Se o erro é de versão antiga, avisa a tela e devolve true. */
export function tratarVersaoAntiga(erro: unknown): boolean {
  if (!ehVersaoAntiga(erro)) return false;
  avisarVersaoNova();
  return true;
}
