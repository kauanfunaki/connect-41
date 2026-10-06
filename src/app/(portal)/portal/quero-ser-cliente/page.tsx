import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { MolduraDoPortal } from "@/components/portal/MolduraDoPortal";
import { FichaQueroSerCliente } from "@/components/portal/FichaQueroSerCliente";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { emitirCarimbo } from "@/lib/carreiras/antiRobo";
import { escritorioDaFicha } from "@/lib/leads/servidor";
import { enviarFichaDoPortal } from "./actions";

export const metadata: Metadata = {
  title: "Quero ser cliente · Portal 41",
  description: "Conte sobre a sua empresa e a equipe comercial do escritório entra em contato.",
};

// Dinâmica de propósito, como a candidatura do portal de vagas: o formulário
// leva um carimbo de tempo assinado na hora em que a página é montada. Uma
// página em cache serviria o mesmo carimbo velho a todo mundo.
export const dynamic = "force-dynamic";

/**
 * A ficha de quem ainda não é cliente (05/10/2026), aberta pelo "Não possui
 * conta?" do login do portal. O que a pessoa envia vira um lead no Comercial
 * do escritório dono do portal (ver `escritorioDaFicha`).
 */
export default async function QueroSerClientePage() {
  const escritorio = await escritorioDaFicha();

  return (
    <MolduraDoPortal
      titulo="Quero ser cliente"
      subtitulo="Conte um pouco sobre você e a sua empresa. A equipe comercial do escritório entra em contato."
    >
      {escritorio ? (
        <FichaQueroSerCliente carimbo={emitirCarimbo(new Date())} escritorio={escritorio.nome} action={enviarFichaDoPortal} />
      ) : (
        <Card className="p-6">
          <p className="text-[length:var(--fs-body)] text-fg-secondary leading-relaxed">
            A ficha não está recebendo cadastros agora. Tente de novo mais tarde — ou fale com o escritório pelos canais de
            sempre.
          </p>
          <Button href="/portal/login" variant="secondary" className="mt-5">
            <ArrowLeft size={14} />
            Voltar para o login
          </Button>
        </Card>
      )}
    </MolduraDoPortal>
  );
}
