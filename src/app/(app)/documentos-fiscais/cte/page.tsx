import { notFound } from "next/navigation";
import { Truck, FileText, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/shared/PageContainer";
import { CampoForm, AlinhadoAoCampo } from "@/components/ui/CampoForm";
import { CampoData } from "@/components/ui/CampoData";
import { Select } from "@/components/ui/Select";
import { BackButton } from "@/components/shared/BackButton";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { listarCtePorRota, ErroDoSped } from "@/lib/sped/client";
import { credenciaisDoSped } from "@/lib/sped/credenciais";
import { raizesDoAlcance, janelaDoMesCorrente, ehDataValida } from "@/lib/sped/raizes";
import { alcanceDaEquipe } from "../alcance";
import { formatCnpj } from "@/lib/format";
import { Button } from "@/components/ui/Button";

// `SECTOR` é a chave do dado (onde o módulo nasce) e o padrão do gate; o
// acesso segue o setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = "fiscal";
const MODULE = "fiscal_documentos";
const POR_PAGINA = 100;

/** O sentido que a API devolve cru ("saida", sem acento) em rótulo de tela (07/10/2026). */
const SENTIDO_LABEL: Record<"entrada" | "saida" | "indefinido", string> = {
  entrada: "Entrada",
  saida: "Saída",
  indefinido: "Indefinido",
};

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
  if (!ctx.tenantId || !canActOnSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
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

  const creds = await credenciaisDoSped(ctx.tenantId);

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
            description="Este workspace não tem a integração do SPED ligada em Integrações — sem ela, não há o que consultar."
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
          {/* Fica formulário, e não o botão "Filtros" (30/09): a raiz é o
              contexto da consulta — uma por vez, sem "todas" — e o intervalo de
              datas mora fora do botão pela própria regra. E enviar pelo
              formulário descarta o cursor, que é de uma janela só. */}
          {/* Grade de largura fixa, e não fileira `items-end`: as datas numa
              coluna de 170px (eram do tamanho que o navegador quisesse) e o
              "Consultar" no `AlinhadoAoCampo`, na altura dos campos. */}
          <form
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[240px_170px_170px_auto] gap-4 mb-5"
            action="/documentos-fiscais/cte"
          >
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
              <CampoData id="de" name="de" defaultValue={de} />
            </CampoForm>
            <CampoForm label="Rota até" htmlFor="ate">
              <CampoData id="ate" name="ate" defaultValue={ate} />
            </CampoForm>
            <AlinhadoAoCampo>
              <Button type="submit">Consultar</Button>
            </AlinhadoAoCampo>
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
              {/* Casco padrão (30/09). Sem funil por coluna: a página é um
                  pedaço de 100 da janela, por cursor, e o SPED só filtra por
                  raiz e rota — funil nas linhas da tela mentiria sobre as
                  outras páginas. */}
              <div className="c41-tabela overflow-x-auto bg-surface border border-border rounded-lg">
                <table className="w-full text-[length:var(--fs-ui)] border-collapse">
                  <thead>
                    <tr className="border-b border-border text-[length:var(--fs-micro)] font-semibold uppercase tracking-wide text-fg-muted">
                      <th className="px-3 py-2">Número</th>
                      <th className="px-3 py-2">Série</th>
                      <th className="px-3 py-2">Competência</th>
                      <th className="px-3 py-2">Emitente</th>
                      <th className="px-3 py-2">Sentido</th>
                      <th className="px-3 py-2">PDF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documentos.map((d) => (
                      <tr key={d.identificador} className="border-b border-border">
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
                            {SENTIDO_LABEL[d.sentido] ?? d.sentido}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          {d.renderizavel && d.chave ? (
                            // Botão, e não link de texto (30/09) — mas num
                            // formulário GET, e não no `Button href`: o `href`
                            // vira `<Link>`, que pré-carrega a rota ao aparecer
                            // na tela, e aqui cada linha pediria o PDF ao SPED.
                            <form action="/api/documentos-fiscais/cte/pdf" method="get" target="_blank" className="inline-flex">
                              <input type="hidden" name="chave" value={d.chave} />
                              <input type="hidden" name="raiz" value={raiz} />
                              <Button type="submit" variant="secondary" size="xs">
                                <FileText size={11} /> Abrir
                              </Button>
                            </form>
                          ) : (
                            <span className="text-fg-muted">sem XML</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
                <p className="text-[12px] text-fg-muted">
                  {documentos.length} CT-e nesta página. O valor não vem na listagem — só dentro do
                  XML, por documento.
                </p>
                {/* Só "próxima": a paginação é por cursor, sem total nem
                    volta — por isso não é o `Pagination`. */}
                {proximoCursor && (
                  <Button href={url({ cursor: proximoCursor })} variant="secondary" size="sm">
                    Próxima página <ChevronRight size={14} />
                  </Button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </PageContainer>
  );
}
