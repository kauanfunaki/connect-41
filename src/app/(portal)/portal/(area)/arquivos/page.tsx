import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Eye, Folder, FolderInput, FolderOpen } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
import { SeletorDeEmpresaQueNavega } from "@/components/shared/SeletorDeEmpresaQueNavega";
import { IconeDoArquivo } from "@/components/arquivos/IconeDoArquivo";
import { EnviarArquivosDoCliente } from "@/components/arquivos/EnviarArquivosDoCliente";
import { clienteAtivoDoPortal } from "@/app/(portal)/usuario";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { formatarBytes } from "@/lib/fileSize";
import { formatInstantDateTime } from "@/lib/format";
import { rotuloDeItens } from "@/lib/drive/tela";
import { MODULO_ARQUIVOS } from "@/lib/drive/regras";
import { navegadorDoCliente } from "@/lib/drive/servidor";

export const dynamic = "force-dynamic";

const QUANDO: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" };

/**
 * Arquivos no portal do cliente (09/10/2026): as pastas que o escritório
 * compartilhou com ele, por empresa, e o envio para "Enviados pelo cliente".
 * O cliente vê e baixa; não muda nem apaga nada do que o escritório organizou.
 */
export default async function PortalArquivosPage({ searchParams }: { searchParams: Promise<{ empresa?: string; pasta?: string }> }) {
  const cliente = await clienteAtivoDoPortal();
  if (!cliente || !cliente.modulos.has(MODULO_ARQUIVOS)) notFound();

  const empresas = await empresasDoSeletor(cliente.tenantId, cliente.companyIds);
  const { empresa: pedida, pasta } = await searchParams;
  // Com uma empresa só, não há o que escolher: abre direto as pastas dela.
  const selecionada = empresas.find((e) => e.id === pedida) ?? (empresas.length === 1 ? empresas[0] : null);
  const dados = selecionada ? await navegadorDoCliente(cliente.tenantId, selecionada.id, pasta || null, cliente.usuario.id) : null;
  if (selecionada && !dados) notFound();

  const endereco = (pastaId: string | null) =>
    `/portal/arquivos?empresa=${selecionada?.id ?? ""}${pastaId ? `&pasta=${pastaId}` : ""}`;

  return (
    <PageContainer>
      <PortalCabecalho
        titulo="Arquivos"
        descricao="Pastas que o escritório compartilhou com você, e onde você manda os seus arquivos."
        somenteLeitura={false}
      />

      {empresas.length === 0 ? (
        <Card>
          <EmptyState icon={<FolderOpen />} title="Nenhuma empresa no seu acesso" />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {empresas.length > 1 && (
            <SeletorDeEmpresaQueNavega empresas={empresas} empresaId={selecionada?.id ?? null} acao="/portal/arquivos" />
          )}

          {!selecionada || !dados ? (
            <Card>
              <EmptyState icon={<FolderOpen />} title="Escolha a empresa" description="As pastas são de cada empresa." />
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1 [&>nav]:mb-0">
                  <Breadcrumb
                    items={[
                      { label: dados.empresa.nome, href: dados.pasta ? endereco(null) : undefined, truncate: true },
                      ...dados.caminho.map((p, i) => ({
                        label: p.nome,
                        href: i < dados.caminho.length - 1 ? endereco(p.id) : undefined,
                        truncate: true,
                      })),
                    ]}
                  />
                </div>
                <EnviarArquivosDoCliente companyId={dados.empresa.id} empresaNome={dados.empresa.nome} />
              </div>

              {dados.pasta?.enviados && (
                <p className="text-fs-3 text-fg-secondary">O que você envia para o escritório fica aqui.</p>
              )}

              {dados.subpastas.length === 0 && dados.arquivos.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={<FolderOpen />}
                    title={dados.pasta ? "Pasta vazia" : "Nenhuma pasta compartilhada ainda"}
                    description={
                      dados.pasta
                        ? dados.pasta.enviados
                          ? "Use Enviar arquivos para mandar o primeiro."
                          : "Quando o escritório puser arquivos aqui, eles aparecem nesta tela."
                        : "Quando o escritório compartilhar uma pasta com você, ela aparece aqui."
                    }
                  />
                </Card>
              ) : (
                <ul className="bg-surface border border-border rounded-lg divide-y divide-border">
                  {dados.subpastas.map((p) => {
                    const Icone = p.enviados ? FolderInput : Folder;
                    return (
                      <li key={p.id}>
                        <Link href={endereco(p.id)} className="flex items-center gap-3 px-3 py-3 hover:bg-surface-hover transition-colors">
                          <Icone size={18} className={p.enviados ? "text-brand shrink-0" : "text-fg-muted shrink-0"} aria-hidden />
                          <span className="min-w-0 flex-1 text-fs-3 font-medium text-fg truncate">{p.nome}</span>
                          <span className="text-micro text-fg-muted tabular-nums shrink-0">{rotuloDeItens(p.itens)}</span>
                        </Link>
                      </li>
                    );
                  })}
                  {dados.arquivos.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-3 py-3">
                      <IconeDoArquivo nome={a.nome} />
                      <div className="min-w-0 flex-1">
                        <a
                          href={`/portal/arquivos/${a.id}${a.previa ? "?ver=1" : ""}`}
                          target={a.previa ? "_blank" : undefined}
                          rel="noreferrer"
                          className="block text-fs-3 font-medium text-fg hover:text-brand transition-colors truncate"
                        >
                          {a.nome}
                        </a>
                        <p className="text-micro text-fg-muted">
                          {formatarBytes(a.tamanho)} · {a.seu ? "enviado por você" : "do escritório"} · {formatInstantDateTime(new Date(a.enviadoEm), QUANDO)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {a.previa && (
                          <a
                            href={`/portal/arquivos/${a.id}?ver=1`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 rounded-md text-fg-muted hover:text-brand hover:bg-surface-hover transition-colors"
                            aria-label={`Abrir ${a.nome}`}
                            title="Abrir"
                          >
                            <Eye size={16} />
                          </a>
                        )}
                        <a
                          href={`/portal/arquivos/${a.id}`}
                          className="p-2 rounded-md text-fg-muted hover:text-brand hover:bg-surface-hover transition-colors"
                          aria-label={`Baixar ${a.nome}`}
                          title="Baixar"
                        >
                          <Download size={16} />
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </PageContainer>
  );
}
