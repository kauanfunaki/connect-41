// O "Novo acesso" do portal quando o e-mail já tem acesso (13/10/2026).
//
// Até então a resposta era só "Já existe um acesso com este e-mail." — sem
// dizer que o acesso estava desativado, nem de qual cliente era, nem o que
// fazer. O Kauan travou nisso criando o acesso da IRRIGA FOUR: o e-mail era de
// um acesso desativado, e não havia caminho para a frente.
//
// Regra pura, usada pela action (a mensagem de erro) e pelo formulário (o texto
// e o botão, que acompanham o cliente escolhido na tela sem ir ao servidor).

/** O acesso que já usa o e-mail digitado. */
export type AcessoExistente = {
  id: string;
  nome: string;
  /** O e-mail conferido — o aviso some quando a pessoa muda o e-mail no campo. */
  email: string;
  ativo: boolean;
  /** O cliente a que ele pertence hoje. */
  clienteId: string;
  cliente: string;
};

/** O que a tela diz sobre o acesso que já existe, conforme o cliente escolhido no formulário. */
export function mensagemDoEmailRepetido(e: AcessoExistente, clienteEscolhidoId: string): string {
  const mesmoCliente = e.clienteId === clienteEscolhidoId;
  if (e.ativo && mesmoCliente) {
    return `Este e-mail já tem um acesso ativo neste cliente, em nome de ${e.nome}. Não é preciso criar outro: se a pessoa não tem a senha, use “Enviar link” na lista.`;
  }
  if (e.ativo) return `Este e-mail já tem um acesso ativo no cliente ${e.cliente}, em nome de ${e.nome}. Cada e-mail tem um acesso só.`;
  if (mesmoCliente) return `Este e-mail já tem um acesso desativado neste cliente, em nome de ${e.nome}.`;
  return `Este e-mail já tem um acesso desativado, do cliente ${e.cliente}, em nome de ${e.nome}.`;
}

/**
 * O caminho que a tela oferece, ou `null` quando não há o que fazer (o acesso
 * já está ativo no cliente escolhido).
 */
export function saidaParaOEmailRepetido(
  e: AcessoExistente,
  clienteEscolhido: { id: string; nome: string } | null
): { botao: string; explicacao: string } | null {
  if (!clienteEscolhido) return null;
  const mesmoCliente = e.clienteId === clienteEscolhido.id;
  if (e.ativo && mesmoCliente) return null;
  if (e.ativo) {
    return {
      botao: `Passar para o cliente ${clienteEscolhido.nome}`,
      explicacao: `Se a pessoa agora é do cliente ${clienteEscolhido.nome}, passe o acesso para ele: ela deixa de ver as empresas de ${e.cliente} e precisa entrar de novo no portal.`,
    };
  }
  if (mesmoCliente) {
    return {
      botao: "Reativar este acesso",
      explicacao: "Dá para reativá-lo com o nome informado acima. A pessoa recebe por e-mail o link para definir a senha.",
    };
  }
  return {
    botao: `Reativar e passar para o cliente ${clienteEscolhido.nome}`,
    explicacao: `Em vez de criar outro, reaproveite esse acesso: ele volta a funcionar com o nome informado acima e passa a ver só as empresas de ${clienteEscolhido.nome}. A pessoa recebe por e-mail o link para definir a senha.`,
  };
}
