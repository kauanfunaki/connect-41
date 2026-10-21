import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
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
import { empresaNaUrl, hrefDaEmpresa, idDaEscolha } from "@/lib/empresas/escolhaDaEmpresa";
import { FiltroDaEmpresa, EscolhaAEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import {
  DIMENSOES,
  MEDIDAS,
  MODULO_DA_TABELA_DINAMICA,
  MAXIMO_DE_COLUNAS,
  MAXIMO_DE_LINHAS,
  VISOES_PRONTAS,
  lerConfiguracao,
  montarTabela,
  paramsDaConfiguracao,
} from "@/lib/relatorios/tabelaDinamica";
import { fatosDaBase, LIMITE_DE_FATOS } from "@/lib/relatorios/tabelaDinamicaServidor";
import { TabelaDinamica } from "@/components/relatorios/TabelaDinamica";
import { ConfiguracaoDaTabela } from "@/components/relatorios/ConfiguracaoDaTabela";

/**
 * A tabela dinâmica do financeiro (20/10/2026 — "tabelas dinâmicas como o
 * Omie"). A configuração mora no endereço: as visões prontas são links, o
 * quadro é um formulário GET, e o link da tela guarda a tabela. A soma é no
 * servidor (`montarTabela`); a tela recebe a tabela pronta.
 */
export default async function TabelaDinamicaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !getModuleDef(MODULO_DA_TABELA_DINAMICA)) notFound();
  const setores = await setoresDoModulo(ctx.tenantId, MODULO_DA_TABELA_DINAMICA);
  if (!setores || !canViewSector(ctx, setores)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULO_DA_TABELA_DINAMICA))) notFound();

  const params = await searchParams;
  const agora = new Date();
  const config = lerConfiguracao(params, saoPauloParts(agora).dateKey);

  const empresasDoEscritorio = await getPrisma().company.findMany({
    where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROSPECT"] } },
    select: CAMPOS_DA_EMPRESA_NO_SELETOR,
  });
  const empresas = empresasDoEscritorio
    .map((e) => ({ id: e.id, nome: nomeExibicao(e), logoUrl: e.logoUrl, cnpj: e.cnpj, matrizId: e.parentCompanyId }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  // Com uma empresa em foco (21/10/2026), só a base dela; "Todas" é a base.
  const { escolha, noSeletor, foco, empresasDeTodas } = await escolherEmpresaDaTela(ctx, params.empresa, empresas, {
    permitirTodas: true,
    comFoco: true,
  });
  const empresaId = idDaEscolha(escolha);
  const empresaUrl = empresaNaUrl(escolha) ?? null;
  const manter = Object.fromEntries(paramsDaConfiguracao(config, { visao: params.visao }));

  const cabecalho = (
    <PageHeader
      title="Tabela dinâmica"
      subtitle="As contas e as baixas em linhas e colunas — por categoria, fornecedor, centro, mês —, com visões prontas e exportação para o Excel."
    />
  );
  const filtroDaEmpresa = (
    <FiltroDaEmpresa acao="/tabela-dinamica" empresas={noSeletor} valor={empresaUrl} todas="explicita" manter={manter} foco={foco} />
  );

  if (escolha.tipo === "escolher") {
    return (
      <PageContainer>
        {cabecalho}
        {filtroDaEmpresa}
        <EscolhaAEmpresa
          escolha={escolha}
          porQue="A tabela abre numa empresa para não somar o escritório inteiro sem querer."
          todasHref={foco ? undefined : hrefDaEmpresa("/tabela-dinamica", "", { todas: "explicita", manter })}
        />
      </PageContainer>
    );
  }

  const { fatos, limitada } = await fatosDaBase(ctx.tenantId, empresaId ?? empresasDeTodas, config, agora);
  const tabela = montarTabela(fatos, config);
  const comEmpresa = (q: URLSearchParams) => {
    if (empresaUrl) q.set("empresa", empresaUrl);
    return q;
  };
  const exportar = `/tabela-dinamica/exportar?${comEmpresa(paramsDaConfiguracao(config))}`;

  return (
    <PageContainer>
      {cabecalho}
      {filtroDaEmpresa}

      {/* As visões prontas: o que o setor mais monta no Omie, num clique. */}
      <nav aria-label="Visões prontas" className="mb-4 flex flex-wrap gap-2">
        {VISOES_PRONTAS.map((v) => {
          const ativa = params.visao === v.id;
          return (
            <Link
              key={v.id}
              href={`/tabela-dinamica?${comEmpresa(new URLSearchParams({ ...v.params, visao: v.id }))}`}
              title={v.descricao}
              aria-current={ativa ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-fs-2 font-medium transition-colors ${
                ativa ? "border-brand bg-brand-subtle text-brand" : "border-border text-fg-secondary hover:border-brand hover:text-fg"
              }`}
            >
              {v.rotulo}
            </Link>
          );
        })}
      </nav>

      <ConfiguracaoDaTabela key={JSON.stringify(config)} config={config} empresa={empresaUrl} />

      <div className="mt-4 mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-helper text-fg-muted">
          {formatarNumero(fatos.length, 0)} {config.base === "baixas" ? "movimentos de baixa" : "linhas de conta (o rateio abre em partes)"} ·{" "}
          {MEDIDAS[config.medida].rotulo.toLowerCase()} por {config.linhas.map((d) => DIMENSOES[d].rotulo.toLowerCase()).join(" e ")}
          {config.coluna ? ` × ${DIMENSOES[config.coluna].rotulo.toLowerCase()}` : ""}
        </p>
        <Button href={exportar} download variant="secondary" size="sm" title="A tabela montada, os dados numa Tabela do Excel e os filtros usados.">
          <Download size={14} /> Exportar Excel
        </Button>
      </div>

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
        <TabelaDinamica
          tabela={tabela}
          contagem={MEDIDAS[config.medida].tipo === "contagem"}
          rotuloDasLinhas={config.linhas.map((d) => DIMENSOES[d].rotulo).join(" › ")}
          comColunas={config.coluna !== null}
        />
      )}
    </PageContainer>
  );
}
