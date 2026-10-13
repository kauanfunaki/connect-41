// O host do site de apresentação (13/10/2026).
//
// Decisão do Kauan: o endereço principal (`useconnect.com.br`) vira o site, e o
// Connect fica em `app.useconnect.com.br` (no ar desde 09/10). Só a página
// inicial `/` muda, e só no host principal — com ou sem `www.`. Em qualquer
// outro host (`app.`, os setores, localhost) a `/` continua levando ao Connect.
//
// O domínio vem de `APP_DOMAIN` (ver `baseDomain`, em lib/auth/activeSector):
// sem ele não há como saber qual é o host principal, e aí nada vira site — o
// mesmo cuidado que o setor pelo subdomínio já tem num deploy mal configurado.
//
// Função pura porque roda em dois lugares que precisam concordar: o proxy, que
// libera a `/` sem sessão, e a própria página, que escolhe entre o site e o
// redirecionamento para /home.

/** O host é o do site (o domínio principal, com ou sem `www.`)? */
export function ehHostDoSite(host: string | null | undefined, appDomain: string | null | undefined): boolean {
  const dominio = appDomain?.trim().toLowerCase().replace(/^\.+/, "");
  if (!host || !dominio) return false;
  // Sem a porta, e sem diferença de caixa: o `Host` chega como o cliente mandou.
  const semPorta = host.trim().toLowerCase().split(":")[0]!;
  return semPorta === dominio || semPorta === `www.${dominio}`;
}
