// Como a empresa é chamada nas telas.
//
// São três nomes, e cada um serve para uma coisa:
//
//   name        — Razão Social. O nome jurídico. Vai em documento, não em lista.
//   tradeName   — Nome Fantasia. Como o mercado conhece.
//   displayName — como o TIME chama, e é o que a listagem mostra.
//
// O terceiro existe porque os dois primeiros não distinguem estabelecimento:
// matriz e filial da BLD têm razão social idêntica, e a listagem ficava com
// duas linhas iguais. Aqui vai "BLD MOGI - SP".

export type EmpresaComNome = {
  name: string;
  displayName?: string | null;
};

/**
 * O nome a mostrar. Cai na razão social quando não há apelido — que é o valor
 * certo para quem não tem, não um placeholder.
 *
 * Toda tela que lista ou intitula empresa deve passar por aqui, para o apelido
 * não valer só em metade do sistema.
 */
export function nomeExibicao(empresa: EmpresaComNome): string {
  const apelido = empresa.displayName?.trim();
  return apelido ? apelido : empresa.name;
}

/**
 * A razão social, quando ela **acrescenta** informação ao nome já exibido.
 *
 * Devolve `null` quando o nome de exibição já é a razão social, para a tela não
 * imprimir a mesma string duas vezes lado a lado.
 */
export function razaoSocialSecundaria(empresa: EmpresaComNome): string | null {
  return nomeExibicao(empresa) === empresa.name ? null : empresa.name;
}
