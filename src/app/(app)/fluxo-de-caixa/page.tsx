import { Building2, CalendarRange, Tags, TrendingUp } from "lucide-react";
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
import { CategoriasDoCliente } from "@/components/financeiro/CategoriasDoCliente";
import { dadosDasCategoriasDoCliente } from "@/lib/fluxoDeCaixa/categoriasDoClienteServidor";
import { DataDeCaixa } from "@/components/financeiro/DataDeCaixa";
import { PrevistoDoFluxo } from "@/components/financeiro/PrevistoDoFluxo";
import { dadosDoPrevisto, dataDeCaixaDaEmpresa } from "@/lib/fluxoDeCaixa/previstoServidor";
import { celulaDeTexto, granularidadeValida, type Granularidade } from "@/lib/fluxoDeCaixa/projecao";

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
  const aba = params.aba === "empresas" || params.aba === "categorias" || params.aba === "previsto" ? params.aba : "fluxo";
  const ver = granularidadeValida(params.ver);
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
  const { escolha, foco, empresasDeTodas } = await escolherEmpresaDaTela(ctx, params.empresa, empresas, { comFoco: true });
  const escopo = escopoFinanceiroDaEscolha(ctx.tenantId, escolha);
  const empresaId = escopo?.companyIds?.[0] ?? null;

  // A empresa segue nas duas abas, para quem vai a "Por empresa" e volta.
  const qs = (a: string) => `/fluxo-de-caixa?mes=${mes}${empresaId ? `&empresa=${empresaId}` : ""}${a === "fluxo" ? "" : `&aba=${a}`}`;
  // O Previsto não tem mês: a visão (dias, semanas, meses) e a empresa.
  const enderecoDaVisao = (g: Granularidade) => `/fluxo-de-caixa?aba=previsto&ver=${g}${empresaId ? `&empresa=${empresaId}` : ""}`;

  return (
    <PageContainer>
      <PageHeader
        title="Fluxo de caixa"
      />
      {/* A empresa navega sozinha (e vira a última aberta); o mês, com "Aplicar". */}
      {aba === "fluxo" ? (
        <FiltroDaEmpresa foco={foco}>
          <FiltroDePeriodo acao="/fluxo-de-caixa" mes={mes} extras={{ empresa: empresaId ?? undefined }} naFileira />
        </FiltroDaEmpresa>
      ) : aba === "categorias" || aba === "previsto" ? (
        // O modelo e o previsto são da empresa, sem mês: só o filtro da empresa.
        <FiltroDaEmpresa foco={foco} />
      ) : (
        <FiltroDePeriodo acao="/fluxo-de-caixa" mes={mes} extras={{ aba, empresa: empresaId ?? undefined }} />
      )}
      <AbasDeLink
        abas={[
          { chave: "fluxo", rotulo: "Realizado e projeção", href: qs("fluxo"), icone: <TrendingUp /> },
          { chave: "previsto", rotulo: "Previsto", href: enderecoDaVisao(ver), icone: <CalendarRange /> },
          { chave: "empresas", rotulo: "Por empresa", href: qs("empresas"), icone: <Building2 /> },
          { chave: "categorias", rotulo: "Modelo do fluxo", href: qs("categorias"), icone: <Tags /> },
        ]}
        ativa={aba}
      />

      {aba === "empresas" ? (
        <PorEmpresa tenantId={ctx.tenantId} companyIds={empresasDeTodas} mes={mes} hojeKey={hojeKey} />
      ) : aba === "categorias" ? (
        empresaId ? (
          <>
            <DataDeCaixa companyId={empresaId} atual={await dataDeCaixaDaEmpresa(ctx.tenantId, empresaId)} />
            <CategoriasDoCliente companyId={empresaId} dados={await dadosDasCategoriasDoCliente(ctx.tenantId, empresaId)} />
          </>
        ) : (
          <EscolhaAEmpresa escolha={escolha} porQue="O modelo do fluxo é de uma empresa por vez: cada cliente tem a nomenclatura e a data de caixa dele." />
        )
      ) : aba === "previsto" ? (
        empresaId ? (
          <PrevistoDoFluxo
            dados={await dadosDoPrevisto({ tenantId: ctx.tenantId, companyId: empresaId, granularidade: ver, celula: celulaDeTexto(params.celula) })}
            enderecoDaVisao={enderecoDaVisao}
          />
        ) : (
          <EscolhaAEmpresa escolha={escolha} porQue="O previsto é de uma empresa por vez: o saldo, a data de caixa e as categorias são da empresa." />
        )
      ) : escopo ? (
        <Fluxo escopo={escopo} mes={mes} hojeKey={hojeKey} />
      ) : (
        <EscolhaAEmpresa escolha={escolha} porQue="O realizado e a projeção são de uma empresa por vez; a soma de todas, mês a mês, está na aba “Por empresa”." />
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

      <h2 className="text-section font-semibold text-fg mb-2">Projeção — títulos em aberto a partir de hoje</h2>
      <CartoesDaProjecao projecao={projecaoPorJanela(titulos, hojeKey)} saldoInicial={saldo.centavos} />
      {/* Como a projeção soma está no artigo da tela; aqui fica só o corte,
          que depende do dado (17/11/2026, melhoria-707). */}
      {titulos.length >= 5_000 && <NotaDeFonte>A projeção considera só os 5.000 títulos mais antigos.</NotaDeFonte>}
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
    </>
  );
}
