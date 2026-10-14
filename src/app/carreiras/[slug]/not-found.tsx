import { headers } from "next/headers";
import { SearchX } from "lucide-react";
import { TelaDeAvisoPublica } from "@/components/publico/TelaDeAvisoPublica";
import { configDeCarreiras, ehHostDeCarreiras, portalNoHost } from "@/lib/carreiras/enderecoDeCarreiras";
import { NaoEncontrada41 } from "@/components/carreiras/41/NaoEncontrada41";

/**
 * Vaga que fechou (ou endereço errado) no portal de vagas (14/10/2026). Antes
 * caía no 404 geral do Connect, com "Ir para o início" levando ao login da
 * equipe — e o candidato não é da equipe. No endereço do 41 Carreiras, desde
 * 15/10/2026, a página com a cara dele: a busca e "Ver vagas abertas".
 */
export default async function VagaNaoEncontrada() {
  const host = (await headers()).get("host");
  const config = configDeCarreiras();
  const portal = config?.tenantSlug && ehHostDeCarreiras(host, config) ? portalNoHost(config.tenantSlug, host, config) : null;
  if (portal) return <NaoEncontrada41 rotas={portal.rotas} />;

  return (
    <TelaDeAvisoPublica
      titulo="Vaga não encontrada"
      texto="Esta vaga pode ter sido encerrada, ou o endereço está incompleto."
      icone={<SearchX />}
    />
  );
}
