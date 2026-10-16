// O "Novo acesso" do portal quando o e-mail já tem acesso (13/10/2026).
//
// Até então a resposta era só "Já existe um acesso com este e-mail." — sem
// dizer que o acesso estava desativado, nem de quem era, nem o que fazer. O
// Kauan travou nisso criando o acesso da IRRIGA FOUR: o e-mail era de um acesso
// desativado, e não havia caminho para a frente.
//
// Desde 14/10/2026 o acesso é ligado direto às empresas (era a um Cliente), e
// a saída mudou junto:
// - acesso ATIVO: ligar a ele as empresas escolhidas — ele continua vendo o
//   que via e passa a ver também estas (cada e-mail tem um acesso só; é assim
//   que o contador de duas empresas vê as duas);
// - acesso DESATIVADO: reativar com o nome informado e SÓ as empresas
//   escolhidas — as que ele tinha antes saem. Reativar devolvendo empresas
//   antigas a alguém que saiu é o estrago que desativar pretendia evitar.
//
// Regra pura, usada pela action (a mensagem de erro) e pelo formulário (o texto
// e o botão, que acompanham as empresas escolhidas na tela sem ir ao servidor).

/** O acesso que já usa o e-mail digitado. */
export type AcessoExistente = {
  id: string;
  nome: string;
  /** O e-mail conferido — o aviso some quando a pessoa muda o e-mail no campo. */
  email: string;
  ativo: boolean;
  /** As empresas ligadas a ele hoje (ids), para saber se as escolhidas já estão. */
  empresaIds: string[];
  /** Os nomes delas, para a tela dizer de quem é o acesso. */
  empresas: string[];
};

/** "A", "A e B", "A, B e C", "A, B, C e mais 2". */
export function listaDeNomes(nomes: readonly string[], maximo = 3): string {
  if (nomes.length === 0) return "";
  if (nomes.length === 1) return nomes[0]!;
  if (nomes.length <= maximo) return `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}`;
  const resto = nomes.length - maximo;
  return `${nomes.slice(0, maximo).join(", ")} e mais ${resto}`;
}

function oQueVe(e: AcessoExistente): string {
  return e.empresas.length === 0 ? "sem empresa ligada" : `vê ${listaDeNomes(e.empresas)}`;
}

/** As escolhidas que o acesso ainda não tem. */
function novas<T extends { id: string }>(e: AcessoExistente, escolhidas: readonly T[]): T[] {
  const tem = new Set(e.empresaIds);
  return escolhidas.filter((x) => !tem.has(x.id));
}

/** O que a tela diz sobre o acesso que já existe, conforme as empresas escolhidas no formulário. */
export function mensagemDoEmailRepetido(e: AcessoExistente, escolhidas: readonly { id: string }[]): string {
  if (e.ativo && escolhidas.length > 0 && novas(e, escolhidas).length === 0) {
    return `Este e-mail já tem um acesso ativo, em nome de ${e.nome}, que já vê ${escolhidas.length === 1 ? "esta empresa" : "estas empresas"}. Não é preciso criar outro: se a pessoa não tem a senha, use “Enviar link”.`;
  }
  if (e.ativo) return `Este e-mail já tem um acesso ativo, em nome de ${e.nome} (${oQueVe(e)}). Cada e-mail tem um acesso só.`;
  return `Este e-mail já tem um acesso desativado, em nome de ${e.nome} (${oQueVe(e)}).`;
}

/**
 * O caminho que a tela oferece, ou `null` quando não há o que fazer (nenhuma
 * empresa escolhida, ou o acesso ativo já vê todas as escolhidas).
 */
export function saidaParaOEmailRepetido(
  e: AcessoExistente,
  escolhidas: readonly { id: string; nome: string }[]
): { botao: string; explicacao: string } | null {
  if (escolhidas.length === 0) return null;
  if (e.ativo) {
    const faltam = novas(e, escolhidas);
    if (faltam.length === 0) return null;
    return {
      botao: faltam.length === 1 ? "Ligar a empresa a este acesso" : `Ligar as ${faltam.length} empresas a este acesso`,
      explicacao: `O acesso continua vendo o que já via e passa a ver também ${listaDeNomes(faltam.map((x) => x.nome))}. A pessoa não precisa entrar de novo.`,
    };
  }
  return {
    botao: "Reativar este acesso",
    explicacao: `Em vez de criar outro, reaproveite esse acesso: ele volta a funcionar com o nome informado acima e passa a ver só ${listaDeNomes(escolhidas.map((x) => x.nome))}${e.empresas.length > 0 ? " — as empresas que ele tinha antes saem" : ""}. A pessoa recebe por e-mail o link para definir a senha.`,
  };
}
