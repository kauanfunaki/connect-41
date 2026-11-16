import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Aviso } from "@/components/ui/Aviso";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { getPrisma } from "@/lib/prisma";
import { saoPauloParts } from "@/lib/agenda";
import { nomeExibicao } from "@/lib/companyName";
import { formatarNumero } from "@/lib/format";
import { CAMPOS_DA_EMPRESA_NO_SELETOR } from "@/lib/empresas/opcoesDoSeletor";
import { escolherEmpresaDaTela } from "@/lib/empresas/ultimaEmpresa";
import { empresaNaUrl, idDaEscolha } from "@/lib/empresas/escolhaDaEmpresa";
import { FiltroDaEmpresa, EscolhaAEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import {
  DIMENSOES,
  MEDIDAS,
  MODULO_DA_TABELA_DINAMICA,
  MAXIMO_DE_COLUNAS,
  MAXIMO_DE_LINHAS,
  lerConfiguracao,
  montarTabela,
} from "@/lib/relatorios/tabelaDinamica";
import { fatosDaBase, LIMITE_DE_FATOS } from "@/lib/relatorios/tabelaDinamicaServidor";
import { TabelaDinamica } from "@/components/relatorios/TabelaDinamica";
import { ConfiguracaoDaTabela } from "@/components/relatorios/ConfiguracaoDaTabela";

/**
 * A tabela dinâmica do financeiro (20/10/2026 — "tabelas dinâmicas como o
 * Omie"). A configuração mora no endereço, e o link da tela guarda a tabela.
 * A soma é no servidor (`montarTabela`); a tela recebe a tabela pronta.
 *
 * Desde 16/11/2026 (melhoria-719) quem configura é a `ConfiguracaoDaTabela`:
 * a barra (base, filtros, visões prontas, exportação) e os campos e áreas,
 * com a tabela trocando a cada mudança. Aqui ficam a leitura do endereço, a
 * consulta e a tabela, que entra nela como filha.
 */
export default async function TabelaDinamicaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !getModuleDef(MODULO_DA_TABELA_DINAMICA)) notFound();
  const setores = await setoresDoModulo(ctx.tenantId, MODULO_DA_TABELA_DINAMICA);
  if (!setores || !canViewSector(ctx, setores)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULO_DA_TABELA_DINAMICA))) notFound();

  const params = await searchParams;
  const agora = new Date();
  const hoje = saoPauloParts(agora).dateKey;
  const config = lerConfiguracao(params, hoje);

  const empresasDoEscritorio = await getPrisma().company.findMany({
    where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROSPECT"] } },
    select: CAMPOS_DA_EMPRESA_NO_SELETOR,
  });
  const empresas = empresasDoEscritorio
    .map((e) => ({ id: e.id, nome: nomeExibicao(e), logoUrl: e.logoUrl, cnpj: e.cnpj, matrizId: e.parentCompanyId }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  // Com uma empresa em foco (21/10/2026), só a base dela; "Todas" é a base.
  const { escolha, foco, empresasDeTodas } = await escolherEmpresaDaTela(ctx, params.empresa, empresas, {
    permitirTodas: true,
    comFoco: true,
  });
  const empresaId = idDaEscolha(escolha);
  const empresaUrl = empresaNaUrl(escolha) ?? null;

  const cabecalho = <PageHeader title="Tabela dinâmica" />;
  const filtroDaEmpresa = (
    <FiltroDaEmpresa foco={foco} />
  );

  if (escolha.tipo === "escolher") {
    return (
      <PageContainer>
        {cabecalho}
        {filtroDaEmpresa}
        <EscolhaAEmpresa escolha={escolha} porQue="A tabela abre numa empresa para não somar o escritório inteiro sem querer." />
      </PageContainer>
    );
  }

  const { fatos, limitada } = await fatosDaBase(ctx.tenantId, empresaId ?? empresasDeTodas, config, agora);
  const tabela = montarTabela(fatos, config);

  return (
    <PageContainer>
      {cabecalho}
      {filtroDaEmpresa}

      {/* Sem `key`: a configuração da tela é sempre a que veio do endereço
          (`config`), e ela não guarda cópia — remontar só fecharia o painel
          de filtros e levaria o foco a cada mudança. */}
      <ConfiguracaoDaTabela config={config} empresa={empresaUrl} visao={params.visao ?? null} hoje={hoje}>
        <p className="mb-2 text-helper text-fg-muted">
          {formatarNumero(fatos.length, 0)} {config.base === "baixas" ? "movimentos de baixa" : "linhas de conta"}
        </p>

        {limitada && (
          <Aviso tom="atencao" className="mb-3">
            A consulta parou em {formatarNumero(LIMITE_DE_FATOS, 0)} linhas. Filtre por empresa, período ou tipo para ver tudo.
          </Aviso>
        )}
        {(tabela.linhasAgrupadas > 0 || tabela.colunasAgrupadas > 0) && (
          <Aviso tom="info" className="mb-3">
            A tela mostra até {MAXIMO_DE_LINHAS} linhas e {MAXIMO_DE_COLUNAS} colunas; o resto está somado em “Outros”. A exportação leva tudo.
          </Aviso>
        )}

        {fatos.length === 0 ? (
          <Card>
            <EmptyState title="Nada neste recorte" description="Mude o período, o tipo ou a situação — ou escolha outra empresa." />
          </Card>
        ) : (
          // A `key` é das linhas: o que estava aberto é de outra tabela quando
          // os campos das linhas mudam, e continua valendo quando muda só o
          // filtro, a coluna ou o valor (o estado velho do filtro sem recarregar).
          <TabelaDinamica
            key={`${config.base}:${config.linhas.join(",")}`}
            tabela={tabela}
            contagem={MEDIDAS[config.medida].tipo === "contagem"}
            rotuloDasLinhas={config.linhas.map((d) => DIMENSOES[d].rotulo).join(" › ")}
            comColunas={config.coluna !== null}
          />
        )}
      </ConfiguracaoDaTabela>
    </PageContainer>
  );
}
