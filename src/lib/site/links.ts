// Os links do site de apresentação para dentro do Connect (13/10/2026).
//
// O site mora no endereço principal, e o Connect em `app.` — então o link é
// absoluto, com a origem de `APP_PUBLIC_URL`, para levar a pessoa direto ao
// endereço novo. Variável de servidor, lida em runtime: `NEXT_PUBLIC_*` é
// gravada no build, e o Dockerfile do projeto builda sem recebê-la.
//
// Sem `APP_PUBLIC_URL` (ou com um valor quebrado), o link fica relativo: o host
// principal ainda serve o login e o portal, então ele funciona do mesmo jeito —
// só não troca de endereço.
//
// As vagas saíram do site em 14/10/2026: o portal de vagas é da 41 e tem
// endereço próprio (o 41 Carreiras, lib/carreiras/enderecoDeCarreiras).

/** O caminho do Connect, na origem de `APP_PUBLIC_URL` quando ela existe. */
export function enderecoDoApp(caminho: string, appPublicUrl: string | null | undefined): string {
  const publica = appPublicUrl?.trim();
  if (!publica) return caminho;
  try {
    // Só a origem: barra no fim ou caminho na variável não mudam o endereço,
    // como no redirect do Google do portal (lib/auth/googleDoPortal).
    return `${new URL(publica).origin}${caminho}`;
  } catch {
    return caminho;
  }
}

export type LinksDoSite = {
  /** Entrada do Portal do Cliente. */
  portal: string;
  /** Entrada da equipe. */
  entrar: string;
  /**
   * O Connect para quem já tem a sessão da equipe no navegador (o botão do
   * topo vira "Abrir o Connect" — ver app/page.tsx).
   */
  abrir: string;
  /** Política de privacidade (a do portal, que é a que o Google confere). */
  privacidade: string;
};

export function linksDoSite(appPublicUrl: string | null | undefined): LinksDoSite {
  return {
    portal: enderecoDoApp("/portal/login", appPublicUrl),
    entrar: enderecoDoApp("/login", appPublicUrl),
    abrir: enderecoDoApp("/home", appPublicUrl),
    privacidade: enderecoDoApp("/portal/privacidade", appPublicUrl),
  };
}
