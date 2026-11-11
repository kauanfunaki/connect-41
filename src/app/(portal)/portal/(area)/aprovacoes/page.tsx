import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { Aviso } from "@/components/ui/Aviso";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/financeiro/FiltroDePeriodo";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
import { AprovacoesDoPortal } from "@/components/aprovacoes/AprovacoesDoPortal";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { telaBloqueadaNoPortal } from "@/lib/portal/telasBloqueadas";
import { TelaIndisponivel } from "@/components/portal/TelaIndisponivel";
import { aprovacoesDoCliente } from "@/lib/financeiro/aprovacao/portal";
import { moeda } from "@/lib/financeiro/formato";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { SeletorDeEmpresaQueNavega } from "@/components/shared/SeletorDeEmpresaQueNavega";
import { empresaDaTela } from "@/lib/portal/empresaEscolhida";
import { empresaGuardadaDoPortal } from "@/lib/portal/empresaEscolhidaServidor";

export const dynamic = "force-dynamic";

const quantas = (n: number) => `${n} ${n === 1 ? "conta" : "contas"}`;

/** Contas a pagar das empresas do cliente esperando aprovação. */
export default async function PortalAprovacoesPage({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const { sessao, escopo, modulos } = await contextoFinanceiroDoPortal();
  if (!modulos.has("bpo_aprovacoes")) notFound();
  if (await telaBloqueadaNoPortal(escopo.tenantId, "/portal/aprovacoes")) return <TelaIndisponivel />;

  // A empresa escolhida no portal vale aqui também (11/11/2026): da URL ou a
  // guardada, e só se for do acesso — senão, todas as do cliente.
  const doAcesso = escopo.companyIds ?? [];
  const empresas = doAcesso.length > 1 ? await empresasDoSeletor(escopo.tenantId, doAcesso) : [];
  const empresaId = empresaDaTela((await searchParams).empresa, await empresaGuardadaDoPortal(), empresas.map((e) => e.id));

  const { contas, temAlcada } = await aprovacoesDoCliente(escopo, sessao.sub, { comAnexos: true, empresaId });
  const suas = contas.filter((c) => c.dentroDoTeto);
  const deOutros = contas.filter((c) => !c.dentroDoTeto);
  const soma = (lista: typeof contas) => moeda(lista.reduce((s, c) => s + c.valorCentavos, 0));

  return (
    <PageContainer>
      <PortalCabecalho
        titulo="Aprovações"
        descricao="Contas a pagar que só são pagas depois da sua aprovação."
        somenteLeitura={false}
      />

      {empresas.length > 1 && (
        <SeletorDeEmpresaQueNavega acao="/portal/aprovacoes" empresas={empresas} empresaId={empresaId} permitirTodas />
      )}

      {/* Dois cartões (P36, 11/11/2026): eram quatro — "Aguardando", "Dentro do
          seu teto", "Valor dentro do teto" e "Valor total" —, quase o mesmo
          número dito de quatro jeitos. Cada cartão diz quanto e quantas: o que
          o cliente aprova e o que espera outra pessoa. */}
      <FaixaDeTotais
        itens={[
          {
            rotulo: "Para você aprovar",
            valor: soma(suas),
            detalhe: quantas(suas.length),
            tom: suas.length > 0 ? "text-warning" : undefined,
          },
          { rotulo: "Com outra pessoa", valor: soma(deOutros), detalhe: quantas(deOutros.length), tom: "text-fg-muted" },
        ]}
      />

      {/* Aviso neutro (07/10/2026): era um parágrafo cinza de 12px, logo onde o
          cliente procurava o botão de aprovar. "Alçada" virou "limite de
          aprovação" em 11/11/2026 (P04). */}
      {!temAlcada && (
        <Aviso tom="neutro" className="mb-3">
          Você ainda não tem um limite de aprovação cadastrado: as contas aparecem aqui só para você acompanhar. Para aprovar,
          fale com o escritório.
        </Aviso>
      )}

      {/* A lista vazia entra no casco, como em Pendências: a barra diz "0 contas".
          Recomeça na troca de empresa (a troca não remonta a página): o que
          estava marcado e o funil eram das contas da anterior. */}
      <AprovacoesDoPortal
        key={empresaId ?? "todas"}
        contas={contas}
        temLimite={temAlcada}
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
