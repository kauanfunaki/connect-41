// A foto de cada desenvolvedor é a do GitHub (26/10/2026): `github.com/<login>.png`
// redireciona para o `avatar_url` da conta em avatars.githubusercontent.com — as
// duas origens estão no `img-src` da CSP (next.config.ts). Pelo login, e não por
// uma coluna com o `avatar_url`, porque o sync guarda o `node_id` e o login, e o
// login basta para a imagem sem migração.
//
// Só login de conta passa: letras, números e hífen, até 39 caracteres. Bot
// ("dependabot[bot]") e "Autoria não identificada" ficam com as iniciais, como
// a foto que não carrega.
const LOGIN_DE_CONTA = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

/** A URL da foto do GitHub para um login, ou `null` quando ele não tem uma. */
export function avatarDoGithub(login: string, tamanho = 64): string | null {
  return LOGIN_DE_CONTA.test(login) ? `https://github.com/${login}.png?size=${tamanho}` : null;
}

/** O que aparece no lugar da foto: as duas primeiras letras do login. */
export function iniciaisDoLogin(login: string): string {
  return login.slice(0, 2).toUpperCase();
}
