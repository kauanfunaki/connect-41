import { notFound } from "next/navigation";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Aviso } from "@/components/ui/Aviso";
import { Selo } from "@/components/ui/Selo";
import { Button } from "@/components/ui/Button";
import { CorrigirLinha } from "@/components/revisao-contabil/CorrigirLinha";
import { carregarDocumento, carregarFechamento } from "@/lib/revisao-contabil/servidor";
import { CAMPOS_DA_CORRECAO } from "@/lib/revisao-contabil/fechamento";
import { formatarNumero, formatarReaisDeCentavos, formatCnpj } from "@/lib/format";
import { nomeExibicao } from "@/lib/companyName";

export const dynamic = "force-dynamic";

const reais = (c: number | null | undefined) => (c == null ? "—" : formatarReaisDeCentavos(c));

/** Linhas do balancete por página da tela: o razão e balancetes grandes passam de mil. */
const LINHAS = 500;

// Conferir a leitura de um documento (05/11/2026): o que o motor extraiu, antes
// de confiar na análise — o "Confira a extração antes de analisar" do original.
// No balancete, cada linha pode ser corrigida; a correção vale nas próximas
// análises e o documento continua como foi lido.
export default async function LeituraDoDocumentoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; docId: string }>;
  searchParams: Promise<{ pagina?: string }>;
}) {
  const { ctx } = await abrirTelaDoModulo("contabil_revisao");
  const [{ id, docId }, { pagina }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(docId)) notFound();
  const [dados, doc, podeAgir] = await Promise.all([
    carregarFechamento(ctx.tenantId, id),
    carregarDocumento(ctx.tenantId, id, docId),
    podeNoModulo(ctx, "contabil_revisao", "agir"),
  ]);
  if (!dados || !doc) notFound();

  const fatos = doc.fatos;
  const nome = nomeExibicao(dados.fechamento.company);
  const contas = fatos.accounts ?? [];
  const paginas = Math.max(1, Math.ceil(contas.length / LINHAS));
  const atual = Math.min(paginas, Math.max(1, Number(pagina) || 1));
  const daPagina = contas.slice((atual - 1) * LINHAS, atual * LINHAS);
  const rubricas = Object.entries(fatos.statements ?? {});
  const avisos = fatos.warnings ?? [];

  return (
    <PageContainer>
      <Breadcrumb
        items={[
          { label: "Revisão do fechamento", href: "/revisao-contabil" },
          { label: nome, href: `/revisao-contabil/${id}?aba=documentos` },
          { label: doc.nome },
        ]}
      />
      <PageHeader
        title={doc.nome}
        subtitle={`${fatos.kind}${fatos.layout ? ` · ${fatos.layout === "classified" ? "com classificação" : "sem classificação"}` : ""}`}
        action={
          <Button href={`/api/revisao-contabil/documentos/${doc.id}`} nativo target="_blank" rel="noopener" variant="secondary" size="sm">
            Abrir o arquivo
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        <Card as="section" className="p-4">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-micro uppercase tracking-wide text-fg-muted">CNPJ lido</dt>
              <dd className="text-ui">{fatos.cnpjs?.length ? fatos.cnpjs.map((c) => formatCnpj(c)).join(", ") : "Não localizado"}</dd>
            </div>
            <div>
              <dt className="text-micro uppercase tracking-wide text-fg-muted">Período lido</dt>
              <dd className="text-ui">{fatos.periods?.length ? fatos.periods.map((p) => p.join(" a ")).join("; ") : "Não localizado"}</dd>
            </div>
            <div>
              <dt className="text-micro uppercase tracking-wide text-fg-muted">Páginas e caracteres</dt>
              <dd className="text-ui tabular-nums">
                {fatos.pages ?? "—"} · {fatos.characters != null ? formatarNumero(fatos.characters, 0) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-micro uppercase tracking-wide text-fg-muted">SHA-256</dt>
              <dd className="truncate font-mono text-helper" title={doc.sha256}>
                {doc.sha256}
              </dd>
            </div>
          </dl>
        </Card>

        {avisos.length > 0 && (
          <Aviso tom="atencao">
            <ul className="list-disc pl-5">
              {avisos.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </Aviso>
        )}

        {fatos.ledger && (
          <Card as="section" className="p-4">
            <h2 className="mb-1 text-label font-semibold text-fg">Razão</h2>
            <p className="text-ui text-fg-secondary">
              {fatos.ledger.accounts.length} contas e {formatarNumero(fatos.ledger.entryCount, 0)} lançamentos lidos.
              {fatos.ledger.accounts.some((c) => c.issues.length) && " Contas com observação de leitura aparecem nos testes da análise."}
            </p>
          </Card>
        )}

        {fatos.fiscal && (
          <Card as="section" className="p-4">
            <h2 className="mb-1 text-label font-semibold text-fg">{fatos.fiscal.report}</h2>
            <p className="text-ui text-fg-secondary">
              Total {reais(fatos.fiscal.total?.value)} · {fatos.fiscal.items} itens somando {reais(fatos.fiscal.itemsTotal)} · {fatos.fiscal.months.length} meses
            </p>
          </Card>
        )}

        {fatos.payments && (
          <Card as="section" className="overflow-x-auto p-4">
            <h2 className="mb-2 text-label font-semibold text-fg">Guias lidas ({fatos.payments.guides.length})</h2>
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-border text-left text-micro uppercase tracking-wide text-fg-muted">
                  <th className="py-2 pr-3 font-medium">Guia</th>
                  <th className="py-2 pr-3 font-medium">Apuração</th>
                  <th className="py-2 pr-3 font-medium">Vencimento</th>
                  <th className="py-2 pr-3 font-medium">Pagamento</th>
                  <th className="py-2 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {fatos.payments.guides.map((g, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">{[g.type, g.number].filter(Boolean).join(" ") || "—"}</td>
                    <td className="py-2 pr-3">{g.period ?? "—"}</td>
                    <td className="py-2 pr-3">{g.due ?? "—"}</td>
                    <td className="py-2 pr-3">{g.paid ?? "—"}</td>
                    <td className="py-2 text-right tabular-nums">{reais(g.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {rubricas.length > 0 && (
          <Card as="section" className="overflow-x-auto p-4">
            <h2 className="mb-2 text-label font-semibold text-fg">Rubricas e totais</h2>
            <table className="w-full min-w-[520px]">
              <tbody>
                {rubricas.map(([chave, r]) => (
                  <tr key={chave} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">{chave.replace(/^BP:/, "Balanço: ")}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{reais(r.value)}</td>
                    <td className="py-2 text-helper text-fg-muted">
                      pág. {r.page}, linha {r.line}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {contas.length > 0 && (
          <Card as="section" className="overflow-x-auto p-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-label font-semibold text-fg">Contas do balancete ({contas.length})</h2>
              {paginas > 1 && (
                <nav className="flex gap-1 text-button-sm" aria-label="Páginas das contas">
                  {Array.from({ length: paginas }, (_, i) => i + 1).map((p) => (
                    <a
                      key={p}
                      href={`?pagina=${p}`}
                      aria-current={p === atual ? "page" : undefined}
                      className={`rounded-md px-2 py-1 ${p === atual ? "bg-brand/10 text-brand" : "text-fg-muted hover:bg-surface-hover"}`}
                    >
                      {p}
                    </a>
                  ))}
                </nav>
              )}
            </div>
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-border text-left text-micro uppercase tracking-wide text-fg-muted">
                  <th className="py-2 pr-3 font-medium">Conta</th>
                  <th className="py-2 pr-3 font-medium text-right">Saldo inicial</th>
                  <th className="py-2 pr-3 font-medium text-right">Débitos</th>
                  <th className="py-2 pr-3 font-medium text-right">Créditos</th>
                  <th className="py-2 pr-3 font-medium text-right">Saldo final</th>
                  <th className="py-2 pr-3 font-medium">Origem</th>
                  <th className="py-2 font-medium sr-only">Corrigir</th>
                </tr>
              </thead>
              <tbody>
                {daPagina.map((c, j) => {
                  const linha = (atual - 1) * LINHAS + j;
                  const corrigido = dados.correcoes[`${doc.id}:${linha}`] ?? {};
                  const valor = (k: (typeof CAMPOS_DA_CORRECAO)[number]) =>
                    corrigido[k] !== undefined ? (
                      <span title={`Lido: ${reais(c[k])}`}>
                        {reais(corrigido[k])} <Selo tom="marca">corrigido</Selo>
                      </span>
                    ) : (
                      reais(c[k])
                    );
                  return (
                    <tr key={linha} className="border-b border-border last:border-0 align-top">
                      <td className="py-2 pr-3 max-w-[280px] break-words">
                        <span className="tabular-nums text-fg-muted">{c.code}</span> {c.name}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{valor("opening")}</td>
                      <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{valor("debit")}</td>
                      <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{valor("credit")}</td>
                      <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{valor("closing")}</td>
                      <td className="py-2 pr-3 text-helper text-fg-muted whitespace-nowrap">
                        {c.sheet ? `${c.sheet}, ` : ""}pág. {c.page}, linha {c.line}
                      </td>
                      <td className="py-2 text-right">
                        {podeAgir && (
                          <CorrigirLinha
                            fechamentoId={id}
                            documentoId={doc.id}
                            linha={linha}
                            conta={`${c.code} ${c.name}`}
                            lido={{ opening: c.opening, debit: c.debit, credit: c.credit, closing: c.closing }}
                            corrigido={corrigido}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
