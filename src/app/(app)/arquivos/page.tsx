import Link from "next/link";
import { Building2, CircleAlert, FolderInput, FolderTree, Search, Trash2 } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { Pagination } from "@/components/shared/Pagination";
import { isFullWrite } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { Selo } from "@/components/ui/Selo";
import { IconeDoArquivo } from "@/components/arquivos/IconeDoArquivo";
import { formatCnpj, formatInstantDateTime } from "@/lib/format";
import { chegouDoCliente } from "@/lib/drive/servidor";
import { empresasDosArquivos } from "@/lib/drive/empresas";
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
 */
export default async function ArquivosPage({ searchParams }: { searchParams: Promise<{ empresa?: string; pagina?: string }> }) {
  const ctx = await abrirArquivos();
  const { empresa: termoBruto, pagina: paginaBruta } = await searchParams;
  const termo = termoBruto?.trim() ?? "";
  const prisma = getPrisma();

  const [recentes, internas, lista] = await Promise.all([
    chegouDoCliente(ctx, ENVIOS_RECENTES),
    prisma.driveFolder.count({ where: { tenantId: ctx.tenantId, companyId: null, parentId: null, deletedAt: null } }),
    empresasDosArquivos(ctx, { termo, pagina: Number(paginaBruta) || 1 }),
  ]);
  const hrefDaPagina = (n: number) => {
    const q = new URLSearchParams();
    if (termo) q.set("empresa", termo);
    if (n > 1) q.set("pagina", String(n));
    const t = q.toString();
    return `/arquivos${t ? `?${t}` : ""}`;
  };

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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section className="flex flex-col gap-3 min-w-0" aria-labelledby="t-chegou">
          <h2 id="t-chegou" className="text-section font-semibold text-fg">
            Chegou do cliente
          </h2>
          {recentes.length === 0 ? (
            <p className="text-fs-3 text-fg-muted bg-surface border border-border rounded-lg p-4">
              Nada nos últimos 30 dias. O que o cliente enviar pelo portal aparece aqui e em “Enviados pelo cliente” da empresa, e quem cuida dela é avisado.
            </p>
          ) : (
            <ul className="bg-surface border border-border rounded-lg divide-y divide-border">
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

          <Link
            href="/arquivos/internas"
            className="flex items-center gap-3 bg-surface border border-border rounded-lg px-4 py-3 hover:border-border-strong transition-colors"
          >
            <FolderInput size={20} className="text-brand shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-fs-3 font-medium text-fg">Pastas do escritório</span>
              <span className="block text-micro text-fg-muted">
                {internas === 0 ? "Modelos, manuais e o que não é de nenhuma empresa." : internas === 1 ? "1 pasta" : `${internas} pastas`}
              </span>
            </span>
          </Link>
        </section>

        <section className="flex flex-col gap-3 min-w-0" aria-labelledby="t-empresas">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="t-empresas" className="text-section font-semibold text-fg">
              Empresas
            </h2>
            <form method="get" role="search" className="w-full sm:w-72">
              <Input
                id="arquivos-empresa"
                name="empresa"
                type="search"
                compact
                icon={<Search size={14} />}
                defaultValue={termo}
                placeholder="Nome ou CNPJ"
                aria-label="Buscar empresa por nome ou CNPJ"
              />
            </form>
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
            <ul className="bg-surface border border-border rounded-lg divide-y divide-border">
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
                        <Selo tom="neutro" className="shrink-0 tabular-nums">
                          <span aria-hidden>{e.documentos}</span>
                          <span className="sr-only">{rotulo}</span>
                        </Selo>
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
    </PageContainer>
  );
}
