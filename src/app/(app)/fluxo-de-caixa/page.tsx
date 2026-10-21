import { notFound } from "next/navigation";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { saoPauloParts } from "@/lib/agenda";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { FiltroDePeriodo, AbasDeLink } from "@/components/financeiro/FiltroDePeriodo";
import { TabelaDoRealizado, CartoesDaProjecao, TabelaDoConsolidado, QuadroDoSaldoBancario } from "@/components/financeiro/FluxoDeCaixa";
import { saldoBancarioDoEscopo } from "@/lib/financeiro/conciliacao/saldoDasContas";
import {
  empresasDoSeletor,
  movimentosRealizados,
  titulosEmAberto,
  dadosDoConsolidado,
  nomesDasEmpresas,
  type EscopoFinanceiro,
} from "@/lib/financeiro/consultas";
import { fluxoRealizado, projecaoPorJanela, consolidarPorEmpresa } from "@/lib/financeiro/fluxo";
import { competenciaValida, competenciaDoInstante, competenciasAte, rotuloDaCompetencia } from "@/lib/financeiro/periodo";
import { NotaDeFonte } from "@/components/shared/NotaDeFonte";
import { FiltroDaEmpresa, EscolhaAEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import { escolherEmpresaDaTela } from "@/lib/empresas/ultimaEmpresa";
import { escopoFinanceiroDaEscolha } from "@/lib/empresas/escopoDaEscolha";

export const dynamic = "force-dynamic";

const MODULE = "bpo_fluxo_caixa";
// Setor que opera o módulo neste tenant (ver `setorDoModulo`); o do catálogo
// é só o padrão.
const SECTOR = getModuleDef(MODULE)!.sectorCode;

/**
 * Fluxo de caixa — realizado e projeção **na mesma tela**.
 *
 * Os dois protótipos tinham telas separadas para isso. Juntas, a pergunta
 * "de onde viemos e para onde vamos" se lê de cima para baixo sem trocar de
 * filtro. O consolidado por empresa é a outra aba: é o mesmo dado, cortado por
 * cliente em vez de por mês.
 */
export default async function FluxoDeCaixaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canViewSector(ctx, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const params = await searchParams;
  const aba = params.aba === "empresas" ? "empresas" : "fluxo";
  const agora = new Date();
  const hojeKey = saoPauloParts(agora).dateKey;
  const mes = competenciaValida(params.mes) ?? competenciaDoInstante(agora);

  // "Realizado e projeção" é de uma empresa por vez (13/10/2026): a da URL, a
  // última aberta pela pessoa, ou nenhuma — e a tela pede. Era "todas" por
  // padrão, e o realizado de seis meses trazia, sem teto, cada pagamento de
  // todos os clientes; somar o caixa de empresas diferentes também não diz o
  // caixa de ninguém. A visão de todas é a aba "Por empresa", que soma no banco.
  const empresas = await empresasDoSeletor(ctx.tenantId);
  // Com uma empresa em foco (21/10/2026), só a base dela — também em "Por empresa".
  const { escolha, noSeletor, foco, empresasDeTodas } = await escolherEmpresaDaTela(ctx, params.empresa, empresas, { comFoco: true });
  const escopo = escopoFinanceiroDaEscolha(ctx.tenantId, escolha);
  const empresaId = escopo?.companyIds?.[0] ?? null;

  // A empresa segue nas duas abas, para quem vai a "Por empresa" e volta.
  const qs = (a: string) => `/fluxo-de-caixa?mes=${mes}${empresaId ? `&empresa=${empresaId}` : ""}${a === "fluxo" ? "" : `&aba=${a}`}`;

  return (
    <PageContainer>
      <PageHeader
        title="Fluxo de caixa"
        subtitle="O que entrou e saiu, e o que os títulos em aberto dizem que vai entrar e sair."
      />
      {/* A empresa navega sozinha (e vira a última aberta); o mês, com "Aplicar". */}
      {aba === "fluxo" ? (
        <FiltroDaEmpresa acao="/fluxo-de-caixa" empresas={noSeletor} valor={empresaId} manter={{ mes }} foco={foco}>
          <FiltroDePeriodo acao="/fluxo-de-caixa" mes={mes} extras={{ empresa: empresaId ?? undefined }} naFileira />
        </FiltroDaEmpresa>
      ) : (
        <FiltroDePeriodo acao="/fluxo-de-caixa" mes={mes} extras={{ aba, empresa: empresaId ?? undefined }} />
      )}
      <AbasDeLink
        abas={[
          { chave: "fluxo", rotulo: "Realizado e projeção", href: qs("fluxo") },
          { chave: "empresas", rotulo: "Por empresa", href: qs("empresas") },
        ]}
        ativa={aba}
      />

      {aba === "empresas" ? (
        <PorEmpresa tenantId={ctx.tenantId} companyIds={empresasDeTodas} mes={mes} hojeKey={hojeKey} />
      ) : escopo ? (
        <Fluxo escopo={escopo} mes={mes} hojeKey={hojeKey} />
      ) : (
        <EscolhaAEmpresa
          escolha={escolha}
          porQue="O realizado e a projeção são de uma empresa por vez; a soma de todas, mês a mês, está na aba “Por empresa”."
          todasHref={qs("empresas")}
        />
      )}
    </PageContainer>
  );
}

async function Fluxo({ escopo, mes, hojeKey }: { escopo: EscopoFinanceiro; mes: string; hojeKey: string }) {
  const competencias = competenciasAte(mes, 6);
  const [movimentos, titulos, saldo] = await Promise.all([
    movimentosRealizados(escopo, competencias),
    titulosEmAberto(escopo),
    saldoBancarioDoEscopo(escopo),
  ]);
  return (
    <>
      <QuadroDoSaldoBancario saldo={saldo} />

      <h2 className="text-section font-semibold text-fg mb-2">Realizado — seis meses até {rotuloDaCompetencia(mes)}</h2>
      <TabelaDoRealizado meses={fluxoRealizado(movimentos, competencias)} />
      <NotaDeFonte className="mb-6">
        Pela data da baixa. O acumulado soma os saldos do período a partir do primeiro mês da tabela — é movimento
        de lançamentos, não o saldo da conta, que está no quadro acima.
      </NotaDeFonte>

      <h2 className="text-section font-semibold text-fg mb-2">Projeção — títulos em aberto a partir de hoje</h2>
      <CartoesDaProjecao projecao={projecaoPorJanela(titulos, hojeKey)} saldoInicial={saldo.centavos} />
      <NotaDeFonte>
        Cada janela acumula de hoje até o fim dela: a receber menos a pagar, pelo vencimento
        {saldo.centavos !== null ? "; o saldo projetado soma o saldo das contas" : ""}. Só o que já está lançado
        {titulos.length >= 5_000 ? " (limitado aos 5.000 títulos mais antigos)" : ""}.
      </NotaDeFonte>
    </>
  );
}

async function PorEmpresa({
  tenantId,
  companyIds,
  mes,
  hojeKey,
}: {
  tenantId: string;
  /** Com uma empresa em foco, a base dela; sem foco, `null` — o escritório. */
  companyIds: string[] | null;
  mes: string;
  hojeKey: string;
}) {
  const { somas, vencidas } = await dadosDoConsolidado({ tenantId, companyIds }, mes, hojeKey);
  const linhas = consolidarPorEmpresa(somas, vencidas);
  const nomes = await nomesDasEmpresas(tenantId, linhas.map((l) => l.companyId));
  return (
    <>
      <TabelaDoConsolidado linhas={linhas} nomes={nomes} linkParaContas />
      <NotaDeFonte>
        Pago e recebido em {rotuloDaCompetencia(mes)}, pela data da baixa. Vencidas é a posição de hoje. Empresa sem
        movimento no mês e sem conta vencida não aparece.
      </NotaDeFonte>
    </>
  );
}
