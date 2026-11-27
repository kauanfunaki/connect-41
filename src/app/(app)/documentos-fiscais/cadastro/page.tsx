import Link from "next/link";
import { notFound } from "next/navigation";
import { Link2, Package, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { Pagination } from "@/components/shared/Pagination";
import { FormularioDeFiltro } from "@/components/shared/NavegacaoSemRecarregar";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { nomeExibicao } from "@/lib/companyName";
import { formatInstantDate } from "@/lib/format";
import { CAMPOS_DA_EMPRESA_NO_SELETOR } from "@/lib/empresas/opcoesDoSeletor";
import { escolherEmpresaDaTela } from "@/lib/empresas/ultimaEmpresa";
import { FiltroDaEmpresa, EscolhaAEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import { AtualizarDoAcervo } from "@/components/fiscal/cadastro/AtualizarDoAcervo";
import { TabelaDeProdutos } from "@/components/fiscal/cadastro/TabelaDeProdutos";
import { TabelaDeParticipantes } from "@/components/fiscal/cadastro/TabelaDeParticipantes";
import { VinculosDoNcm } from "@/components/fiscal/cadastro/VinculosDoNcm";
import {
  POR_PAGINA,
  contagensDoCadastro,
  listarParticipantes,
  listarProdutos,
  listarVinculos,
  ncmsSemVinculo,
  type FiltroDeParticipantes,
  type FiltroDeProdutos,
} from "@/lib/fiscal/cadastro/servidor";

export const dynamic = "force-dynamic";

const SECTOR = "fiscal";
const MODULE = "fiscal_documentos";
const ROTA = "/documentos-fiscais/cadastro";

type Aba = "produtos" | "participantes" | "ncm";

/**
 * O cadastro fiscal da empresa (27/11/2026, funcionalidade-899): os produtos e
 * os fornecedores e clientes que aparecem nas notas do acervo do SPED, e o
 * vínculo do NCM com o cClassTrib do IBS/CBS — os "Arquivos" do Domínio Escrita
 * Fiscal. A empresa vem da faixa "Trabalhando em", como no acervo.
 */
export default async function CadastroFiscalPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();
  const params = await searchParams;
  const aba: Aba = params.aba === "participantes" || params.aba === "ncm" ? params.aba : "produtos";

  const empresas = (
    await getPrisma().company.findMany({ where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROSPECT"] } }, select: CAMPOS_DA_EMPRESA_NO_SELETOR })
  )
    .map((e) => ({ id: e.id, nome: nomeExibicao(e), logoUrl: e.logoUrl, cnpj: e.cnpj, matrizId: e.parentCompanyId }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const { escolha, empresa, foco } = await escolherEmpresaDaTela(ctx, params.empresa, empresas, { comFoco: true });

  const trilha = <Breadcrumb items={[{ label: "Documentos fiscais", href: "/documentos-fiscais" }, { label: "Cadastro fiscal" }]} />;
  if (!empresa) {
    return (
      <PageContainer>
        {trilha}
        <PageHeader title="Cadastro fiscal" />
        <FiltroDaEmpresa foco={foco} />
        <EscolhaAEmpresa escolha={escolha} porQue="O cadastro fiscal é de cada empresa: produtos e fornecedores e clientes das notas dela." />
      </PageContainer>
    );
  }

  const href = (mudar: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...mudar })) if (v) q.set(k, v);
    return `${ROTA}${q.size ? `?${q}` : ""}`;
  };
  const pagina = Math.max(1, Number(params.pagina) || 1);
  const contagens = await contagensDoCadastro(ctx.tenantId, empresa.id);

  let conteudo: React.ReactNode;
  if (aba === "ncm") {
    const [vinculos, semVinculo] = await Promise.all([listarVinculos(ctx.tenantId), ncmsSemVinculo(ctx.tenantId, empresa.id)]);
    conteudo = <VinculosDoNcm vinculos={vinculos.map((v) => ({ ...v, atualizadoEm: formatInstantDate(v.atualizadoEm) }))} semVinculo={semVinculo} />;
  } else if (aba === "participantes") {
    const filtro: FiltroDeParticipantes = { q: params.q, papel: params.papel === "FORNECEDOR" || params.papel === "CLIENTE" ? params.papel : undefined };
    const { itens, total } = await listarParticipantes(ctx.tenantId, empresa.id, filtro, pagina);
    conteudo = (
      <>
        <Filtros
          q={params.q}
          aba="participantes"
          empresa={params.empresa}
          chips={[
            { rotulo: "Todos", href: href({ papel: undefined, pagina: undefined }), ativo: !filtro.papel },
            { rotulo: "Fornecedores", href: href({ papel: "FORNECEDOR", pagina: undefined }), ativo: filtro.papel === "FORNECEDOR" },
            { rotulo: "Clientes", href: href({ papel: "CLIENTE", pagina: undefined }), ativo: filtro.papel === "CLIENTE" },
          ]}
        />
        {itens.length === 0 ? (
          <Vazio companyId={empresa.id} temCadastro={contagens.participantes > 0} />
        ) : (
          <TabelaDeParticipantes
            companyId={empresa.id}
            participantes={itens.map((p) => ({
              id: p.id,
              documento: p.documento,
              nome: p.nome,
              papel: p.papel === "CLIENTE" ? "CLIENTE" : p.papel === "AMBOS" ? "AMBOS" : "FORNECEDOR",
              uf: p.uf,
              inscricaoEstadual: p.inscricaoEstadual,
              regime: p.regime,
              contribuinteIcms: p.contribuinteIcms,
              documentos: p.documentos,
              ultimaNota: p.ultimaNotaEm ? formatInstantDate(p.ultimaNotaEm) : null,
            }))}
          />
        )}
        <Pagination page={pagina} totalPages={Math.max(1, Math.ceil(total / POR_PAGINA))} total={total} rotulo="fornecedores e clientes" buildHref={(p) => href({ pagina: String(p) })} />
      </>
    );
  } else {
    const filtro: FiltroDeProdutos = {
      q: params.q,
      sentido: params.sentido === "ENTRADA" || params.sentido === "SAIDA" ? params.sentido : undefined,
      pendencia: params.pendencia === "sem_ncm" || params.pendencia === "sem_classtrib" ? params.pendencia : undefined,
    };
    const { itens, total } = await listarProdutos(ctx.tenantId, empresa.id, filtro, pagina);
    conteudo = (
      <>
        <Filtros
          q={params.q}
          aba="produtos"
          empresa={params.empresa}
          chips={[
            { rotulo: "Todos", href: href({ pendencia: undefined, sentido: undefined, pagina: undefined }), ativo: !filtro.pendencia && !filtro.sentido },
            { rotulo: "Entrada", href: href({ sentido: "ENTRADA", pendencia: undefined, pagina: undefined }), ativo: filtro.sentido === "ENTRADA" },
            { rotulo: "Saída", href: href({ sentido: "SAIDA", pendencia: undefined, pagina: undefined }), ativo: filtro.sentido === "SAIDA" },
            { rotulo: `Sem NCM (${contagens.semNcm})`, href: href({ pendencia: "sem_ncm", sentido: undefined, pagina: undefined }), ativo: filtro.pendencia === "sem_ncm" },
            { rotulo: `Sem cClassTrib (${contagens.semClassTrib})`, href: href({ pendencia: "sem_classtrib", sentido: undefined, pagina: undefined }), ativo: filtro.pendencia === "sem_classtrib" },
          ]}
        />
        {itens.length === 0 ? (
          <Vazio companyId={empresa.id} temCadastro={contagens.produtos > 0} />
        ) : (
          <TabelaDeProdutos
            // A marcação é da página aberta: o filtro troca a lista sem recarregar, e sem a key ela ficaria.
            key={`${empresa.id}|${pagina}|${filtro.q ?? ""}|${filtro.sentido ?? ""}|${filtro.pendencia ?? ""}`}
            companyId={empresa.id}
            produtos={itens.map((p) => ({ ...p, ultimaNota: p.ultimaNotaEm ? formatInstantDate(p.ultimaNotaEm) : null }))}
          />
        )}
        <Pagination page={pagina} totalPages={Math.max(1, Math.ceil(total / POR_PAGINA))} total={total} rotulo="produtos" buildHref={(p) => href({ pagina: String(p) })} />
      </>
    );
  }

  return (
    <PageContainer>
      {trilha}
      <PageHeader title="Cadastro fiscal" action={<AtualizarDoAcervo companyId={empresa.id} variante={contagens.produtos + contagens.participantes > 0 ? "secondary" : "primary"} />} />
      <FiltroDaEmpresa foco={foco} />
      <AbasDeLink
        ativa={aba}
        abas={[
          { chave: "produtos", rotulo: "Produtos", href: href({ aba: undefined, q: undefined, pagina: undefined, papel: undefined }), icone: <Package size={14} />, contagem: contagens.produtos },
          { chave: "participantes", rotulo: "Fornecedores e clientes", href: href({ aba: "participantes", q: undefined, pagina: undefined, sentido: undefined, pendencia: undefined }), icone: <Users size={14} />, contagem: contagens.participantes },
          { chave: "ncm", rotulo: "NCM e cClassTrib", href: href({ aba: "ncm", q: undefined, pagina: undefined, sentido: undefined, pendencia: undefined, papel: undefined }), icone: <Link2 size={14} /> },
        ]}
      />
      <Card className="p-4 flex flex-col gap-3">{conteudo}</Card>
    </PageContainer>
  );
}

function Filtros({ q, aba, empresa, chips }: { q?: string; aba: Aba; empresa?: string; chips: { rotulo: string; href: string; ativo: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FormularioDeFiltro action={ROTA} className="flex items-center gap-2">
        {aba !== "produtos" && <input type="hidden" name="aba" value={aba} />}
        {empresa && <input type="hidden" name="empresa" value={empresa} />}
        <Input name="q" defaultValue={q ?? ""} placeholder={aba === "produtos" ? "Código, descrição ou NCM" : "Nome ou CNPJ"} aria-label="Buscar" compact className="w-64" />
        <Button type="submit" size="sm" variant="secondary">
          Buscar
        </Button>
      </FormularioDeFiltro>
      <nav aria-label="Recortes" className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <Link
            key={c.rotulo}
            href={c.href}
            aria-current={c.ativo ? "true" : undefined}
            className={`rounded-full border px-3 py-1 text-fs-2 ${c.ativo ? "border-brand bg-brand-subtle text-brand" : "border-border text-fg-secondary hover:bg-surface-hover"}`}
          >
            {c.rotulo}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function Vazio({ companyId, temCadastro }: { companyId: string; temCadastro: boolean }) {
  return temCadastro ? (
    <EmptyState icon={<Package />} title="Nada neste recorte" description="Troque o filtro ou limpe a busca." />
  ) : (
    <EmptyState
      icon={<Package />}
      title="Cadastro ainda vazio"
      description="Clique em “Atualizar do acervo”: o Connect lê as notas da empresa no acervo do SPED e cria os produtos e os fornecedores e clientes."
      action={<AtualizarDoAcervo companyId={companyId} />}
    />
  );
}
