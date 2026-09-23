import Link from "next/link";
import { notFound } from "next/navigation";
import { KeyRound } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { MetricCard } from "@/components/ui/MetricCard";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { AbasDeLink } from "@/components/financeiro/FiltroDePeriodo";
import { ImportarRelatorio } from "@/components/certificados/ImportarRelatorio";
import { acessoAosCertificados, listarCertificados } from "@/lib/certificados/servidor";
import { atuaisPorDocumento, ROTULO_DA_SITUACAO, situacaoDoCertificado, type SituacaoDoCertificado } from "@/lib/certificados/certificados";
import { diasAte } from "@/lib/societario/licencas";
import { formatCalendarDate, formatCnpj, formatCpf, formatInstantDate } from "@/lib/format";
import { nomeExibicao } from "@/lib/companyName";

export const dynamic = "force-dynamic";

const ABAS = [
  { chave: "renovar", rotulo: "A renovar" },
  { chave: "todos", rotulo: "Todos em uso" },
  { chave: "sem-empresa", rotulo: "Sem empresa no Connect" },
  { chave: "substituidos", rotulo: "Substituídos" },
] as const;

const VARIANTE: Record<SituacaoDoCertificado, "danger" | "warning" | "success" | "info"> = {
  vencido: "danger",
  a_renovar: "warning",
  vigente: "success",
  substituido: "info",
};

/**
 * Vencimento dos certificados A1 dos clientes. Só metadado: o arquivo fica na
 * pasta de rede e a senha no cofre do KeePassXC — a tela diz em qual entrada.
 * O dado chega pela importação do relatório do script de conferência.
 */
export default async function CertificadosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const acesso = await acessoAosCertificados();
  if (!acesso) notFound();
  const params = await searchParams;
  const aba = ABAS.find((a) => a.chave === params.aba)?.chave ?? "renovar";
  const busca = (params.q ?? "").trim().toLowerCase();

  const hoje = new Date();
  const certs = await listarCertificados(acesso.tenantId);
  const atuais = atuaisPorDocumento(certs);
  const linhas = certs.map((c) => ({
    ...c,
    situacao: situacaoDoCertificado(c, atuais.get(c.documento), hoje),
    dias: diasAte(c.expiresAt, hoje),
  }));
  const emUso = linhas.filter((c) => c.situacao !== "substituido");

  const naAba = (c: (typeof linhas)[number]) => {
    if (aba === "substituidos") return c.situacao === "substituido";
    if (c.situacao === "substituido") return false;
    if (aba === "renovar") return c.situacao === "vencido" || c.situacao === "a_renovar";
    if (aba === "sem-empresa") return !c.company;
    return true;
  };
  const digitos = busca.replace(/\D/g, "");
  const visiveis = linhas.filter(
    (c) =>
      naAba(c) &&
      (!busca ||
        c.titular.toLowerCase().includes(busca) ||
        (c.cofreEntrada ?? "").toLowerCase().includes(busca) ||
        (digitos.length >= 3 && c.documento.includes(digitos)))
  );
  const ultimaImportacao = certs.reduce<Date | null>((m, c) => (!m || c.importedAt > m ? c.importedAt : m), null);
  const documento = (c: { tipo: string; documento: string }) => (c.tipo === "CPF" ? formatCpf(c.documento) : formatCnpj(c.documento));
  const href = (a: string) => `/certificados${a === "renovar" ? "" : `?aba=${a}`}`;

  return (
    <PageContainer>
      <PageHeader
        title="Certificados digitais"
        subtitle="Quando vence cada certificado A1 dos clientes e em qual entrada do cofre está a senha. O arquivo e a senha não entram no Connect."
        action={acesso.podeImportar ? <ImportarRelatorio /> : undefined}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Vencidos" value={emUso.filter((c) => c.situacao === "vencido").length} highlight />
        <MetricCard label="Vencem em 30 dias" value={emUso.filter((c) => c.dias >= 0 && c.dias <= 30).length} />
        <MetricCard label="Vencem em 60 dias" value={emUso.filter((c) => c.dias >= 0 && c.dias <= 60).length} />
        <MetricCard label="Sem empresa no Connect" value={emUso.filter((c) => !c.company).length} />
      </div>

      <AbasDeLink abas={ABAS.map((a) => ({ ...a, href: href(a.chave) }))} ativa={aba} />
      <form method="get" action="/certificados" className="mb-4">
        {aba !== "renovar" && <input type="hidden" name="aba" value={aba} />}
        <Input compact name="q" defaultValue={params.q ?? ""} placeholder="Buscar por titular, documento ou entrada do cofre…" className="w-80 max-w-full" />
      </form>

      {visiveis.length === 0 ? (
        <EmptyState
          title={certs.length === 0 ? "Nenhum certificado importado" : busca ? "Nada encontrado" : "Nada nesta aba"}
          description={
            certs.length === 0
              ? "Rode o script de conferência (scripts/certificados/conferir-certificados.ps1) e importe o certificados.csv que ele gera."
              : undefined
          }
          icon={<KeyRound />}
        />
      ) : (
        <>
          <CartoesNoCelular>
            {visiveis.map((c) => (
              <Cartao key={c.id}>
                <TopoDoCartao nome={c.company ? nomeExibicao(c.company) : c.titular} valor={formatCalendarDate(c.expiresAt)} />
                <InfoDoCartao className="tabular-nums">
                  {c.tipo === "CPF" ? "e-CPF" : "e-CNPJ"} · {documento(c)}
                </InfoDoCartao>
                <InfoDoCartao>cofre: {c.cofreEntrada ?? "—"}</InfoDoCartao>
                {c.conferir && <InfoDoCartao className="text-warning">{c.conferir}</InfoDoCartao>}
                <PeDoCartao>
                  <Badge variant={VARIANTE[c.situacao]}>{ROTULO_DA_SITUACAO[c.situacao]}</Badge>
                </PeDoCartao>
              </Cartao>
            ))}
          </CartoesNoCelular>

          <TabelaNoDesktop>
            <table className="w-full min-w-[980px] text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                  <th className="py-2 pr-3 font-medium">Titular</th>
                  <th className="py-2 pr-3 font-medium">Documento</th>
                  <th className="py-2 pr-3 font-medium">Vencimento</th>
                  <th className="py-2 pr-3 font-medium text-right">Dias</th>
                  <th className="py-2 pr-3 font-medium">Situação</th>
                  <th className="py-2 font-medium">Entrada do cofre</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((c) => (
                  <tr key={c.id} className="border-b border-border-soft align-top hover:bg-surface-hover transition-colors">
                    <td className="py-2.5 pr-3">
                      {c.company ? (
                        <Link href={`/empresas/${c.company.id}`} className="font-medium hover:underline">
                          {nomeExibicao(c.company)}
                        </Link>
                      ) : (
                        <span className="font-medium">{c.titular}</span>
                      )}
                      {!c.company && <span className="block text-[11px] text-fg-muted">sem empresa no Connect</span>}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-fg-secondary">
                      {documento(c)}
                      <span className="block text-[11px] text-fg-muted">{c.tipo === "CPF" ? "e-CPF" : "e-CNPJ"}</span>
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums">{formatCalendarDate(c.expiresAt)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{c.situacao === "substituido" ? "—" : c.dias}</td>
                    <td className="py-2.5 pr-3">
                      <Badge variant={VARIANTE[c.situacao]}>{ROTULO_DA_SITUACAO[c.situacao]}</Badge>
                    </td>
                    <td className="py-2.5 text-fg-secondary">
                      {c.cofreEntrada ?? "—"}
                      {c.conferir && <span className="block text-[11px] text-warning">{c.conferir}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabelaNoDesktop>
          <p className="text-[11px] text-fg-muted mt-3">
            Vencimento lido de dentro do certificado. Quando o mesmo CNPJ/CPF tem um certificado mais novo, o antigo vira
            &ldquo;substituído&rdquo; e para de avisar. Avisos saem para o setor a 60, 30, 15 e 7 dias e no vencimento.
            {ultimaImportacao && <> Última importação: {formatInstantDate(ultimaImportacao)}.</>}
          </p>
        </>
      )}
    </PageContainer>
  );
}
