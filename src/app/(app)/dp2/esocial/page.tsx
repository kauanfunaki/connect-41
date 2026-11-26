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
import { Input } from "@/components/ui/Input";
import { FormulariosDeSst } from "@/components/dp2/FormulariosDeSst";
import { colaboradoresDaEmpresa } from "@/lib/dp2/servidor";
import { MOTIVOS_DE_AFASTAMENTO, TIPOS_DE_REINTEGRACAO } from "@/lib/dp2/esocial/naoPeriodicos";
import {
  gerarAdmissaoAction,
  gerarAfastamentoAction,
  gerarAlteracaoAction,
  gerarReintegracaoAction,
  gerarPeriodicosEsocialAction,
  gerarTabelasEsocialAction,
  gerarTerminoSemVinculoAction,
  excluirNoEsocialAction,
  registrarReciboEsocialAction,
} from "../actions";
import { podeExcluirPeloS3000 } from "@/lib/dp2/esocial/eventos";
import { semVinculo } from "@/lib/dp2/categorias";

const NOME_DA_SITUACAO: Record<string, string> = {
  PENDENCIA: "Com pendência",
  PRONTO: "Pronto",
  ENVIADO: "Enviado",
  ACEITO: "Aceito",
  REJEITADO: "Rejeitado",
  // Depois de outro evento aceito sobre este (funcionalidade-754).
  RETIFICADO: "Retificado",
  EXCLUIDO: "Excluído",
  REABERTO: "Reaberto",
};
const TOM: Record<string, "atencao" | "marca" | "sucesso" | "perigo" | "neutro"> = {
  PENDENCIA: "atencao",
  PRONTO: "marca",
  ENVIADO: "neutro",
  ACEITO: "sucesso",
  REJEITADO: "perigo",
  RETIFICADO: "neutro",
  EXCLUIDO: "neutro",
  REABERTO: "neutro",
};
/** O que o evento faz com o alvo, para a fila dizer "retifica", "exclui" ou "reabre". */
const VERBO_DO_ALVO: Record<string, string> = { "S-3000": "exclui", "S-1298": "reabre", "S-1200": "retifica", "S-1210": "retifica" };

/**
 * eSocial do DP 2 (12/11/2026, fase 3a): os eventos da empresa em foco —
 * tabelas e periódicos — gerados do que o DP 2 já tem, com as pendências de
 * cadastro e o XML para conferir. A assinatura e o envio ainda não estão
 * ligados (decisão do Victor em 12/11/2026).
 */
export default async function EsocialDoDp2({ searchParams }: { searchParams: Promise<{ empresa?: string; tipo?: string }> }) {
  const params = await searchParams;
  const tela = await abrirTelaDeEmpresaDoDp2("dp2_esocial", params.empresa);
  const cabecalho = <PageHeader title="eSocial" />;
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
  const [eventos, fechadas, pessoas] = await Promise.all([
    prisma.dp2EventoEsocial.findMany({
      where: { tenantId: tela.tenantId, companyId: tela.empresa.id },
      orderBy: [{ createdAt: "desc" }],
      select: { id: true, tipo: true, referencia: true, situacao: true, pendencias: true, createdAt: true, personId: true, recibo: true, alvoId: true, person: { select: { name: true } } },
      take: 300,
    }),
    prisma.dp2Competencia.findMany({
      where: { tenantId: tela.tenantId, companyId: tela.empresa.id, tipo: { in: ["MENSAL", "DECIMO_2"] }, situacao: "FECHADA" },
      orderBy: [{ ano: "desc" }, { mes: "desc" }],
      select: { id: true, ano: true, mes: true, tipo: true },
      take: 12,
    }),
    colaboradoresDaEmpresa(tela.tenantId, tela.empresa.id),
  ]);
  const comContrato = pessoas.filter((p) => p.dp2Vinculo && !p.dismissalDate);
  // Reintegração (S-2298, funcionalidade-756): empregados desligados.
  const desligados = pessoas.filter((p) => p.dp2Vinculo && p.dismissalDate && !semVinculo(p.dp2Vinculo.categoria));
  const admissaoDe = new Map<string, string>();
  for (const e of eventos) if ((e.tipo === "S-2200" || e.tipo === "S-2300") && e.personId && !admissaoDe.has(e.personId)) admissaoDe.set(e.personId, e.situacao);
  // Sócio, autônomo e estagiário: início no S-2300 e término no S-2399 (o desligado também aparece no término).
  const semVinculoComContrato = pessoas.filter((p) => p.dp2Vinculo && semVinculo(p.dp2Vinculo.categoria));
  const filtro = params.tipo && params.tipo in NOME_DO_EVENTO ? params.tipo : null;
  const visiveis = filtro ? eventos.filter((e) => e.tipo === filtro) : eventos;
  const conta = (s: string) => eventos.filter((e) => e.situacao === s).length;
  // O evento que cada um retifica, exclui ou reabre, pelo tipo e a referência (funcionalidade-754).
  const alvoDe = new Map(eventos.map((e) => [e.id, `${e.tipo} · ${e.person?.name ?? e.referencia}`]));
  const prontosNoGrupo = (g: "1" | "2" | "3") => eventos.filter((e) => e.situacao === "PRONTO" && GRUPO_DO_EVENTO[e.tipo as TipoDeEvento] === g).length;

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
        {/* As linhas de apoio que listavam os eventos de cada bloco foram para o
            artigo do DP 2 (17/11/2026, melhoria-707). */}
        <Secao titulo="Tabelas">
          {tela.podeAgir && (
            <FormularioDoDp2 acao={gerarTabelasEsocialAction} rotulo="Gerar tabelas" rotuloEnviando="Gerando…" variante="secondary">
              <input type="hidden" name="companyId" value={tela.empresa.id} />
              <CampoForm label="Valem desde" htmlFor="iniValid" dica="O primeiro mês em que a empresa entra no eSocial pelo Connect.">
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

        <Secao titulo="Periódicos">
          {fechadas.length === 0 ? (
            <p className="text-fs-3 text-fg-muted">
              Nenhuma folha mensal ou 2ª parcela do 13º fechada.{" "}
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
                          {c.tipo === "DECIMO_2" ? `13º de ${c.ano} (anual)` : nomeDaCompetencia(c.ano, c.mes)}
                        </option>
                      ))}
                    </Select>
                  </CampoForm>
                  <CampoForm label="Data do pagamento" htmlFor="dtPgto" dica="Vai no S-1210.">
                    <CampoData id="dtPgto" name="dtPgto" required />
                  </CampoForm>
                </div>
              </FormularioDoDp2>
            )
          )}
          {prontosNoGrupo("2") > 0 && (
            <Button href={`/api/dp2/esocial/lote?empresa=${tela.empresa.id}&grupo=2`} variant="ghost" size="sm" download className="mt-3">
              Baixar lote de não periódicos para conferência
            </Button>
          )}
          {prontosNoGrupo("3") > 0 && (
            <Button href={`/api/dp2/esocial/lote?empresa=${tela.empresa.id}&grupo=3`} variant="ghost" size="sm" download className="mt-3">
              Baixar lote de periódicos para conferência
            </Button>
          )}
        </Secao>
      </div>

      <Secao titulo="Trabalhadores" className="mb-5">
        {comContrato.length === 0 ? (
          <p className="text-fs-3 text-fg-muted">
            Ninguém com contrato no DP 2.{" "}
            <Link href="/dp2/colaboradores" className="text-brand hover:underline">
              Criar contratos
            </Link>
          </p>
        ) : (
          <>
            <div className="overflow-x-auto mb-5">
              <table className="w-full min-w-[560px] text-fs-3">
                <thead>
                  <tr>
                    <th className={TH}>Colaborador</th>
                    <th className={TH}>Matrícula</th>
                    <th className={TH}>Início no eSocial</th>
                    <th className={TH} />
                  </tr>
                </thead>
                <tbody>
                  {comContrato.map((p) => {
                    const s = admissaoDe.get(p.id);
                    const inicio = semVinculo(p.dp2Vinculo?.categoria) ? "S-2300" : "S-2200";
                    return (
                      <tr key={p.id} className={TR}>
                        <td className={TD}>
                          <Link href={`/dp2/colaboradores?pessoa=${p.id}`} className="text-brand hover:underline">
                            {p.name}
                          </Link>
                        </td>
                        <td className={`${TD} tabular-nums`}>{p.dp2Vinculo?.matricula ?? <span className="text-warning-fg">sem matrícula</span>}</td>
                        <td className={TD}>{s ? <Selo tom={TOM[s] ?? "neutro"}>{NOME_DA_SITUACAO[s] ?? s}</Selo> : <span className="text-fg-muted">não gerada</span>}</td>
                        <td className={`${TD} text-right`}>
                          {tela.podeAgir && (
                            <FormularioDoDp2 acao={gerarAdmissaoAction} rotulo={s ? `Gerar ${inicio} de novo` : `Gerar ${inicio}`} rotuloEnviando="Gerando…" variante="ghost" tamanho="xs">
                              <input type="hidden" name="personId" value={p.id} />
                            </FormularioDoDp2>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {tela.podeAgir && (
              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <h3 className="text-fs-3 font-semibold text-fg mb-2">Alteração contratual (S-2206; S-2306 para sócio, autônomo e estagiário)</h3>
                  <FormularioDoDp2 acao={gerarAlteracaoAction} rotulo="Gerar alteração" rotuloEnviando="Gerando…" variante="secondary">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <CampoForm label="Colaborador" htmlFor="alt_personId">
                        <Select id="alt_personId" name="personId" required defaultValue="">
                          <option value="" disabled>
                            Escolha…
                          </option>
                          {comContrato.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </Select>
                      </CampoForm>
                      <CampoForm label="Vale a partir de" htmlFor="dataAlteracao">
                        <CampoData id="dataAlteracao" name="dataAlteracao" required />
                      </CampoForm>
                      <CampoForm label="O que mudou" htmlFor="descricao" className="sm:col-span-2">
                        <Input id="descricao" name="descricao" maxLength={150} placeholder="Reajuste da convenção coletiva" />
                      </CampoForm>
                    </div>
                  </FormularioDoDp2>
                </div>
                <div>
                  <h3 className="text-fs-3 font-semibold text-fg mb-2">Afastamento (S-2230)</h3>
                  <FormularioDoDp2 acao={gerarAfastamentoAction} rotulo="Gerar S-2230" rotuloEnviando="Gerando…" variante="secondary">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <CampoForm label="Colaborador" htmlFor="afa_personId">
                        <Select id="afa_personId" name="personId" required defaultValue="">
                          <option value="" disabled>
                            Escolha…
                          </option>
                          {comContrato.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </Select>
                      </CampoForm>
                      <CampoForm label="Motivo" htmlFor="motivo">
                        <Select id="motivo" name="motivo" defaultValue="03">
                          {MOTIVOS_DE_AFASTAMENTO.map(([k, r]) => (
                            <option key={k} value={k}>
                              {k} · {r}
                            </option>
                          ))}
                        </Select>
                      </CampoForm>
                      <CampoForm label="Início" htmlFor="inicio">
                        <CampoData id="inicio" name="inicio" required />
                      </CampoForm>
                      <CampoForm label="Fim" htmlFor="fim" dica="Sem fim, o afastamento fica em aberto; quando a pessoa voltar, gere de novo com o fim.">
                        <CampoData id="fim" name="fim" />
                      </CampoForm>
                      <CampoForm label="Outro motivo (código)" htmlFor="motivoOutro" dica="Tabela 18; substitui o motivo acima.">
                        <Input id="motivoOutro" name="motivoOutro" inputMode="numeric" maxLength={2} />
                      </CampoForm>
                      <CampoForm label="Observação" htmlFor="observacao">
                        <Input id="observacao" name="observacao" maxLength={255} />
                      </CampoForm>
                    </div>
                  </FormularioDoDp2>
                </div>
                {desligados.length > 0 && (
                  <div>
                    <h3 className="text-fs-3 font-semibold text-fg mb-2">Reintegração (S-2298)</h3>
                    <FormularioDoDp2 acao={gerarReintegracaoAction} rotulo="Gerar S-2298" rotuloEnviando="Gerando…" variante="secondary">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <CampoForm label="Colaborador desligado" htmlFor="rei_personId">
                          <Select id="rei_personId" name="personId" required defaultValue="">
                            <option value="" disabled>
                              Escolha…
                            </option>
                            {desligados.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </Select>
                        </CampoForm>
                        <CampoForm label="Tipo" htmlFor="tipoReintegracao">
                          <Select id="tipoReintegracao" name="tipoReintegracao" defaultValue="1">
                            {TIPOS_DE_REINTEGRACAO.map(([k, r]) => (
                              <option key={k} value={k}>
                                {k} · {r}
                              </option>
                            ))}
                          </Select>
                        </CampoForm>
                        <CampoForm label="Retorno ao trabalho" htmlFor="retorno">
                          <CampoData id="retorno" name="retorno" required />
                        </CampoForm>
                        <CampoForm label="Início dos efeitos financeiros" htmlFor="efeito" dica="Em branco, o próprio retorno.">
                          <CampoData id="efeito" name="efeito" />
                        </CampoForm>
                        <CampoForm label="Processo judicial" htmlFor="processo" dica="Na reintegração judicial: 20 algarismos.">
                          <Input id="processo" name="processo" inputMode="numeric" maxLength={25} />
                        </CampoForm>
                        <CampoForm label="Lei de anistia" htmlFor="leiAnistia" dica="Na anistia: número e ano (ex.: 8878/1994).">
                          <Input id="leiAnistia" name="leiAnistia" maxLength={13} />
                        </CampoForm>
                      </div>
                    </FormularioDoDp2>
                  </div>
                )}
              </div>
            )}
            {tela.podeAgir && semVinculoComContrato.length > 0 && (
              <div className="mt-5 lg:max-w-[50%]">
                <h3 className="text-fs-3 font-semibold text-fg mb-2">Término de sócio, autônomo ou estagiário (S-2399)</h3>
                <FormularioDoDp2 acao={gerarTerminoSemVinculoAction} rotulo="Gerar S-2399" rotuloEnviando="Gerando…" variante="secondary">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <CampoForm label="Trabalhador" htmlFor="ter_personId">
                      <Select id="ter_personId" name="personId" required defaultValue="">
                        <option value="" disabled>
                          Escolha…
                        </option>
                        {semVinculoComContrato.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    </CampoForm>
                    <CampoForm label="Data do término" htmlFor="termino" dica="Sem verbas rescisórias: o último pagamento sai na folha do mês.">
                      <CampoData id="termino" name="termino" required />
                    </CampoForm>
                  </div>
                </FormularioDoDp2>
              </div>
            )}
          </>
        )}
      </Secao>

      {comContrato.length > 0 && tela.podeAgir && (
        <Secao titulo="Saúde e segurança" className="mb-5">
          <FormulariosDeSst pessoas={comContrato.map((p) => ({ id: p.id, name: p.name }))} />
        </Secao>
      )}

      {(pendencias.size > 0 || avisos.size > 0) && (
        <Secao titulo="O que falta no cadastro" className="mb-5">
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
                  {tela.podeAgir && <th className={TH}>Recibo e exclusão</th>}
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
                        {e.recibo && <span className="block text-fs-2 text-fg-muted mt-1 tabular-nums">Recibo {e.recibo}</span>}
                        {e.alvoId && (
                          <span className="block text-fs-2 text-fg-muted mt-1">
                            {VERBO_DO_ALVO[e.tipo] ?? "aponta para"} {alvoDe.get(e.alvoId) ?? "um evento anterior"}
                          </span>
                        )}
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
                      {tela.podeAgir && (
                        <td className={TD}>
                          {(e.situacao === "PRONTO" || e.situacao === "ENVIADO") && (
                            <FormularioDoDp2 acao={registrarReciboEsocialAction} rotulo="Registrar recibo" rotuloEnviando="Registrando…" variante="ghost" tamanho="xs" className="flex flex-wrap items-center gap-2">
                              <input type="hidden" name="eventoId" value={e.id} />
                              <Input name="recibo" aria-label={`Recibo do ${e.tipo}`} placeholder="1.2.0000000000000000000" compact required className="w-52" />
                            </FormularioDoDp2>
                          )}
                          {e.situacao === "ACEITO" && podeExcluirPeloS3000(e.tipo) && (
                            <FormularioDoDp2
                              acao={excluirNoEsocialAction}
                              rotulo="Excluir no eSocial (S-3000)"
                              rotuloEnviando="Gerando…"
                              variante="ghost"
                              tamanho="xs"
                              confirmar={{
                                titulo: `Excluir este ${e.tipo} no eSocial?`,
                                texto: "Gera o S-3000 com o recibo deste evento, para assinar e enviar. Quando o S-3000 for aceito, este evento fica como excluído.",
                                rotulo: "Gerar o S-3000",
                              }}
                            >
                              <input type="hidden" name="eventoId" value={e.id} />
                            </FormularioDoDp2>
                          )}
                        </td>
                      )}
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
