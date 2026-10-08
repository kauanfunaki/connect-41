import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { ROTULO_DA_SITUACAO, type EnvioParaOCliente, type SituacaoDoEnvio } from "@/lib/envios/regras";

// A situação do envio ao cliente é Selo (escolha 2A, 08/10/2026). A cor diz de
// quem é a vez para quem olha: do lado da equipe, o rascunho e o aceite que
// não veio pedem atenção; o enviado espera o cliente abrir (marca); visto e
// aceito encerram.
const TOM_DA_SITUACAO: Record<SituacaoDoEnvio, TomDoSelo> = {
  rascunho: "atencao",
  enviado: "marca",
  "aguardando-aceite": "atencao",
  visto: "sucesso",
  aceito: "sucesso",
};

export function SeloDoEnvio({ situacao }: { situacao: SituacaoDoEnvio }) {
  return <Selo tom={TOM_DA_SITUACAO[situacao]}>{ROTULO_DA_SITUACAO[situacao]}</Selo>;
}

/**
 * No portal, a situação é a do cliente: "Novo" enquanto ele não abriu, e o
 * aceite — "Aguardando seu aceite" é a vez dele.
 */
export function SelosDoEnvioNoPortal({ envio }: { envio: EnvioParaOCliente }) {
  return (
    <>
      {envio.novo && <Selo tom="marca">Novo</Selo>}
      {envio.aceite === "pendente" && <Selo tom="atencao">Aguardando seu aceite</Selo>}
      {envio.aceite === "feito" && <Selo tom="sucesso">Aceito</Selo>}
    </>
  );
}
