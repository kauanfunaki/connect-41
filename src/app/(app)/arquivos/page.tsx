import Link from "next/link";
import { Building2, FolderInput, FolderTree, Search, Trash2 } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { isFullWrite } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconeDoArquivo } from "@/components/arquivos/IconeDoArquivo";
import { nomeExibicao } from "@/lib/companyName";
import { formatCnpj, formatInstantDateTime } from "@/lib/format";
import { digitsOnly } from "@/lib/validation/common";
import { chegouDoCliente } from "@/lib/drive/servidor";
import { abrirArquivos } from "./acesso";

const LIMITE_DE_EMPRESAS = 60;
const QUANDO: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" };

/**
 * Início dos Arquivos (09/10/2026): o que chegou dos clientes pelo portal, as
 * pastas do escritório e a lista das empresas para abrir as pastas de cada uma.
 * A busca de empresa é por GET (`?empresa=`), como nas outras listas.
 */
export default async function ArquivosPage({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const ctx = await abrirArquivos();
  const { empresa: termoBruto } = await searchParams;
  const termo = termoBruto?.trim() ?? "";
  const digitos = digitsOnly(termo);
  const prisma = getPrisma();

  const [recentes, internas, encontradas] = await Promise.all([
    chegouDoCliente(ctx),
    prisma.driveFolder.count({ where: { tenantId: ctx.tenantId, companyId: null, parentId: null, deletedAt: null } }),
    prisma.company.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(termo
          ? {
              OR: [
                { name: { contains: termo } },
                { displayName: { contains: termo } },
                { tradeName: { contains: termo } },
                ...(digitos && digitos.length >= 3 ? [{ cnpj: { contains: digitos } }] : []),
              ],
            }
          : { status: "ACTIVE" as const }),
      },
      orderBy: { name: "asc" },
      take: LIMITE_DE_EMPRESAS + 1,
      select: { id: true, name: true, displayName: true, cnpj: true },
    }),
  ]);
  const limitado = encontradas.length > LIMITE_DE_EMPRESAS;
  const empresas = encontradas.slice(0, LIMITE_DE_EMPRESAS).sort((a, b) => nomeExibicao(a).localeCompare(nomeExibicao(b), "pt-BR"));

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
          {empresas.length === 0 ? (
            <EmptyState icon={<Building2 />} title="Nenhuma empresa encontrada" description="Busque pelo nome, pelo apelido ou pelo CNPJ." />
          ) : (
            <ul className="bg-surface border border-border rounded-lg divide-y divide-border">
              {empresas.map((e) => (
                <li key={e.id}>
                  <Link href={`/arquivos/empresa/${e.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover transition-colors">
                    <Building2 size={16} className="text-fg-muted shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 text-fs-3 font-medium text-fg truncate">{nomeExibicao(e)}</span>
                    {e.cnpj && <span className="text-micro text-fg-muted tabular-nums shrink-0 hidden sm:inline">{formatCnpj(e.cnpj)}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {limitado && (
            <p className="text-micro text-fg-muted">
              {termo ? `Mostrando as ${LIMITE_DE_EMPRESAS} primeiras. Refine a busca para achar a sua.` : `Mostrando ${LIMITE_DE_EMPRESAS} empresas ativas. Busque pelo nome ou CNPJ para achar as outras.`}
            </p>
          )}
        </section>
      </div>
    </PageContainer>
  );
}
