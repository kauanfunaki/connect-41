import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SiteDoConnect } from "@/components/site/SiteDoConnect";
import { baseDomain } from "@/lib/auth/activeSector";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";
import { ehHostDoSite } from "@/lib/site/host";
import { linksDoSite } from "@/lib/site/links";

// A rota raiz tem dois papéis, pelo host (13/10/2026):
//
// - no endereço principal (`APP_DOMAIN`, com ou sem `www.`), é o site de
//   apresentação do Connect, aberto a quem não tem sessão — o proxy libera
//   esta `/`, e só ela, com a mesma regra (lib/site/host);
// - em qualquer outro host (`app.`, os setores, localhost, ou sem APP_DOMAIN),
//   continua redirecionando para /home, dentro do grupo (app) que tem o shell.
//
// Os links do site para dentro do Connect usam APP_PUBLIC_URL (lib/site/links).
//
// O botão do topo (versão 3 do site): com o cookie da sessão da equipe no
// navegador, ele diz "Abrir o Connect" e leva ao /home; sem, "Entrar no
// Connect", para o /login. Só a PRESENÇA do cookie, sem validar o token: o
// botão é só um atalho, e quem decide se a sessão vale é o próprio Connect,
// do outro lado do link (o proxy renova ou manda para o login). O cookie vale
// para o domínio inteiro (`.useconnect.com.br`, lib/auth/cookies), então chega
// aqui; ele dura 15 minutos sem uso, e depois disso o botão volta a "Entrar".

export const metadata: Metadata = {
  title: "Connect · a plataforma do escritório de contabilidade",
  description:
    "O Connect é a plataforma em que o escritório de contabilidade organiza o trabalho da equipe e atende os clientes pelo Portal do Cliente — com a Lígia, a inteligência artificial do Connect, em cada setor.",
};

export default async function RootPage() {
  const host = (await headers()).get("host");
  if (!ehHostDoSite(host, baseDomain())) redirect("/home");
  const temSessao = Boolean((await cookies()).get(ACCESS_COOKIE)?.value);
  return <SiteDoConnect links={linksDoSite(process.env.APP_PUBLIC_URL)} temSessao={temSessao} />;
}
