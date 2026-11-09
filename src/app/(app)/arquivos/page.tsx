import { FormularioDeFiltro } from "@/components/shared/NavegacaoSemRecarregar";
import Link from "next/link";
import { Building2, CircleAlert, FolderInput, FolderTree, Inbox, Trash2 } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { Pagination } from "@/components/shared/Pagination";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { contarItens } from "@/components/shared/CascoDaTabela";
import { isFullWrite, type AuthContext } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { EmptyState } from "@/components/ui/EmptyState";
import { Contador } from "@/components/ui/Contador";
import { Selo } from "@/components/ui/Selo";
import { IconeDoArquivo } from "@/components/arquivos/IconeDoArquivo";
import { CampoDaBuscaNosArquivos, ResultadosDaBuscaNosArquivos } from "@/components/arquivos/BuscaEmTodasAsEmpresas";
import { formatCnpj, formatInstantDateTime } from "@/lib/format";
import { chegouDoCliente } from "@/lib/drive/servidor";
import { empresasDosArquivos } from "@/lib/drive/empresas";
import { buscaAtiva, lerFiltroDaBusca } from "@/lib/drive/busca";
import { buscarEmTodasAsEmpresas, opcoesDoTipoDoEscritorio } from "@/lib/drive/buscaServidor";
import { abrirArquivos } from "./acesso";

/** "Chegou do cliente" curto: o "!" de cada empresa já aponta o resto. */
const ENVIOS_RECENTES = 6;
const QUANDO: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" };

/**
 * Início dos Arquivos (09/10/2026): o que chegou dos clientes pelo portal, as
 * pastas do escritório e a lista das empresas para abrir as pastas de cada uma.
 * A busca de empresa é por GET (`?empresa=`), como nas outras listas.
 *
 * A lista de empresas cabe na tela (10/2026, pedido do Kauan): 12 por página,
 * quem tem envio novo do cliente primeiro, e à direita a etiqueta com quantos
 * documentos a empresa tem — âmbar com "!" e o número de novos quando o
 * cliente mandou algo que ninguém da equipe abriu ainda.
 *
 * Em cima de tudo, desde 09/11/2026, a busca em todas as empresas
 * (src/lib/drive/busca.ts): `?q=` (nome do arquivo, nome ou CNPJ da empresa)
 * e `?tipo=` (pasta do modelo, guia ou certidão). Com ela, o resultado toma o
 * lugar do início; `?pagina=` passa a contar as levas de 50 do resultado.
 */
export default async function ArquivosPage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string; pagina?: string; q?: string; tipo?: string }>;
}) {
  const ctx = await abrirArquivos();
  const { empresa: termoBruto, pagina: paginaBruta, q, tipo } = await searchParams;
  const filtro = lerFiltroDaBusca({ q, tipo, pagina: paginaBruta });
  const buscando = buscaAtiva(filtro);

  const [opcoesDoTipo, achados] = await Promise.all([
    opcoesDoTipoDoEscritorio(ctx),
    buscando ? buscarEmTodasAsEmpresas(ctx, filtro) : Promise.resolve(null),
  ]);

  return (
    <PageContainer>
      <PageHeader
        title="Arquivos"
        subtitle="As pastas de cada empresa e as do escritório. Pasta compartilhada aparece no portal do cliente, e o que ele envia cai em “Enviados pelo cliente”."
        action={
          <div className="flex flex-wrap gap-2">
            {isFullWrite(ctx.role) && (
              <Button href="/admin/arquivos" variant="secondary" size="sm">
                <FolderTree size={14} /> Modelo de pastas
              </Button>
            )}
            <Button href="/arquivos/lixeira" variant="secondary" size="sm">
              <Trash2 size={14} /> Lixeira
            </Button>
          </div>
        }
      />

      {/* A barra da busca em todas as empresas fica sempre neste lugar da
          árvore: a tela troca do início para o resultado enquanto a pessoa
          digita, e a caixa não pode remontar — perderia o foco no meio da
          palavra. Com resultado, barra e lista são um cartão só (`c41-casco`),
          como nas listas com `CascoDaTabela`. */}
      <section aria-label="Buscar arquivos em todas as empresas" className={achados ? "c41-casco mb-6" : "mb-6"}>
        <div className="c41-casco-barra flex flex-wrap items-center gap-x-4 gap-y-2 min-h-[52px] px-4 py-2.5 mb-2 bg-surface border border-border rounded-lg shadow-xs">
          <div className="flex-1 min-w-52 max-w-md">
            <CampoDaBuscaNosArquivos />
          </div>
          <FiltrosDaTela naBarra campos={[{ chave: "tipo", rotulo: "Tipo", vazioLabel: "Todos", opcoes: opcoesDoTipo }]} />
          {/* Sempre montado, para o leitor de tela ouvir a contagem nova a
              cada busca (`aria-live`). Sem busca, diz onde ela procura. */}
          <p aria-live="polite" className="ml-auto flex flex-wrap items-baseline gap-x-2 min-w-0 text-ui">
            {achados ? (
              <>
                <span className="font-semibold text-fg">{contarItens(achados.itens.length, "arquivo", "arquivos", achados.temMais)}</span>
                <span className="text-fg-muted">mais recentes primeiro</span>
              </>
            ) : (
              <span className="hidden lg:inline text-micro text-fg-muted">Em todas as empresas e nas pastas do escritório</span>
            )}
          </p>
        </div>
        {achados && (
          <ResultadosDaBuscaNosArquivos
            itens={achados.itens}
            temMais={achados.temMais}
            pagina={filtro.pagina}
            termo={filtro.palavras.length > 0 ? filtro.termo : ""}
            comTipo={filtro.tipo !== null}
          />
        )}
      </section>

      {!achados && <InicioDosArquivos ctx={ctx} termo={termoBruto?.trim() ?? ""} pagina={Number(paginaBruta) || 1} />}
    </PageContainer>
  );
}

/** O início, sem busca: o que chegou do cliente, as pastas do escritório e as empresas. */
async function InicioDosArquivos({ ctx, termo, pagina }: { ctx: AuthContext; termo: string; pagina: number }) {
  const prisma = getPrisma();
  const [recentes, internas, lista] = await Promise.all([
    chegouDoCliente(ctx, ENVIOS_RECENTES),
    prisma.driveFolder.count({ where: { tenantId: ctx.tenantId, companyId: null, parentId: null, deletedAt: null } }),
    empresasDosArquivos(ctx, { termo, pagina }),
  ]);
  const hrefDaPagina = (n: number) => {
    const q = new URLSearchParams();
    if (termo) q.set("empresa", termo);
    if (n > 1) q.set("pagina", String(n));
    const t = q.toString();
    return `/arquivos${t ? `?${t}` : ""}`;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <section className="flex flex-col gap-3 min-w-0" aria-labelledby="t-chegou">
        <h2 id="t-chegou" className="text-section font-semibold text-fg">
          Chegou do cliente
        </h2>
        {/* O vazio no `EmptyState` (15/10/2026): era um parágrafo numa caixa
            montada à mão. */}
        {recentes.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Inbox />}
              title="Nada chegou nos últimos 30 dias"
              description="O que o cliente enviar pelo portal aparece aqui e em “Enviados pelo cliente” da empresa, e quem cuida dela é avisado."
            />
          </Card>
        ) : (
          <ul className="bg-surface border border-border rounded-lg shadow-xs divide-y divide-border">
            {recentes.map((r) => (
              <li key={r.id} className="flex items-start gap-3 px-3 py-2.5">
                <IconeDoArquivo nome={r.nome} />
                <div className="min-w-0 flex-1">
                  <a
                    href={`/api/arquivos/${r.id}${r.previa ? "?ver=1" : ""}`}
                    target={r.previa ? "_blank" : undefined}
                    rel="noreferrer"
                    className="block text-fs-3 font-medium text-fg hover:text-brand transition-colors truncate"
                  >
                    {r.nome}
                  </a>
                  <p className="text-micro text-fg-muted truncate">
                    <Link href={`/arquivos/empresa/${r.empresa.id}?pasta=enviados`} className="hover:text-brand">
                      {r.empresa.nome}
                    </Link>{" "}
                    · {r.quem ?? "cliente"} · {formatInstantDateTime(new Date(r.enviadoEm), QUANDO)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* O cartão-atalho do app (`Card href`): borda azul, sobe 2px. */}
        <Card href="/arquivos/internas" className="flex items-center gap-3 px-4 py-3">
          <FolderInput size={20} className="text-brand shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-fs-3 font-medium text-fg">Pastas do escritório</span>
            <span className="block text-micro text-fg-muted">
              {internas === 0 ? "Modelos, manuais e o que não é de nenhuma empresa." : internas === 1 ? "1 pasta" : `${internas} pastas`}
            </span>
          </span>
        </Card>
      </section>

      <section className="flex flex-col gap-3 min-w-0" aria-labelledby="t-empresas">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="t-empresas" className="text-section font-semibold text-fg">
            Empresas
          </h2>
          <FormularioDeFiltro role="search" className="w-full sm:w-72">
            {/* Com o "limpar" próprio do campo de busca (15/10/2026). */}
            <CampoDeBusca
              id="arquivos-empresa"
              name="empresa"
              compact
              defaultValue={termo}
              placeholder="Nome ou CNPJ"
              aria-label="Buscar empresa por nome ou CNPJ"
            />
          </FormularioDeFiltro>
        </div>
        {lista.comNovidade > 0 && (
          <p className="text-micro text-fg-muted -mt-1">
            {lista.comNovidade === 1 ? "1 empresa com" : `${lista.comNovidade} empresas com`} envio do cliente ainda não aberto — aparecem
            primeiro, com <CircleAlert size={11} className="inline -mt-0.5 text-warning-fg" aria-label="exclamação" />.
          </p>
        )}
        {lista.itens.length === 0 ? (
          <EmptyState icon={<Building2 />} title="Nenhuma empresa encontrada" description="Busque pelo nome, pelo apelido ou pelo CNPJ." />
        ) : (
          <ul className="bg-surface border border-border rounded-lg shadow-xs divide-y divide-border">
            {lista.itens.map((e) => {
              const rotulo =
                e.novos > 0
                  ? `${e.novos} ${e.novos === 1 ? "envio novo" : "envios novos"} do cliente · ${e.documentos} ${e.documentos === 1 ? "documento" : "documentos"}`
                  : `${e.documentos} ${e.documentos === 1 ? "documento" : "documentos"}`;
              return (
                <li key={e.id}>
                  <Link
                    href={`/arquivos/empresa/${e.id}${e.novos > 0 ? "?pasta=enviados" : ""}`}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover transition-colors"
                  >
                    <Building2 size={16} className="text-fg-muted shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 text-fs-3 font-medium text-fg truncate">{e.nome}</span>
                    {e.cnpj && <span className="text-micro text-fg-muted tabular-nums shrink-0 hidden sm:inline">{formatCnpj(e.cnpj)}</span>}
                    {/* A etiqueta: quantos documentos (Arquivos + Do Connect);
                        com envio novo do cliente, "!" e quantos são novos. */}
                    {e.novos > 0 ? (
                      <Selo tom="atencao" className="shrink-0 gap-1 tabular-nums">
                        <CircleAlert size={12} aria-hidden />
                        <span>{e.novos}</span>
                        <span className="sr-only">{rotulo}</span>
                      </Selo>
                    ) : (
                      // A contagem no `Contador` (15/10/2026): o `Selo` é de
                      // situação. O envio novo continua no selo de atenção.
                      <span className="shrink-0 inline-flex">
                        <span aria-hidden className="inline-flex">
                          <Contador valor={e.documentos} teto={Number.MAX_SAFE_INTEGER} />
                        </span>
                        <span className="sr-only">{rotulo}</span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination page={lista.pagina} totalPages={lista.paginas} total={lista.total} rotulo="empresas" buildHref={hrefDaPagina} />
      </section>
    </div>
  );
}
