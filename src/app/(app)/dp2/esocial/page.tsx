import Link from "next/link";
import { Landmark } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Aviso } from "@/components/ui/Aviso";
import { Selo } from "@/components/ui/Selo";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { CampoMes } from "@/components/ui/CampoMes";
import { CampoData } from "@/components/ui/CampoData";
import { Select } from "@/components/ui/Select";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { FiltroDaEmpresa, EscolhaAEmpresa } from "@/components/empresas/FiltroDaEmpresa";
import { FormularioDoDp2 } from "@/components/dp2/Formulario";
import { Secao, TD, TH, TR } from "@/components/dp2/Secao";
import { getPrisma } from "@/lib/prisma";
import { formatInstantDateTime } from "@/lib/format";
import { abrirTelaDeEmpresaDoDp2, mesAtual, nomeDaCompetencia } from "@/lib/dp2/tela";
import { GRUPO_DO_EVENTO, NOME_DO_EVENTO, type TipoDeEvento } from "@/lib/dp2/esocial/leiaute";
import { TRANSMISSAO_PENDENTE } from "@/lib/dp2/esocial/transmissao";
import type { Pendencia } from "@/lib/dp2/esocial/eventos";
import { gerarPeriodicosEsocialAction, gerarTabelasEsocialAction } from "../actions";

const NOME_DA_SITUACAO: Record<string, string> = { PENDENCIA: "Com pendência", PRONTO: "Pronto", ENVIADO: "Enviado", ACEITO: "Aceito", REJEITADO: "Rejeitado" };
const TOM: Record<string, "atencao" | "marca" | "sucesso" | "perigo" | "neutro"> = { PENDENCIA: "atencao", PRONTO: "marca", ENVIADO: "neutro", ACEITO: "sucesso", REJEITADO: "perigo" };

/**
 * eSocial do DP 2 (12/11/2026, fase 3a): os eventos da empresa em foco —
 * tabelas e periódicos — gerados do que o DP 2 já tem, com as pendências de
 * cadastro e o XML para conferir. A assinatura e o envio ainda não estão
 * ligados (decisão do Victor em 12/11/2026).
 */
export default async function EsocialDoDp2({ searchParams }: { searchParams: Promise<{ empresa?: string; tipo?: string }> }) {
  const params = await searchParams;
  const tela = await abrirTelaDeEmpresaDoDp2("dp2_esocial", params.empresa);
  const cabecalho = <PageHeader title="eSocial" subtitle="Os eventos do eSocial da empresa escolhida na faixa acima, gerados do que o DP 2 já tem, com o que falta no cadastro." />;
  if (!tela.empresa) {
    return (
      <PageContainer>
        {cabecalho}
        <FiltroDaEmpresa foco={tela.foco} />
        {tela.temEmpresas ? <EscolhaAEmpresa escolha={tela.escolha} /> : <EmptyState icon={<Landmark />} title="Nenhuma empresa ativa" />}
      </PageContainer>
    );
  }

  const prisma = getPrisma();
  const [eventos, fechadas] = await Promise.all([
    prisma.dp2EventoEsocial.findMany({
      where: { tenantId: tela.tenantId, companyId: tela.empresa.id },
      orderBy: [{ createdAt: "desc" }],
      select: { id: true, tipo: true, referencia: true, situacao: true, pendencias: true, createdAt: true, person: { select: { name: true } } },
      take: 300,
    }),
    prisma.dp2Competencia.findMany({
      where: { tenantId: tela.tenantId, companyId: tela.empresa.id, tipo: "MENSAL", situacao: "FECHADA" },
      orderBy: [{ ano: "desc" }, { mes: "desc" }],
      select: { id: true, ano: true, mes: true },
      take: 12,
    }),
  ]);
  const filtro = params.tipo && params.tipo in NOME_DO_EVENTO ? params.tipo : null;
  const visiveis = filtro ? eventos.filter((e) => e.tipo === filtro) : eventos;
  const conta = (s: string) => eventos.filter((e) => e.situacao === s).length;
  const prontosNoGrupo = (g: "1" | "3") => eventos.filter((e) => e.situacao === "PRONTO" && GRUPO_DO_EVENTO[e.tipo as TipoDeEvento] === g).length;

  // As pendências que bloqueiam, sem repetir (a mesma rubrica sem natureza aparece uma vez).
  const pendencias = new Map<string, Pendencia>();
  for (const e of eventos) {
    if (e.situacao !== "PENDENCIA") continue;
    for (const p of (e.pendencias as unknown as Pendencia[]) ?? []) if (p.bloqueia && !pendencias.has(p.texto)) pendencias.set(p.texto, p);
  }
  const avisos = new Map<string, Pendencia>();
  for (const e of eventos) for (const p of (e.pendencias as unknown as Pendencia[]) ?? []) if (!p.bloqueia && !avisos.has(p.texto)) avisos.set(p.texto, p);

  return (
    <PageContainer>
      {cabecalho}
      <FiltroDaEmpresa foco={tela.foco} />
      <Aviso tom="info" className="mb-5">
        {TRANSMISSAO_PENDENTE} Os eventos saem no ambiente de testes (produção restrita) e ainda não passaram pelo validador dos XSD oficiais.
      </Aviso>

      <div className="mb-5">
        <FaixaDeTotais
          itens={[
            { rotulo: "Prontos", valor: String(conta("PRONTO")), detalhe: "Esperando a assinatura e o envio" },
            { rotulo: "Com pendência", valor: String(conta("PENDENCIA")), tom: conta("PENDENCIA") ? "text-warning-fg" : undefined, detalhe: "Falta cadastro" },
            { rotulo: "Enviados", valor: String(conta("ENVIADO") + conta("ACEITO")), detalhe: "Quando o envio estiver ligado" },
          ]}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2 mb-5">
        <Secao titulo="Tabelas" apoio="Empregador (S-1000), estabelecimento (S-1005), lotação (S-1020) e as rubricas ativas (S-1010). Gere de novo depois de corrigir o cadastro: o evento não enviado é trocado.">
          {tela.podeAgir && (
            <FormularioDoDp2 acao={gerarTabelasEsocialAction} rotulo="Gerar tabelas" rotuloEnviando="Gerando…" variante="secondary">
              <input type="hidden" name="companyId" value={tela.empresa.id} />
              <CampoForm label="Valem desde" htmlFor="iniValid" helper="O primeiro mês em que a empresa entra no eSocial pelo Connect.">
                <CampoMes id="iniValid" name="iniValid" defaultValue={mesAtual()} required />
              </CampoForm>
            </FormularioDoDp2>
          )}
          {prontosNoGrupo("1") > 0 && (
            <Button href={`/api/dp2/esocial/lote?empresa=${tela.empresa.id}&grupo=1`} variant="ghost" size="sm" download className="mt-3">
              Baixar lote de tabelas para conferência
            </Button>
          )}
        </Secao>

        <Secao titulo="Periódicos" apoio="Remuneração (S-1200) e pagamento (S-1210) de cada colaborador e o fechamento (S-1299), da folha mensal fechada.">
          {fechadas.length === 0 ? (
            <p className="text-fs-3 text-fg-muted">
              Nenhuma folha mensal fechada.{" "}
              <Link href="/dp2/competencia" className="text-brand hover:underline">
                Feche a competência
              </Link>{" "}
              para gerar os periódicos.
            </p>
          ) : (
            tela.podeAgir && (
              <FormularioDoDp2 acao={gerarPeriodicosEsocialAction} rotulo="Gerar periódicos" rotuloEnviando="Gerando…" variante="secondary">
                <div className="grid gap-4 sm:grid-cols-2">
                  <CampoForm label="Competência" htmlFor="competenciaId">
                    <Select id="competenciaId" name="competenciaId" defaultValue={fechadas[0].id}>
                      {fechadas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {nomeDaCompetencia(c.ano, c.mes)}
                        </option>
                      ))}
                    </Select>
                  </CampoForm>
                  <CampoForm label="Data do pagamento" htmlFor="dtPgto" helper="Vai no S-1210.">
                    <CampoData id="dtPgto" name="dtPgto" required />
                  </CampoForm>
                </div>
              </FormularioDoDp2>
            )
          )}
          {prontosNoGrupo("3") > 0 && (
            <Button href={`/api/dp2/esocial/lote?empresa=${tela.empresa.id}&grupo=3`} variant="ghost" size="sm" download className="mt-3">
              Baixar lote de periódicos para conferência
            </Button>
          )}
        </Secao>
      </div>

      {(pendencias.size > 0 || avisos.size > 0) && (
        <Secao titulo="O que falta no cadastro" apoio="Corrija e gere os eventos de novo. O que está em “conferir” não impede o envio, mas é um código que o Connect sugeriu." className="mb-5">
          <ul className="flex flex-col gap-2 text-fs-3">
            {[...pendencias.values()].map((p) => (
              <li key={p.texto} className="flex flex-wrap items-baseline gap-2">
                <Selo tom="atencao">falta</Selo>
                <span>{p.texto}</span>
                {p.link && (
                  <Link href={p.link} className="text-brand hover:underline text-fs-2">
                    Corrigir
                  </Link>
                )}
              </li>
            ))}
            {[...avisos.values()].map((p) => (
              <li key={p.texto} className="flex flex-wrap items-baseline gap-2">
                <Selo tom="neutro">conferir</Selo>
                <span>{p.texto}</span>
                {p.link && (
                  <Link href={p.link} className="text-brand hover:underline text-fs-2">
                    Abrir
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Secao>
      )}

      <Secao
        titulo={`${visiveis.length} evento(s)`}
        acao={
          <div className="flex flex-wrap gap-1">
            <Button href="/dp2/esocial" variant={filtro ? "ghost" : "secondary"} size="xs">
              Todos
            </Button>
            {(Object.keys(NOME_DO_EVENTO) as TipoDeEvento[]).map((t) => (
              <Button key={t} href={`/dp2/esocial?tipo=${t}`} variant={filtro === t ? "secondary" : "ghost"} size="xs">
                {t}
              </Button>
            ))}
          </div>
        }
      >
        {visiveis.length === 0 ? (
          <p className="text-fs-3 text-fg-muted">Nenhum evento gerado ainda. Comece pelas tabelas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-fs-3">
              <thead>
                <tr>
                  <th className={TH}>Evento</th>
                  <th className={TH}>Referência</th>
                  <th className={TH}>Situação</th>
                  <th className={TH}>Gerado em</th>
                  <th className={TH}>XML</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((e) => {
                  const ps = (e.pendencias as unknown as Pendencia[]) ?? [];
                  return (
                    <tr key={e.id} className={TR}>
                      <td className={TD}>
                        <span className="font-medium tabular-nums">{e.tipo}</span> <span className="text-fg-muted">{NOME_DO_EVENTO[e.tipo as TipoDeEvento] ?? ""}</span>
                      </td>
                      <td className={TD}>{e.person?.name ? `${e.person.name} · ${e.referencia.split(" · ")[0]}` : e.referencia}</td>
                      <td className={TD}>
                        <Selo tom={TOM[e.situacao] ?? "neutro"}>{NOME_DA_SITUACAO[e.situacao] ?? e.situacao}</Selo>
                        {ps.filter((p) => p.bloqueia).length > 0 && <span className="block text-fs-2 text-warning-fg mt-1">{ps.filter((p) => p.bloqueia).map((p) => p.texto).join(" ")}</span>}
                      </td>
                      <td className={`${TD} whitespace-nowrap text-fg-muted`}>{formatInstantDateTime(e.createdAt)}</td>
                      <td className={`${TD} whitespace-nowrap`}>
                        <a href={`/api/dp2/esocial/${e.id}`} target="_blank" rel="noopener" className="text-brand hover:underline">
                          Ver
                        </a>
                        {" · "}
                        <a href={`/api/dp2/esocial/${e.id}?baixar=1`} download className="text-brand hover:underline">
                          Baixar
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
    </PageContainer>
  );
}
