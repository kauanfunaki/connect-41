// Os sócios da empresa, e a única pergunta que eles respondem hoje.
//
// O cadastro nasceu de uma pergunta do Empresa Fácil: **"Reside no local?"** é
// Sim quando o endereço do sócio é o da empresa, Não quando não é (Kauan,
// 15/09/2026). Até aqui o Connect não tinha onde guardar isso — não havia
// modelo de sócio nenhum —, e a viabilidade devolvia a pergunta nula para uma
// pessoa responder. Ver `viabilidade.ts`.
//
// ─── Por que a comparação é campo a campo, e não por texto ──────────────────
//
// "Rua XV de Novembro, 1000" e "R. XV de Novembro 1000" são o mesmo endereço, e
// comparar as strings diria que não. CEP e número são os dois campos que
// identificam o imóvel sem depender de como alguém digitou o logradouro — o CEP
// já é a rua, e o número é o imóvel nela.
//
// ─── E por que existe um terceiro estado ────────────────────────────────────
//
// Porque declarar residência a um órgão com base em cadastro incompleto é
// afirmar o que não se sabe. Falta CEP ou número de um dos lados: não dá para
// comparar. Mesmo CEP e número, mas só um dos dois tem complemento: pode ser a
// mesma sala com o cadastro do sócio incompleto, ou o apartamento de cima.
// Nos dois casos a resposta é "não sei", e quem preenche decide.

export type EnderecoComparavel = {
  zipCode: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
};

function digitos(valor: string | null): string {
  return (valor ?? "").replace(/\D/g, "");
}

function texto(valor: string | null): string {
  return (valor ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

/**
 * O sócio mora no endereço da empresa?
 *
 * `null` quando não dá para afirmar — ver o cabeçalho.
 */
export function moraNoMesmoEndereco(
  empresa: EnderecoComparavel,
  socio: EnderecoComparavel
): boolean | null {
  const cepEmpresa = digitos(empresa.zipCode);
  const cepSocio = digitos(socio.zipCode);
  const numeroEmpresa = texto(empresa.addressNumber);
  const numeroSocio = texto(socio.addressNumber);

  if (!cepEmpresa || !cepSocio || !numeroEmpresa || !numeroSocio) return null;
  if (cepEmpresa !== cepSocio || numeroEmpresa !== numeroSocio) return false;

  const complementoEmpresa = texto(empresa.addressComplement);
  const complementoSocio = texto(socio.addressComplement);
  if (!complementoEmpresa && !complementoSocio) return true;
  // Um lado com complemento e o outro sem: mesma sala com cadastro incompleto,
  // ou o andar de cima. As duas leituras cabem, então nenhuma vale.
  if (!complementoEmpresa || !complementoSocio) return null;
  return complementoEmpresa === complementoSocio;
}

/**
 * A resposta de "Reside no local" para a empresa inteira.
 *
 * A pergunta do formulário é sobre o imóvel, não sobre uma pessoa: basta **um**
 * sócio morar ali para a resposta ser Sim. Daí a ordem — um "sim" decide, e só
 * na ausência dele a dúvida de qualquer sócio contamina o conjunto.
 *
 * Sem sócio cadastrado devolve `null`, e não `false`: empresa sem sócio na
 * ficha é cadastro que ninguém preencheu, não empresa sem sócio.
 */
export function algumSocioResideNoEndereco(
  empresa: EnderecoComparavel,
  socios: EnderecoComparavel[]
): boolean | null {
  if (socios.length === 0) return null;
  const respostas = socios.map((s) => moraNoMesmoEndereco(empresa, s));
  if (respostas.some((r) => r === true)) return true;
  if (respostas.some((r) => r === null)) return null;
  return false;
}

/**
 * A soma das participações, em porcento.
 *
 * Não é validação: contrato com 99,99% por arredondamento existe, e recusar o
 * cadastro por causa disso impediria de guardar o que o contrato diz. A tela
 * mostra a soma e deixa a conferência com quem conhece o contrato.
 */
export function somaDasParticipacoes(socios: { sharePercent: number | null }[]): number {
  return socios.reduce((total, s) => total + (s.sharePercent ?? 0), 0);
}
