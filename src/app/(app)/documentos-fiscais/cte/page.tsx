import Link from "next/link";
import { notFound } from "next/navigation";
import { Truck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/shared/PageContainer";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { BackButton } from "@/components/shared/BackButton";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { credenciaisDoAmbiente, listarCtePorRota, ErroDoSped } from "@/lib/sped/client";
import { raizesDoAlcance, janelaDoMesCorrente, ehDataValida } from "@/lib/sped/raizes";
import { alcanceDaEquipe } from "../alcance";
import { formatCnpj } from "@/lib/format";
import { Button } from "@/components/ui/Button";

const SECTOR = "fiscal";
const MODULE = "fiscal_documentos";
const POR_PAGINA = 100;

/**
 * CT-e — consulta ao vivo no SPED, sem ingestão.
 *
 * ─── Por que esta tela não usa o acervo ──────────────────────────────────────
 *
 * Decidido em 09/09, com dois números na mesa. Um mês de CT-e tem 2,3 a 4,8
 * milhões de documentos, contra 140 mil do acervo inteiro — ingerir seria
 * multiplicar a tabela por 16 a 34 **por mês**, e degradar as consultas de NF-e
 * e NFS-e que hoje vão bem. É o mesmo argumento que o lado do SPED usou para
 * recusar crescer o índice deles 195×.
 *
 * E o que se ganharia é pouco: a listagem devolve `valor: null`, então
 * `podeLancar` recusa com `sem_valor` e **nenhum CT-e viraria lançamento**.
 * Sobra consulta — que é justamente o que dá para fazer sem gravar nada.
 *
 * ─── A janela é de rota, não de competência ──────────────────────────────────
 *
 * `data_rota` é a única dimensão indexada do lado de lá, e ela não coincide com
 * a competência: numa janela de 29/12 a 03/01, 59% dos documentos são de
 * dezembro e 41% de janeiro. A coluna Competência abaixo vem exata, da chave —
 * ela só não é o que filtra.
 */
export default async function CtePage({
  searchParams,
}: {
  searchParams: Promise<{ raiz?: string; de?: string; ate?: string; cursor?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, SECTOR)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const sp = await searchParams;
  const permitidas = await raizesDoAlcance(alcanceDaEquipe(ctx.tenantId));
  const raizes = [...permitidas].sort();

  // Raiz da URL só vale se estiver no alcance — o parâmetro é do usuário, e sem
  // esta conferência ele leria o frete de qualquer contribuinte.
  const raiz = sp.raiz && permitidas.has(sp.raiz) ? sp.raiz : (raizes[0] ?? null);

  const padrao = janelaDoMesCorrente();
  const de = sp.de && ehDataValida(sp.de) ? sp.de : padrao.de;
  const ate = sp.ate && ehDataValida(sp.ate) ? sp.ate : padrao.ate;

  const creds = credenciaisDoAmbiente();

  let documentos: Awaited<ReturnType<typeof listarCtePorRota>>["documentos"] = [];
  let proximoCursor: string | null = null;
  let erro: string | null = null;

  if (raiz && creds) {
    try {
      const pagina = await listarCtePorRota(creds, raiz, { de, ate }, { cursor: sp.cursor, limite: POR_PAGINA });
      documentos = pagina.documentos;
      proximoCursor = pagina.proximo_cursor;
    } catch (e) {
      // Cursor de outra janela responde `cursor_invalido` de propósito, em vez
      // de devolver um pedaço do meio dela em silêncio. Traduzir aqui evita que
      // pareça falha de rede.
      erro =
        e instanceof ErroDoSped && e.codigo === "cursor_invalido"
          ? "A janela mudou depois desta página. Recomece a consulta."
          : e instanceof ErroDoSped
            ? `O SPED recusou a consulta (${e.status}).`
            : "Não foi possível consultar o SPED agora.";
    }
  }

  const url = (p: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    if (raiz) q.set("raiz", raiz);
    q.set("de", de);
    q.set("ate", ate);
    for (const [k, v] of Object.entries(p)) {
      if (v === undefined) q.delete(k);
      else q.set(k, v);
    }
    return `/documentos-fiscais/cte?${q.toString()}`;
  };

  return (
    <PageContainer>
      <BackButton className="mb-3" />
      <PageHeader
        title="CT-e"
        subtitle={
          <>
            Consulta ao vivo no SPED, por data de rota. <strong>Não entra no acervo</strong> — são
            milhões por mês, e eles vêm sem valor apurado, então não geram lançamento.
          </>
        }
      />

      {!creds ? (
        <Card>
          <EmptyState
            icon={<Truck />}
            title="Integração com o SPED não configurada"
            description="Sem SPED_API_URL e SPED_API_TOKEN no ambiente, não há o que consultar."
          />
        </Card>
      ) : !raiz ? (
        <Card>
          <EmptyState
            icon={<Truck />}
            title="Nenhuma raiz de CNPJ no seu alcance"
            description="A consulta é por raiz de CNPJ do cliente, que vem do cadastro de clientes."
          />
        </Card>
      ) : (
        <>
          <form className="flex flex-wrap items-end gap-3 mb-5" action="/documentos-fiscais/cte">
            <CampoForm label="Cliente (raiz do CNPJ)" htmlFor="raiz">
              <Select id="raiz" name="raiz" defaultValue={raiz}>
                {raizes.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </CampoForm>
            <CampoForm label="Rota de" htmlFor="de">
              <Input id="de" name="de" type="date" defaultValue={de} />
            </CampoForm>
            <CampoForm label="Rota até" htmlFor="ate">
              <Input id="ate" name="ate" type="date" defaultValue={ate} />
            </CampoForm>
            <Button
              variant="primary"
              size="md"
              type="submit"
            >
              Consultar
            </Button>
          </form>

          {erro ? (
            <Card className="p-4 border-danger/40 bg-danger-bg">
              <p className="text-[13px] text-fg">{erro}</p>
            </Card>
          ) : documentos.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Truck />}
                title="Nenhum CT-e nesta janela"
                description="Ajuste o período de rota. Lembrando que a janela é de data de rota, e não de competência — elas não coincidem."
              />
            </Card>
          ) : (
            <>
              <div className="overflow-x-auto border border-border rounded-lg bg-surface">
                <table className="w-full text-[13px] border-collapse">
                  <thead>
                    <tr className="bg-surface-2 text-fg-muted">
                      <th className="text-left font-medium px-3 py-2">Número</th>
                      <th className="text-left font-medium px-3 py-2">Série</th>
                      <th className="text-left font-medium px-3 py-2">Competência</th>
                      <th className="text-left font-medium px-3 py-2">Emitente</th>
                      <th className="text-left font-medium px-3 py-2">Sentido</th>
                      <th className="text-left font-medium px-3 py-2">PDF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documentos.map((d) => (
                      <tr key={d.identificador} className="border-t border-border-soft">
                        <td className="px-3 py-2 text-fg tabular-nums">{d.numero}</td>
                        <td className="px-3 py-2 text-fg-muted">{d.serie ?? "—"}</td>
                        <td className="px-3 py-2 text-fg tabular-nums">{d.competencia}</td>
                        <td className="px-3 py-2 text-fg-muted">
                          {d.cnpj_emitente ? formatCnpj(d.cnpj_emitente) : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {/* `saida` é o caso normal do acervo — o frete que a
                              transportadora emitiu. `entrada` e `indefinido`
                              chamam atenção porque são a exceção. */}
                          <Badge variant={d.sentido === "saida" ? "info" : "warning"}>
                            {d.sentido}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          {d.renderizavel && d.chave ? (
                            <a
                              href={`/api/documentos-fiscais/cte/pdf?chave=${encodeURIComponent(d.chave)}&raiz=${encodeURIComponent(raiz)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand hover:underline"
                            >
                              Abrir
                            </a>
                          ) : (
                            <span className="text-fg-muted">sem XML</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between gap-3 mt-4">
                <p className="text-[12px] text-fg-muted">
                  {documentos.length} CT-e nesta página. O valor não vem na listagem — só dentro do
                  XML, por documento.
                </p>
                {proximoCursor && (
                  <Link
                    href={url({ cursor: proximoCursor })}
                    className="h-9 px-4 rounded-md border border-border text-[13px] text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors inline-flex items-center"
                  >
                    Próxima página
                  </Link>
                )}
              </div>
            </>
          )}
        </>
      )}
    </PageContainer>
  );
}
