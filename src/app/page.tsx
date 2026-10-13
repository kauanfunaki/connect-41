import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SiteDoConnect } from "@/components/site/SiteDoConnect";
import { baseDomain } from "@/lib/auth/activeSector";
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

export const metadata: Metadata = {
  title: "Connect · a plataforma do escritório de contabilidade",
  description:
    "O Connect é a plataforma em que o escritório de contabilidade organiza o trabalho da equipe e atende os clientes pelo Portal do Cliente.",
};

export default async function RootPage() {
  const host = (await headers()).get("host");
  if (!ehHostDoSite(host, baseDomain())) redirect("/home");
  return <SiteDoConnect links={linksDoSite(process.env.APP_PUBLIC_URL)} />;
}
