import { headers } from "next/headers";
import { configDeCarreiras, portalNoHost, type PortalDoTenant } from "./enderecoDeCarreiras";

/**
 * O portal do escritório `slug` visto desta requisição: se é o da 41 (marca do
 * 41 Carreiras), se está no endereço próprio (links curtos) e os caminhos.
 * Null quando a página não existe neste host — no endereço do 41 Carreiras, só
 * o escritório da 41.
 *
 * Lê o host e as variáveis do ambiente, então a página que chama é dinâmica.
 */
export async function portalDaRequisicao(slug: string): Promise<PortalDoTenant | null> {
  const host = (await headers()).get("host");
  return portalNoHost(slug, host, configDeCarreiras(), process.env.APP_PUBLIC_URL);
}
