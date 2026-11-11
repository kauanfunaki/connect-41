import { notFound } from "next/navigation";
import { Wallet } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { PortalCabecalho } from "./PortalCabecalho";
import { ListaDeContasDoPortal } from "./ListaDeContasDoPortal";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { telasBloqueadasDoPortal } from "@/lib/portal/telasBloqueadas";
import { contasDoEscopo, empresasDoSeletor, totaisDoEscopo } from "@/lib/financeiro/consultas";
import { empresaDaTela } from "@/lib/portal/empresaEscolhida";
import { empresaGuardadaDoPortal } from "@/lib/portal/empresaEscolhidaServidor";
import { saoPauloParts } from "@/lib/agenda";
import { formatarCompetencia } from "@/lib/format";
import { competenciaDoInstante } from "@/lib/financeiro/periodo";

/** O limite da consulta (`contasDoEscopo`): as 500 de vencimento mais recente. */
const LIMITE = 500;

/**
 * Contas a pagar ou a receber vistas pelo cliente.
 *
 * **Só leitura por construção**: não importa `AcoesDaConta` nem as actions de
 * baixa. As mesmas regras de situação e total da tela interna
 * (`situacaoDaConta`, `totalizar`), para o cliente e a equipe lerem o mesmo
 * "vencido".
 *
 * Os totais do topo são somados no banco, sobre todas as contas do escopo
 * (07/10) — eram a soma da lista, que para nas 500 de vencimento mais recente.
 *
 * Desde 11/11/2026 (P02) a lista, os cartões do topo e o recorte (busca e
 * Filtros) moram em `ListaDeContasDoPortal`, de cliente: o recorte filtra no
 * navegador, sem ida ao servidor. Aqui fica só a leitura.
 */
export async function PortalContas({ kind, empresaPedida }: { kind: "PAGAR" | "RECEBER"; empresaPedida?: string }) {
  const { escopo, modulos } = await contextoFinanceiroDoPortal();
  const modulo = kind === "PAGAR" ? "bpo_contas_pagar" : "bpo_contas_receber";
  if (!modulos.has(modulo)) notFound();

  // A empresa escolhida no portal vale aqui também (11/11/2026), como no Fluxo
  // de caixa: a da URL ou a guardada, e só se for do acesso — senão, todas as
  // do cliente. O recorte só estreita o escopo; nunca sai dele.
  const doAcesso = escopo.companyIds ?? [];
  const empresas = doAcesso.length > 1 ? await empresasDoSeletor(escopo.tenantId, doAcesso) : [];
  const empresaId = empresaDaTela(empresaPedida, await empresaGuardadaDoPortal(), empresas.map((e) => e.id));
  const recorte = empresaId ? { ...escopo, companyIds: [empresaId] } : escopo;

  const hojeKey = saoPauloParts(new Date()).dateKey;
  const [contas, totais, bloqueadas] = await Promise.all([
    contasDoEscopo(recorte, kind, hojeKey),
    totaisDoEscopo(recorte, kind, hojeKey),
    telasBloqueadasDoPortal(escopo.tenantId),
  ]);
  // A empresa do cliente só aparece quando o acesso cobre mais de uma — ele
  // sabe quem é; repetir o próprio nome em toda linha só empurrava o resto.
  const variasEmpresas = new Set(contas.map((c) => c.empresaNome)).size > 1;
  const aPagar = kind === "PAGAR";
  // A aprovação é de conta a pagar; o link só existe se a tela de aprovações
  // existir para este cliente — e se o escritório já a liberou (14/10/2026).
  const linkDaAprovacao = aPagar && modulos.has("bpo_aprovacoes") && !bloqueadas.has("/portal/aprovacoes");

  return (
    <PageContainer>
      <PortalCabecalho
        titulo={aPagar ? "Contas a pagar" : "Contas a receber"}
        descricao={aPagar ? "O que suas empresas têm a pagar." : "O que suas empresas têm a receber."}
      />

      <ListaDeContasDoPortal
        contas={contas}
        totais={{
          emAberto: totais.emAberto,
          vencido: totais.vencido,
          venceHoje: totais.venceHoje,
          pago: totais.pago,
          // O mês no formato do app ("Out/26"), e não "10/2026", que é só da
          // família da DRE (15/10/2026). Sem isso, "Pago R$ 10.483,00" não
          // dizia de quando.
          pagoDesde: totais.pagoDesde ? `desde ${formatarCompetencia(competenciaDoInstante(totais.pagoDesde))}` : undefined,
        }}
        aPagar={aPagar}
        empresas={empresas}
        empresaId={empresaId}
        variasEmpresas={variasEmpresas}
        linkDaAprovacao={linkDaAprovacao}
        limitada={contas.length >= LIMITE}
        limite={LIMITE}
        vazio={
          <EmptyState
            icon={<Wallet />}
            title={aPagar ? "Nenhuma conta a pagar" : "Nenhuma conta a receber"}
            description={
              aPagar
                ? "Quando a equipe lançar as contas da sua empresa, elas aparecem aqui com o vencimento e a situação."
                : "Quando a equipe lançar o que sua empresa tem a receber, aparece aqui com o vencimento e a situação."
            }
          />
        }
      />
    </PageContainer>
  );
}
