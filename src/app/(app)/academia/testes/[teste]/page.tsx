import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { CabecalhoDaAcademia } from "@/components/academia/CabecalhoDaAcademia";
import { RodadaDoTeste } from "@/components/academia/RodadaDoTeste";
import { abrirAcademia, estadoDoTeste } from "@/lib/academia/servidor";
import { ehNivel, ehTeste, motivoSemTeste } from "@/lib/academia/regras";

/**
 * Uma rodada de um teste (10/11/2026): a escolha do nível e do modo, o teste
 * e o resultado. O conteúdo só sai do servidor quando a pessoa clica em
 * "Começar" — a tentativa valendo do dia conta dali.
 */
export default async function RodadaPage({
  params,
  searchParams,
}: {
  params: Promise<{ teste: string }>;
  searchParams: Promise<{ modo?: string; nivel?: string }>;
}) {
  const [{ teste }, { modo, nivel }] = await Promise.all([params, searchParams]);
  if (!ehTeste(teste)) notFound();
  const { ctx, podeAdministrar, podeFazer } = await abrirAcademia();
  const estado = await estadoDoTeste(ctx, teste);
  return (
    <PageContainer>
      <CabecalhoDaAcademia ativa="testes" podeAdministrar={podeAdministrar} />
      <RodadaDoTeste
        teste={teste}
        modoInicial={modo === "treino" ? "treino" : "valendo"}
        nivelInicial={ehNivel(nivel) ? nivel : "medio"}
        usadosHoje={estado.usadosHoje}
        disponivel={estado.disponivel}
        motivoSemTeste={podeFazer ? null : motivoSemTeste(ctx)}
      />
    </PageContainer>
  );
}
