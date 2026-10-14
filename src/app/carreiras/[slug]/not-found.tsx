import { headers } from "next/headers";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TelaDeAvisoPublica } from "@/components/publico/TelaDeAvisoPublica";
import { configDeCarreiras, ehHostDeCarreiras } from "@/lib/carreiras/enderecoDeCarreiras";

/**
 * Vaga que fechou (ou endereço errado) no portal de vagas (14/10/2026). Antes
 * caía no 404 geral do Connect, com "Ir para o início" levando ao login da
 * equipe — e o candidato não é da equipe. No endereço do 41 Carreiras, o botão
 * volta para as vagas abertas.
 */
export default async function VagaNaoEncontrada() {
  const noPortal = ehHostDeCarreiras((await headers()).get("host"), configDeCarreiras());
  return (
    <TelaDeAvisoPublica
      titulo="Vaga não encontrada"
      texto="Esta vaga pode ter sido encerrada, ou o endereço está incompleto."
      icone={<SearchX />}
    >
      {noPortal && (
        <Button href="/" className="mt-1">
          Ver as vagas abertas
        </Button>
      )}
    </TelaDeAvisoPublica>
  );
}
