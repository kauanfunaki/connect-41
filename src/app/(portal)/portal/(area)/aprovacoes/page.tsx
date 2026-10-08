import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { Aviso } from "@/components/ui/Aviso";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/financeiro/FiltroDePeriodo";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
import { AprovacoesDoPortal } from "@/components/aprovacoes/AprovacoesDoPortal";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { aprovacoesDoCliente } from "@/lib/financeiro/aprovacao/portal";
import { moeda } from "@/lib/financeiro/formato";

export const dynamic = "force-dynamic";

/** Contas a pagar das empresas do cliente esperando aprovação. */
export default async function PortalAprovacoesPage() {
  const { sessao, escopo, modulos } = await contextoFinanceiroDoPortal();
  if (!modulos.has("bpo_aprovacoes")) notFound();

  const { contas, temAlcada } = await aprovacoesDoCliente(escopo, sessao.sub);
  const dentro = contas.filter((c) => c.dentroDoTeto);

  return (
    <PageContainer>
      <PortalCabecalho
        titulo="Aprovações"
        descricao="Contas a pagar que só são pagas depois da sua aprovação."
        somenteLeitura={false}
      />

      <FaixaDeTotais
        itens={[
          { rotulo: "Aguardando", valor: String(contas.length) },
          { rotulo: "Dentro do seu teto", valor: String(dentro.length), tom: dentro.length > 0 ? "text-warning" : "" },
          { rotulo: "Valor dentro do teto", valor: moeda(dentro.reduce((s, c) => s + c.valorCentavos, 0)) },
          { rotulo: "Valor total aguardando", valor: moeda(contas.reduce((s, c) => s + c.valorCentavos, 0)), tom: "text-fg-muted" },
        ]}
      />

      {/* Aviso neutro (07/10/2026): era um parágrafo cinza de 12px, logo onde o
          cliente procurava o botão de aprovar. */}
      {!temAlcada && (
        <Aviso tom="neutro" className="mb-3">
          Você não tem alçada de aprovação cadastrada — as contas aparecem aqui só para acompanhamento.
        </Aviso>
      )}

      {/* A lista vazia entra no casco, como em Pendências: a barra diz "0 contas". */}
      <AprovacoesDoPortal
        contas={contas}
        vazio={
          <EmptyState
            icon={<ShieldCheck />}
            title="Nada aguardando aprovação"
            description="Quando houver conta a pagar esperando o seu “pode pagar”, ela aparece aqui e você recebe um e-mail."
          />
        }
      />
    </PageContainer>
  );
}
