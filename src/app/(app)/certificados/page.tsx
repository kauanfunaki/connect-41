import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, AlertTriangle, CalendarClock, CircleSlash, KeyRound, PenLine, Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { ImportarRelatorio } from "@/components/certificados/ImportarRelatorio";
import { EditarUsadoPor } from "@/components/certificados/EditarUsadoPor";
import { EditarRenovacao } from "@/components/certificados/EditarRenovacao";
import { acessoAosCertificados, equipeDosCertificados, listarCertificados, usosDosDocumentos } from "@/lib/certificados/servidor";
import { atuaisPorDocumento, ROTULO_DA_SITUACAO, situacaoDoCertificado, type SituacaoDoCertificado } from "@/lib/certificados/certificados";
import {
  DIAS_SEM_USO,
  noRecorte,
  ROTULO_DA_RENOVACAO,
  ROTULO_DE_QUEM_PAGA,
  rotuloDoUso,
  seVencerPara,
  statusDaRenovacao,
  totaisPorRisco,
  ultimoUso,
  usosQueContam,
  type PagaQuem,
  type Recorte,
  type StatusDaRenovacao,
  type UsoDoDocumento,
} from "@/lib/certificados/usos";
import { diasAte } from "@/lib/societario/licencas";
import { formatarReaisDeCentavos, formatCalendarDate, formatCnpj, formatCpf, formatInstantDate, formatInstantTime } from "@/lib/format";
import { nomeExibicao } from "@/lib/companyName";
import { Pagination } from "@/components/shared/Pagination";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";

export const dynamic = "force-dynamic";

/** Certificados por página (lote A de 03/11/2026: a lista inteira pesava na abertura). */
const POR_PAGINA = 50;
/** O recorte de quem abre a tela sem escolher: todos em uso (era "A renovar"). */
const PADRAO = "todos";

// Os recortes da lista. Os quatro primeiros são os cartões de totais pelo
// risco (opção A de 05/11/2026); os outros seguem no "Filtros".
const ABAS = [
  { chave: "30-dias", rotulo: "Vencem em 30 dias" },
  { chave: "param", rotulo: "Param algo se vencerem" },
  { chave: "sem-uso", rotulo: `Sem uso há ${DIAS_SEM_USO} dias` },
  { chave: "mes", rotulo: "Renovação deste mês" },
  { chave: "renovar", rotulo: "A renovar (60 dias)" },
  { chave: "todos", rotulo: "Todos em uso" },
  { chave: "sem-empresa", rotulo: "Sem empresa no Connect" },
  { chave: "substituidos", rotulo: "Substituídos" },
] as const;
const RECORTES_DE_RISCO: readonly string[] = ["30-dias", "param", "sem-uso", "mes"] satisfies Recorte[];

// Selo, e não Badge: é a situação da linha (regra de 02/10 no Selo.tsx;
// auditoria de 07/10/2026). O substituído saiu de cena: neutro.
const TOM: Record<SituacaoDoCertificado, TomDoSelo> = {
  vencido: "perigo",
  a_renovar: "atencao",
  vigente: "sucesso",
  substituido: "neutro",
};

const TOM_DA_RENOVACAO: Record<StatusDaRenovacao, TomDoSelo> = {
  A_PEDIR: "atencao",
  PEDIDO: "marca",
  COMPRADO: "sucesso",
  NAO_RENOVAR: "neutro",
};

/** "hoje, 08:10", "ontem, 18:00" ou a data. */
function quando(d: Date, agora: Date): string {
  const dias = -diasAte(d, agora);
  if (dias === 0) return `hoje, ${formatInstantTime(d)}`;
  if (dias === 1) return `ontem, ${formatInstantTime(d)}`;
  return formatInstantDate(d);
}

function prazo(dias: number): string {
  if (dias === 0) return "vence hoje";
  if (dias < 0) return `venceu há ${-dias} ${dias === -1 ? "dia" : "dias"}`;
  return `em ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

/**
 * Os certificados A1 dos clientes e do escritório: quando vence cada um, onde
 * é usado e o que para se vencer (opção A de 05/11/2026). Só metadado: o
 * arquivo fica na pasta de rede e a senha no cofre do KeePassXC.
 *
 * O uso chega sozinho do robô do Societário (a máquina informa o CNPJ do
 * certificado ao devolver a tarefa) e do Integra Contador (cada chamada ao
 * Serpro); o resto, quem coordena marca à mão no "Usado por".
 */
export default async function CertificadosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const acesso = await acessoAosCertificados();
  if (!acesso) notFound();
  const params = await searchParams;
  const aba = ABAS.find((a) => a.chave === params.aba)?.chave ?? PADRAO;
  const pagina = Math.max(1, Math.min(1000, Number.parseInt(params.pagina ?? "1", 10) || 1));
  const busca = (params.q ?? "").trim().toLowerCase();

  const hoje = new Date();
  const [certs, { porDocumento, registroDesde }, equipe] = await Promise.all([
    listarCertificados(acesso.tenantId),
    usosDosDocumentos(acesso.tenantId, hoje),
    equipeDosCertificados(acesso.tenantId, acesso.setores),
  ]);
  const nomeDe = new Map(equipe.map((u) => [u.id, u.name]));
  const atuais = atuaisPorDocumento(certs);
  const linhas = certs.map((c) => {
    const usos: UsoDoDocumento[] = porDocumento.get(c.documento) ?? [];
    const situacao = situacaoDoCertificado(c, atuais.get(c.documento), hoje);
    return {
      ...c,
      situacao,
      dias: diasAte(c.expiresAt, hoje),
      usos,
      usosAtivos: usosQueContam(usos, hoje),
      ultimo: ultimoUso(usos),
      vezes30: usos.reduce((s, u) => s + (u.vezes30 ?? 0), 0),
      impacto: seVencerPara(usos, hoje),
      renovacao: statusDaRenovacao(c.renovacaoStatus, situacao),
    };
  });
  const t = totaisPorRisco(linhas, hoje);

  const naAba = (c: (typeof linhas)[number]) => {
    if (aba === "substituidos") return c.situacao === "substituido";
    if (c.situacao === "substituido") return false;
    if (RECORTES_DE_RISCO.includes(aba)) return noRecorte(aba as Recorte, c, hoje);
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
        (c.company && nomeExibicao(c.company).toLowerCase().includes(busca)) ||
        (c.cofreEntrada ?? "").toLowerCase().includes(busca) ||
        (digitos.length >= 3 && c.documento.includes(digitos)))
  );
  const totalDePaginas = Math.max(1, Math.ceil(visiveis.length / POR_PAGINA));
  const paginaVista = Math.min(pagina, totalDePaginas);
  const daPagina = visiveis.slice((paginaVista - 1) * POR_PAGINA, paginaVista * POR_PAGINA);
  const hrefDaPagina = (p: number) => {
    const q = new URLSearchParams();
    if (aba !== PADRAO) q.set("aba", aba);
    if (params.q) q.set("q", params.q);
    if (p > 1) q.set("pagina", String(p));
    const s = q.toString();
    return s ? `/certificados?${s}` : "/certificados";
  };
  const ultimaImportacao = certs.reduce<Date | null>((m, c) => (!m || c.importedAt > m ? c.importedAt : m), null);
  const documento = (c: { tipo: string; documento: string }) => (c.tipo === "CPF" ? formatCpf(c.documento) : formatCnpj(c.documento));
  const href = (a: string) => `/certificados${a === PADRAO ? "" : `?aba=${a}`}`;
  // O "sem uso há 90 dias" só é justo com 90 dias de registro: antes disso,
  // quase tudo aparece sem uso só porque o registro acabou de começar.
  const diasDeRegistro = registroDesde ? -diasAte(registroDesde, hoje) : 0;
  const registroCurto = diasDeRegistro < DIAS_SEM_USO;
  const nome = (c: (typeof linhas)[number]) => (c.company ? nomeExibicao(c.company) : c.titular);

  // As peças de cada linha, iguais na tabela e no cartão do celular.
  const usadoPor = (c: (typeof linhas)[number]) => (
    <div className="flex flex-col items-start gap-1">
      {c.usosAtivos.length ? (
        <ul className="flex flex-wrap gap-1" aria-label="Usado por">
          {c.usosAtivos.map((u) => (
            <li key={u.uso}>
              <Selo tom={u.ultimoUsoAt ? "marca" : "neutro"} className="gap-1">
                {u.ultimoUsoAt ? <Activity size={11} aria-hidden /> : <PenLine size={11} aria-hidden />}
                {rotuloDoUso(u)}
                <span className="sr-only">{u.ultimoUsoAt ? " (registrado pelo Connect)" : " (marcado à mão)"}</span>
              </Selo>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-micro text-fg-muted">nenhum uso registrado</span>
      )}
      {acesso.podeDeclararUso && c.situacao !== "substituido" && (
        <EditarUsadoPor
          documento={c.documento}
          titular={nome(c)}
          declarados={c.usos.filter((u) => u.declarado).map((u) => ({ uso: u.uso, descricao: u.descricao }))}
          registrados={c.usos.filter((u) => u.ultimoUsoAt).map((u) => `${rotuloDoUso(u)}, último uso ${quando(u.ultimoUsoAt!, hoje)}`)}
        />
      )}
    </div>
  );
  const ultimoUsoTexto = (c: (typeof linhas)[number]) =>
    c.ultimo ? (
      <>
        <span className="tabular-nums">{quando(c.ultimo, hoje)}</span>
        {c.vezes30 > 0 && <span className="block text-micro text-fg-muted tabular-nums">{c.vezes30} {c.vezes30 === 1 ? "uso" : "usos"} em 30 dias</span>}
      </>
    ) : (
      <span className="text-fg-muted">—</span>
    );
  const seVencer = (c: (typeof linhas)[number]) => {
    if (c.situacao === "substituido") return <span className="text-fg-muted">— (o novo assume)</span>;
    if (!c.impacto) return <span className="text-fg-muted">—</span>;
    const perto = c.situacao === "vencido" || c.situacao === "a_renovar";
    return (
      <span className={`flex items-start gap-1.5 ${perto ? "text-danger" : "text-fg-secondary"}`}>
        {perto && <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" aria-hidden />}
        <span>
          {c.situacao === "vencido" && <span className="font-medium">Já parou: </span>}
          {c.impacto}
        </span>
      </span>
    );
  };
  const resumoDaRenovacao = (c: (typeof linhas)[number]) => {
    const resp = c.renovacaoResponsavelId ? nomeDe.get(c.renovacaoResponsavelId) : null;
    const custo = c.renovacaoCustoCentavos !== null ? formatarReaisDeCentavos(c.renovacaoCustoCentavos) : null;
    const paga = c.renovacaoPagaQuem ? ROTULO_DE_QUEM_PAGA[c.renovacaoPagaQuem as PagaQuem] : null;
    if (!c.renovacao && !resp && !custo && !paga) return <span className="text-fg-muted">—</span>;
    return (
      <>
        <span className="flex flex-wrap items-center gap-1">
          {c.renovacao && <Selo tom={TOM_DA_RENOVACAO[c.renovacao]}>{ROTULO_DA_RENOVACAO[c.renovacao]}</Selo>}
          {resp && <span className="text-ui text-fg-secondary">{resp}</span>}
        </span>
        {(custo || paga) && <span className="block text-micro text-fg-muted tabular-nums">{[custo, paga].filter(Boolean).join(" · ")}</span>}
      </>
    );
  };
  const renovacao = (c: (typeof linhas)[number]) =>
    acesso.podeImportar && c.situacao !== "substituido" ? (
      <EditarRenovacao
        id={c.id}
        titular={nome(c)}
        vencimento={formatCalendarDate(c.expiresAt)}
        status={c.renovacaoStatus}
        responsavelId={c.renovacaoResponsavelId}
        custoCentavos={c.renovacaoCustoCentavos}
        pagaQuem={c.renovacaoPagaQuem}
        equipe={equipe}
      >
        {resumoDaRenovacao(c)}
      </EditarRenovacao>
    ) : (
      <div>{resumoDaRenovacao(c)}</div>
    );

  return (
    <PageContainer>
      <PageHeader
        title="Certificados digitais"
        subtitle="Quando vence cada certificado A1, onde ele é usado e o que para se vencer. O arquivo e a senha não entram no Connect: ficam na pasta de rede e no cofre."
        action={acesso.podeImportar ? <ImportarRelatorio /> : undefined}
      />

      {/* Os totais pelo risco, e não só pela data (opção A de 05/11/2026): o
          que vence logo, o que para alguma coisa, o que talvez nem precise
          renovar e quanto a renovação do mês custa — a parte do Financeiro.
          Cada cartão abre o recorte; vermelho só no que para algo. */}
      <FaixaDeTotais
        className="mb-6"
        itens={[
          {
            rotulo: "Vencem em 30 dias",
            valor: String(t.vencem30),
            tom: t.vencem30 > 0 ? "text-warning-fg" : undefined,
            icone: <CalendarClock />,
            detalhe: t.vencidos ? `inclui ${t.vencidos} ${t.vencidos === 1 ? "vencido" : "vencidos"}` : "nenhum vencido",
            href: href("30-dias"),
            ativo: aba === "30-dias",
          },
          {
            rotulo: "Param algo se vencerem",
            valor: String(t.paramAlgo),
            tom: t.paramAlgo > 0 ? "text-danger" : undefined,
            icone: <AlertTriangle />,
            detalhe: `dos ${t.aRenovar} a renovar em 60 dias`,
            href: href("param"),
            ativo: aba === "param",
          },
          {
            rotulo: `Sem uso há ${DIAS_SEM_USO} dias`,
            valor: String(t.semUso),
            tom: "text-fg-muted",
            icone: <CircleSlash />,
            detalhe: registroCurto
              ? registroDesde
                ? `registro de uso desde ${formatCalendarDate(registroDesde)}`
                : "o registro de uso começa agora"
              : "candidatos a não renovar",
            href: href("sem-uso"),
            ativo: aba === "sem-uso",
          },
          {
            rotulo: "Renovação deste mês",
            valor: formatarReaisDeCentavos(t.custoDoMesCentavos),
            icone: <Wallet />,
            detalhe:
              t.doMes === 0
                ? "nenhum vence neste mês"
                : `${t.doMes} ${t.doMes === 1 ? "certificado" : "certificados"}${t.doMesSemCusto ? ` · ${t.doMesSemCusto} sem custo` : ""}`,
            href: href("mes"),
            ativo: aba === "mes",
          },
        ]}
      />

      <CascoDaTabela
        contagem={contarItens(visiveis.length, "certificado", "certificados")}
        busca={
          <form method="get" action="/certificados" className="max-w-full">
            {aba !== PADRAO && <input type="hidden" name="aba" value={aba} />}
            <CampoDeBusca
              compact
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Buscar por titular, documento ou entrada do cofre…"
              aria-label="Buscar certificado"
              className="w-80 max-w-full"
            />
          </form>
        }
        filtros={
          <FiltrosDaTela
            naBarra
            campos={[
              {
                chave: "aba",
                rotulo: "Situação",
                vazioLabel: "Todos em uso",
                opcoes: ABAS.filter((a) => a.chave !== PADRAO).map((a) => ({ value: a.chave, label: a.rotulo })),
              },
            ]}
          />
        }
      >
        {visiveis.length === 0 ? (
          <EmptyState
            title={
              certs.length === 0
                ? "Nenhum certificado importado"
                : busca
                  ? "Nada encontrado"
                  : aba === "param"
                    ? "Nada para de funcionar se um certificado a renovar vencer"
                    : "Nenhum certificado nesta situação"
            }
            description={
              certs.length === 0
                ? acesso.podeImportar
                  ? "Clique em “Importar relatório” e escolha o arquivo .csv da conferência dos certificados."
                  : "Os certificados aparecem aqui quando o setor importar o relatório da conferência."
                : undefined
            }
            icon={<KeyRound />}
          />
        ) : (
          <>
            <CartoesNoCelular>
              {daPagina.map((c) => (
                <Cartao key={c.id}>
                  <TopoDoCartao nome={nome(c)} valor={formatCalendarDate(c.expiresAt)} />
                  <InfoDoCartao className="tabular-nums">
                    {c.tipo === "CPF" ? "e-CPF" : "e-CNPJ"} · {documento(c)} · {c.situacao === "substituido" ? "substituído" : prazo(c.dias)}
                  </InfoDoCartao>
                  <div className="mt-2 flex flex-col gap-2 text-ui">
                    {usadoPor(c)}
                    <div>
                      <span className="text-micro text-fg-muted">Se vencer, para: </span>
                      {seVencer(c)}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-micro text-fg-muted">Último uso:</span> {ultimoUsoTexto(c)}
                    </div>
                    {renovacao(c)}
                  </div>
                  <PeDoCartao>
                    <Selo tom={TOM[c.situacao]}>{ROTULO_DA_SITUACAO[c.situacao]}</Selo>
                    <span className="text-micro text-fg-muted">cofre: {c.cofreEntrada ?? "—"}</span>
                  </PeDoCartao>
                </Cartao>
              ))}
            </CartoesNoCelular>

            <TabelaFiltravel
              linhas={daPagina.map((c) => ({
                id: c.id,
                valores: {
                  titular: nome(c),
                  tipo: c.tipo === "CPF" ? "e-CPF" : "e-CNPJ",
                  vencimento: c.expiresAt.toISOString().slice(0, 10),
                  situacao: ROTULO_DA_SITUACAO[c.situacao],
                  usos: c.usosAtivos.map((u) => rotuloDoUso(u)).join(", "),
                  renovacao: c.renovacao ? ROTULO_DA_RENOVACAO[c.renovacao] : "",
                },
              }))}
            >
              <TabelaNoDesktop padrao>
                <table className="w-full min-w-[1120px]">
                  <thead>
                    <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border">
                      <th className="py-2 pr-3 font-medium">
                        <FiltroDaColuna rotulo="Titular" campos={[{ chave: "titular", rotulo: "Titular" }, { chave: "tipo", rotulo: "Tipo" }]} />
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        <FiltroDaColuna rotulo="Vence" campos={[{ chave: "vencimento", rotulo: "Vencimento", tipo: "data" }, { chave: "situacao", rotulo: "Situação" }]} />
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        <FiltroDaColuna rotulo="Usado por" chave="usos" />
                      </th>
                      <th className="py-2 pr-3 font-medium">Último uso</th>
                      <th className="py-2 pr-3 font-medium">Se vencer, para…</th>
                      <th className="py-2 font-medium">
                        <FiltroDaColuna rotulo="Renovação" chave="renovacao" align="right" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {daPagina.map((c) => (
                      <LinhaFiltravel key={c.id} id={c.id} className="border-b border-border-soft align-top hover:bg-surface-hover transition-colors">
                        <td className="py-2.5 pr-3 w-[22%]">
                          {c.company ? (
                            <Link href={`/empresas/${c.company.id}`} className="font-semibold text-fg hover:text-brand transition-colors">
                              {nomeExibicao(c.company)}
                            </Link>
                          ) : (
                            <span className="font-semibold">{c.titular}</span>
                          )}
                          <span className="block text-micro text-fg-muted tabular-nums">
                            {c.tipo === "CPF" ? "e-CPF" : "e-CNPJ"} · {documento(c)}
                          </span>
                          <span className="block text-micro text-fg-muted">
                            cofre: {c.cofreEntrada ?? "—"}
                            {!c.company && " · sem empresa no Connect"}
                          </span>
                          {c.conferir && <span className="block text-micro text-warning-fg">{c.conferir}</span>}
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap">
                          <span className="tabular-nums">{formatCalendarDate(c.expiresAt)}</span>
                          <span className="mt-1 flex items-center gap-1.5">
                            <Selo tom={TOM[c.situacao]}>{ROTULO_DA_SITUACAO[c.situacao]}</Selo>
                            {c.situacao !== "substituido" && <span className="text-micro text-fg-muted tabular-nums">{prazo(c.dias)}</span>}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 w-[20%]">{usadoPor(c)}</td>
                        <td className="py-2.5 pr-3 whitespace-nowrap">{ultimoUsoTexto(c)}</td>
                        <td className="py-2.5 pr-3 w-[22%] text-ui">{seVencer(c)}</td>
                        <td className="py-2.5">{renovacao(c)}</td>
                      </LinhaFiltravel>
                    ))}
                  </tbody>
                </table>
              </TabelaNoDesktop>
            </TabelaFiltravel>
            <Pagination page={paginaVista} totalPages={totalDePaginas} buildHref={hrefDaPagina} total={visiveis.length} rotulo="certificados" />
            <p className="text-micro text-fg-muted mt-3 max-w-[90ch]">
              <Activity size={11} className="inline align-[-1px]" aria-hidden /> uso registrado pelo Connect (robô do Societário e
              Integra Contador); <PenLine size={11} className="inline align-[-1px]" aria-hidden /> uso marcado à mão por quem coordena.
              Um uso registrado sai da lista depois de {DIAS_SEM_USO} dias parado. O uso é do CNPJ/CPF: o certificado renovado
              herda. Quando o mesmo documento tem um certificado mais novo, o antigo vira &ldquo;substituído&rdquo; e para de avisar.
              Avisos saem para o setor a 60, 30, 15 e 7 dias e no vencimento, dizendo o que para.
              {ultimaImportacao && <> Última importação: {formatInstantDate(ultimaImportacao)}.</>}
            </p>
          </>
        )}
      </CascoDaTabela>
    </PageContainer>
  );
}
