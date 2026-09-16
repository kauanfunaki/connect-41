import { notFound } from "next/navigation";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
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
  if (!ctx.tenantId || !canViewSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const params = await searchParams;
  const aba = params.aba === "empresas" ? "empresas" : "fluxo";
  const agora = new Date();
  const hojeKey = saoPauloParts(agora).dateKey;
  const mes = competenciaValida(params.mes) ?? competenciaDoInstante(agora);

  const empresas = await empresasDoSeletor(ctx.tenantId);
  const empresaId = params.empresa && empresas.some((e) => e.id === params.empresa) ? params.empresa : null;
  const escopo: EscopoFinanceiro = { tenantId: ctx.tenantId, companyIds: empresaId ? [empresaId] : null };

  const qs = (a: string) => `/fluxo-de-caixa?mes=${mes}${empresaId && a === "fluxo" ? `&empresa=${empresaId}` : ""}${a === "fluxo" ? "" : `&aba=${a}`}`;

  return (
    <PageContainer>
      <PageHeader
        title="Fluxo de caixa"
        subtitle="O que entrou e saiu, e o que os títulos em aberto dizem que vai entrar e sair."
      />
      <FiltroDePeriodo
        acao="/fluxo-de-caixa"
        empresas={aba === "fluxo" ? empresas : undefined}
        empresaId={empresaId}
        permitirTodas
        mes={mes}
        extras={{ aba: aba === "fluxo" ? undefined : aba }}
      />
      <AbasDeLink
        abas={[
          { chave: "fluxo", rotulo: "Realizado e projeção", href: qs("fluxo") },
          { chave: "empresas", rotulo: "Por empresa", href: qs("empresas") },
        ]}
        ativa={aba}
      />

      {aba === "fluxo" ? <Fluxo escopo={escopo} mes={mes} hojeKey={hojeKey} /> : <PorEmpresa tenantId={ctx.tenantId} mes={mes} hojeKey={hojeKey} />}
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

      <h2 className="text-[14px] font-semibold text-fg mb-2">Realizado — seis meses até {rotuloDaCompetencia(mes)}</h2>
      <TabelaDoRealizado meses={fluxoRealizado(movimentos, competencias)} />
      <p className="text-[11px] text-fg-muted mt-2 mb-6">
        Pela data da baixa. O acumulado soma os saldos do período a partir do primeiro mês da tabela — é movimento
        de lançamentos, não o saldo da conta, que está no quadro acima.
      </p>

      <h2 className="text-[14px] font-semibold text-fg mb-2">Projeção — títulos em aberto a partir de hoje</h2>
      <CartoesDaProjecao projecao={projecaoPorJanela(titulos, hojeKey)} saldoInicial={saldo.centavos} />
      <p className="text-[11px] text-fg-muted mt-2">
        Cada janela acumula de hoje até o fim dela: a receber menos a pagar, pelo vencimento
        {saldo.centavos !== null ? "; o saldo projetado soma o saldo das contas" : ""}. Só o que já está lançado
        {titulos.length >= 5_000 ? " (limitado aos 5.000 títulos mais antigos)" : ""}.
      </p>
    </>
  );
}

async function PorEmpresa({ tenantId, mes, hojeKey }: { tenantId: string; mes: string; hojeKey: string }) {
  const { somas, vencidas } = await dadosDoConsolidado({ tenantId, companyIds: null }, mes, hojeKey);
  const linhas = consolidarPorEmpresa(somas, vencidas);
  const nomes = await nomesDasEmpresas(tenantId, linhas.map((l) => l.companyId));
  return (
    <>
      <TabelaDoConsolidado linhas={linhas} nomes={nomes} linkParaContas />
      <p className="text-[11px] text-fg-muted mt-2">
        Pago e recebido em {rotuloDaCompetencia(mes)}, pela data da baixa. Vencidas é a posição de hoje. Empresa sem
        movimento no mês e sem conta vencida não aparece.
      </p>
    </>
  );
}
