import { PageContainer } from "@/components/shared/PageContainer";
import { CabecalhoDaAcademia } from "@/components/academia/CabecalhoDaAcademia";
import { RodadaDoDesafio } from "@/components/academia/RodadaDoDesafio";
import { abrirAcademia, desafioDeHoje } from "@/lib/academia/servidor";
import { motivoSemTeste } from "@/lib/academia/regras";

export const metadata = { title: "Desafio do dia · Academia" };

/**
 * O desafio do dia (Fase 2, 11/11/2026, Controle interno funcionalidade-594):
 * 1 minuto de digitação, o mesmo texto para todo mundo no dia. O texto só sai
 * do servidor no "Começar o desafio" — a tentativa do dia conta dali.
 */
export default async function DesafioDaAcademiaPage() {
  const { ctx, podeAdministrar, podeFazer } = await abrirAcademia();
  const desafio = await desafioDeHoje(ctx);
  return (
    <PageContainer>
      <CabecalhoDaAcademia ativa="inicio" podeAdministrar={podeAdministrar} />
      <RodadaDoDesafio inicial={desafio} motivoSemTeste={podeFazer ? null : motivoSemTeste(ctx)} />
    </PageContainer>
  );
}
