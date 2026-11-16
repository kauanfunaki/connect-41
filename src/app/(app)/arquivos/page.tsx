import Link from "next/link";
import { redirect } from "next/navigation";
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
import { EmptyState } from "@/components/ui/EmptyState";
import { IconeDoArquivo } from "@/components/arquivos/IconeDoArquivo";
import { LinhaDaEmpresa } from "@/components/arquivos/LinhaDaEmpresa";
import { CampoDaBuscaNosArquivos, ResultadosDaBuscaNosArquivos } from "@/components/arquivos/BuscaEmTodasAsEmpresas";
import { formatInstantDateTime } from "@/lib/format";
import { chegouDoCliente } from "@/lib/drive/servidor";
import { empresasDaBusca, empresasDosArquivos, type EmpresaDosArquivos } from "@/lib/drive/empresas";
import { buscaAtiva, lerFiltroDaBusca, urlDaBuscaAntigaDeEmpresa } from "@/lib/drive/busca";
import { buscarEmTodasAsEmpresas, opcoesDoTipoDoEscritorio } from "@/lib/drive/buscaServidor";
import type { EmpresaNaTela } from "@/lib/drive/tela";
import { abrirArquivos } from "./acesso";

/** "Chegou do cliente" curto: o "!" de cada empresa já aponta o resto. */
const ENVIOS_RECENTES = 6;
const QUANDO: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" };

/** Só o que a linha mostra vai para o navegador (o resto é da ordenação). */
function naTela(e: EmpresaDosArquivos): EmpresaNaTela {
  return { id: e.id, nome: e.nome, cnpj: e.cnpj, documentos: e.documentos, novos: e.novos };
}

/**
 * Início dos Arquivos (09/10/2026): o que chegou dos clientes pelo portal, as
 * pastas do escritório e a lista das empresas para abrir as pastas de cada uma.
 *
 * A lista de empresas cabe na tela (10/2026, pedido do Kauan): 12 por página,
 * quem tem envio novo do cliente primeiro, e à direita a etiqueta com quantos
 * documentos a empresa tem — âmbar com "!" e o número de novos quando o
 * cliente mandou algo que ninguém da equipe abriu ainda.
 *
 * Em cima de tudo, desde 09/11/2026, a busca (src/lib/drive/busca.ts): `?q=`
 * (nome do arquivo, nome ou CNPJ da empresa) e `?tipo=` (pasta do modelo, guia
 * ou certidão). Com ela, o resultado toma o lugar do início.
 *
 * Uma busca só (16/11/2026, melhoria-716, alternativa A escolhida pelo Kauan):
 * a tela tinha duas caixas — esta e a da coluna "Empresas" (`?empresa=`) —, as
 * duas aceitavam empresa ou CNPJ e davam resultados diferentes. A da coluna
 * saiu, e o resultado passou a vir em dois grupos: "Empresas" (as que batem
 * com o texto, para abrir a pasta) e "Arquivos". O endereço antigo
 * `?empresa=texto` cai na busca nova.
 *
 * Os parâmetros de página são três, para um não apagar o outro: `?lista=` é a
 * página da lista de empresas do início — fica na URL durante a busca, e quem
 * busca e limpa volta para a página em que estava —; `?pagina=` conta as levas
 * de 50 arquivos do resultado e `?maisEmpresas=` as de 8 empresas.
 */
export default async function ArquivosPage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string | string[]; lista?: string; pagina?: string; q?: string; tipo?: string; maisEmpresas?: string }>;
}) {
  const ctx = await abrirArquivos();
  const { empresa, lista, pagina, q, tipo, maisEmpresas } = await searchParams;
  if (empresa !== undefined) redirect(urlDaBuscaAntigaDeEmpresa("/arquivos", { empresa: [empresa].flat()[0] ?? "", q, tipo }));

  const filtro = lerFiltroDaBusca({ q, tipo, pagina, maisEmpresas });
  const buscando = buscaAtiva(filtro);
  // O texto da busca que vale (a palavra de uma letra só não busca): é ele que
  // procura empresa. Só com o tipo escolhido, o grupo "Empresas" não existe.
  const termo = filtro.palavras.length > 0 ? filtro.termo : "";

  // As duas consultas da busca saem juntas; cada uma aplica a régua que já
  // tinha (o escritório de quem pede e as pastas que ele vê).
  const [opcoesDoTipo, achados, empresas] = await Promise.all([
    opcoesDoTipoDoEscritorio(ctx),
    buscando ? buscarEmTodasAsEmpresas(ctx, filtro) : Promise.resolve(null),
    buscando && termo ? empresasDaBusca(ctx, { termo, limite: filtro.limiteDeEmpresas }) : Promise.resolve(null),
  ]);
  const contagem = achados
    ? [
        ...(empresas ? [contarItens(empresas.total, "empresa", "empresas")] : []),
        contarItens(achados.itens.length, "arquivo", "arquivos", achados.temMais),
      ].join(" · ")
    : "";

  return (
    <PageContainer>
      <PageHeader
        title="Arquivos"
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

      {/* A barra da busca fica sempre neste lugar da árvore: a tela troca do
          início para o resultado enquanto a pessoa digita, e a caixa não pode
          remontar — perderia o foco no meio da palavra. Com resultado, barra e
          lista são um cartão só (`c41-casco`), como nas listas com
          `CascoDaTabela`. */}
      <section aria-label="Buscar empresa ou arquivo" className={achados ? "c41-casco mb-6" : "mb-6"}>
        <div className="c41-casco-barra flex flex-wrap items-center gap-x-4 gap-y-2 min-h-[52px] px-4 py-2.5 mb-2 bg-surface border border-border rounded-lg shadow-xs">
          <div className="flex-1 min-w-52 max-w-md">
            <CampoDaBuscaNosArquivos />
          </div>
          <FiltrosDaTela naBarra campos={[{ chave: "tipo", rotulo: "Tipo", vazioLabel: "Todos", opcoes: opcoesDoTipo }]} />
          {/* Sempre montado, para o leitor de tela ouvir a contagem nova a
              cada busca (`aria-live`). Sem busca fica vazio: a frase que dizia
              onde a busca procura saiu (16/11/2026, melhoria-716). */}
          <p aria-live="polite" className="ml-auto min-w-0 text-ui font-semibold text-fg">
            {contagem}
          </p>
        </div>
        {achados && (
          <ResultadosDaBuscaNosArquivos
            empresas={empresas && { itens: empresas.itens.map(naTela), total: empresas.total, levas: filtro.levasDeEmpresas }}
            itens={achados.itens}
            temMais={achados.temMais}
            pagina={filtro.pagina}
            termo={termo}
            comTipo={filtro.tipo !== null}
            rotuloDoTipo={opcoesDoTipo.find((o) => o.value === tipo?.trim())?.label ?? null}
          />
        )}
      </section>

      {!achados && <InicioDosArquivos ctx={ctx} pagina={Number(lista) || 1} />}
    </PageContainer>
  );
}

/** O início, sem busca: o que chegou do cliente, as pastas do escritório e as empresas. */
async function InicioDosArquivos({ ctx, pagina }: { ctx: AuthContext; pagina: number }) {
  const prisma = getPrisma();
  const [recentes, internas, lista] = await Promise.all([
    chegouDoCliente(ctx, ENVIOS_RECENTES),
    prisma.driveFolder.count({ where: { tenantId: ctx.tenantId, companyId: null, parentId: null, deletedAt: null } }),
    empresasDosArquivos(ctx, { pagina }),
  ]);
  const hrefDaPagina = (n: number) => `/arquivos${n > 1 ? `?lista=${n}` : ""}`;

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
        {/* Sem busca própria desde 16/11/2026 (melhoria-716): a empresa se
            acha na busca do topo, que traz o grupo "Empresas". */}
        <h2 id="t-empresas" className="text-section font-semibold text-fg">
          Empresas
        </h2>
        {lista.comNovidade > 0 && (
          <p className="text-micro text-fg-muted -mt-1">
            {lista.comNovidade === 1 ? "1 empresa com" : `${lista.comNovidade} empresas com`} envio do cliente ainda não aberto — aparecem
            primeiro, com <CircleAlert size={11} className="inline -mt-0.5 text-warning-fg" aria-label="exclamação" />.
          </p>
        )}
        {lista.itens.length === 0 ? (
          <EmptyState icon={<Building2 />} title="Nenhuma empresa ativa" />
        ) : (
          <ul className="bg-surface border border-border rounded-lg shadow-xs divide-y divide-border">
            {lista.itens.map((e) => (
              <LinhaDaEmpresa key={e.id} empresa={naTela(e)} />
            ))}
          </ul>
        )}
        <Pagination page={lista.pagina} totalPages={lista.paginas} total={lista.total} rotulo="empresas" buildHref={hrefDaPagina} />
      </section>
    </div>
  );
}
