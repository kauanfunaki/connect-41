import { AlertTriangle, FileWarning, Inbox, ShieldAlert } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { Selo } from "@/components/ui/Selo";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { FiltrosDaTela, type CampoDeFiltro } from "@/components/shared/FiltrosDaTela";
import { BlocoFiscal, MetricasFiscais, TabelaFiscal } from "@/components/fiscal/previa/Compartilhados";
import type { TelaDoMotor } from "@/lib/fiscal/motor/tela";
import { hrefComParams, hrefDoMotor } from "@/lib/fiscal/motor/url";
import { contagemDoMotor, data, dataHora, percentualDoMotor, reaisDoMotor } from "@/lib/fiscal/motor/formato";
import { formatarReais } from "@/lib/format";
import { tomDoSemaforo } from "@/lib/fiscal/previa/doMotor";
import { carregarAcervo, carregarCobertura, carregarImportacoes } from "@/lib/fiscal/motor/telas/documentos";
import type { Params } from "@/lib/fiscal/motor/telas/comum";
import type { CoberturaDoMotor, ImportacaoDoMotor } from "@/lib/sped/telasDoMotor";
import { ErroDaLeitura, EscolhaUmEstabelecimento, PaginacaoDoMotor } from "./LeituraDoMotor";
import { escritaNaTela } from "@/lib/fiscal/motor/permissoes";
import { ApurarCobertura, EnviarDocumentos, ReprocessarQuarentena, ResolverRejeitado } from "./EscritasDocumentos";

const CAMINHO = "/fiscal/documentos";

const FILTROS_DO_ACERVO: CampoDeFiltro[] = [
  { chave: "tipo", rotulo: "Tipo", opcoes: [{ value: "NFE", label: "NF-e" }, { value: "NFCE", label: "NFC-e" }, { value: "NFSE", label: "NFS-e" }, { value: "CTE", label: "CT-e" }] },
  { chave: "sentido", rotulo: "Sentido", opcoes: [{ value: "entrada", label: "Entrada" }, { value: "saida", label: "Saída" }] },
];

/**
 * Aba Acervo no modo motor (§11.1): a projeção `FiscalDocument` que a
 * sincronização com o índice do SPED já mantém — a mesma fonte de
 * /documentos-fiscais, nunca uma segunda listagem. O detalhe e o PDF abrem lá.
 * `cfop`, `ncm`, `cst`, destino, crédito e situação de classificação não têm
 * fonte por documento: as colunas não existem aqui.
 */
export async function AcervoMotor({ tela, params }: { tela: TelaDoMotor; params: Params }) {
  const { contexto, estabelecimento } = tela;
  if (!contexto) return null;
  if (!estabelecimento) return <EscolhaUmEstabelecimento porQue="O acervo mostra os documentos de um estabelecimento por vez, na competência escolhida." />;
  const acervo = await carregarAcervo(tela, params);
  const abreNoAcervo = tela.modulos.includes("fiscal_documentos");
  const hrefAcervo = `/documentos-fiscais?empresa=${encodeURIComponent(estabelecimento.companyId)}&competencia=${contexto.competencia}`;
  if (acervo.erro !== null) return <ErroDaLeitura falha={acervo} hrefDeNovo={hrefComParams(CAMINHO, params)} />;
  const a = acervo.dados;
  return <div className="space-y-4">
    <Aviso tom="neutro">Documentos que a sincronização com o SPED já trouxe para o Connect. Os rejeitados na importação não entram no acervo: ficam na quarentena, na aba Importações. CT-e continua na consulta ao vivo.</Aviso>
    <CascoDaTabela contagem={contarItens(a.total, "documento", "documentos", a.totalLimitado)} filtros={<FiltrosDaTela naBarra campos={FILTROS_DO_ACERVO} />} acoes={abreNoAcervo && <Button variant="secondary" href={hrefAcervo}>Abrir no acervo</Button>}>
      <TabelaFiscal vazio="Nenhum documento neste filtro." descricaoVazio={`Competência ${contexto.competencia} · ${estabelecimento.companyNome}.`} colunas={["Número", "Tipo", "Sentido", "Participante", "Emissão", "Valor", "XML", ...(abreNoAcervo ? ["Ações"] : [])]} linhas={a.linhas.map((d) => ({ id: d.id, celulas: [
        d.numero,
        d.tipo,
        d.sentido ?? <Selo key="s" tom="neutro">Sentido indefinido</Selo>,
        <span key="p" className="block max-w-64 break-words">{d.participante}</span>,
        data(d.emitidoEm.toISOString()),
        <span key="v" className="tabular-nums">{d.valor === null ? "—" : formatarReais(d.valor)}</span>,
        d.xml ? "Sim" : "Não",
        ...(abreNoAcervo ? [<Button key="a" size="xs" variant="secondary" href={`/documentos-fiscais/${d.id}`}>Abrir</Button>] : []),
      ] }))} />
    </CascoDaTabela>
    {(a.pagina > 1 || a.temProxima) && <div className="flex flex-wrap gap-3">
      {a.pagina > 1 && <Button size="sm" variant="secondary" href={hrefComParams(CAMINHO, params, { pagina: a.pagina - 1 === 1 ? null : a.pagina - 1 })} scroll={false}>Página anterior</Button>}
      {a.temProxima && <Button size="sm" variant="secondary" href={hrefComParams(CAMINHO, params, { pagina: a.pagina + 1 })} scroll={false}>Próxima página</Button>}
    </div>}
  </div>;
}

const ESTADO_DA_IMPORTACAO: Record<string, string> = { concluida: "Concluída", executando: "Executando", em_andamento: "Executando", erro: "Erro", cancelada: "Cancelada" };

function DetalheDaImportacao({ i, competencia }: { i: ImportacaoDoMotor; competencia: string }) {
  const fatos: [string, string][] = [
    ["Origem", `${i.origem || "—"}${i.host ? ` · ${i.host}` : ""}`], ["Estado", ESTADO_DA_IMPORTACAO[i.estado] ?? i.estado], ["Simulação", i.dry_run ? "Sim (nada gravado)" : "Não"],
    ["Iniciada", dataHora(i.iniciado_em)], ["Concluída", dataHora(i.concluido_em)], ["Lidos", contagemDoMotor(i.lidos)],
    ["NF-e gravadas", contagemDoMotor(i.gravados_nfe)], ["CT-e gravados", contagemDoMotor(i.gravados_cte)], ["Já existentes", contagemDoMotor(i.ja_existentes)],
    ["Cancelados pulados", contagemDoMotor(i.cancelados_pulados)], ["Ignorados (outro CNPJ)", contagemDoMotor(i.ignorados_cnpj)], ["Rejeitados", contagemDoMotor(i.rejeitados)],
  ];
  return <BlocoFiscal titulo={`Importação #${i.id}`} descricao={i.filtro_dentro ? `Filtro: ${i.filtro_dentro}` : undefined}>
    <div className="space-y-4">
      {i.erro_fatal && <Aviso tom="perigo">{i.erro_fatal}</Aviso>}
      <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">{fatos.map(([r, v]) => <div key={r}><dt className="text-helper text-fg-secondary">{r}</dt><dd className="mt-1 text-ui text-fg">{v}</dd></div>)}</dl>
      <div className="grid gap-4 lg:grid-cols-2">
        <TabelaFiscal vazio="Sem contagem por competência." descricaoVazio="" colunas={["Competência", "Documentos"]} linhas={Object.entries(i.por_competencia).sort().reverse().map(([c, n]) => ({ id: c, celulas: [c === competencia ? <strong key="c">{c}</strong> : c, contagemDoMotor(n)] }))} />
        <TabelaFiscal vazio="Sem contagem por CNPJ." descricaoVazio="" colunas={["CNPJ da raiz", "Documentos"]} linhas={[...Object.entries(i.por_cnpj).map(([c, n]) => ({ id: c, celulas: [c, contagemDoMotor(n)] })), ...(i.outros_cnpj ? [{ id: "outros", celulas: ["Outros CNPJ", contagemDoMotor(i.outros_cnpj)] }] : [])]} />
      </div>
    </div>
  </BlocoFiscal>;
}

/** Aba Importações: a lista do motor, o detalhe e a quarentena (sem XML na lista; o XML abre à parte). */
export async function ImportacoesMotor({ tela, params }: { tela: TelaDoMotor; params: Params }) {
  const { contexto } = tela;
  if (!contexto) return null;
  const [d, escrita] = await Promise.all([carregarImportacoes(tela, params), escritaNaTela(tela.ctx, tela.motor, "fiscal_acervo")]);
  if (!d) return null;
  const aqui = (m: Record<string, string | number | null> = {}) => hrefComParams(CAMINHO, params, m);
  const xml = (id: number, baixar = false) => `/api/fiscal/sped/quarentena/${id}/xml?raiz=${contexto.raiz}${baixar ? "&baixar=1" : ""}`;
  const classes = d.resumo.dados?.por_classe ?? [];
  const hrefFila = tela.modulos.includes("fiscal_operacao") ? hrefDoMotor("/fiscal/operacao", contexto, { aba: "executar" }) : null;
  const filtrosDaQuarentena: CampoDeFiltro[] = [
    { chave: "classe", rotulo: "Classe", vazioLabel: "Pede decisão (desconhecido)", opcoes: [{ value: "todas", label: "Todas as classes" }, ...classes.filter((c) => c.classe !== "desconhecido").map((c) => ({ value: c.classe, label: `${c.classe} (${contagemDoMotor(c.total)})` }))] },
    { chave: "pendentes", rotulo: "Situação", vazioLabel: "Só pendentes", opcoes: [{ value: "0", label: "Pendentes e resolvidos" }] },
  ];
  return <div className="space-y-5">
    {d.resumo.erro !== null ? <ErroDaLeitura falha={d.resumo} hrefDeNovo={aqui()} /> : <MetricasFiscais itens={[
      { rotulo: "Quarentena a decidir", valor: d.resumo.dados.pendente_desconhecido, icone: <ShieldAlert />, tom: d.resumo.dados.pendente_desconhecido > 0 ? "text-warning-fg" : undefined, detalhe: "classe desconhecido" },
      { rotulo: "Rejeitados por classe", valor: d.resumo.dados.por_classe.reduce((s, c) => s + c.total, 0), icone: <FileWarning />, detalhe: `${d.resumo.dados.por_classe.length} classe(s)` },
    ]} />}

    {escrita.visivel && <BlocoFiscal titulo="Enviar documentos" descricao="XML de NF-e, CT-e e NFS-e, PDF e imagem de documento de apoio, CSV do relatório de NFS-e e .zip com qualquer desses. Até 25 MB vai num envio só; acima disso, até 500 MB, o Connect manda em partes de 8 MB, com progresso, e retoma de onde parou se a conexão cair. Duplicatas são descartadas pelo motor.">
      <EnviarDocumentos raiz={contexto.raiz} permissao={escrita} />
    </BlocoFiscal>}

    {d.detalhe && (d.detalhe.erro !== null ? <ErroDaLeitura falha={d.detalhe} hrefDeNovo={aqui()} /> : <DetalheDaImportacao i={d.detalhe.dados} competencia={contexto.competencia} />)}

    <BlocoFiscal titulo="Importações" descricao={d.todas ? "Todas as importações da raiz, das mais recentes." : `Importações com documentos da competência ${contexto.competencia}.`} acao={<Button size="sm" variant="secondary" href={aqui({ todas: d.todas ? null : "1", c_imp: null })} scroll={false}>{d.todas ? `Só da competência ${contexto.competencia}` : "Mostrar todas"}</Button>}>
      <div className="space-y-3">
        {d.lista.erro !== null ? <ErroDaLeitura falha={d.lista} hrefDeNovo={aqui()} /> : <>
          <TabelaFiscal vazio="Nenhuma importação nesta página." descricaoVazio={d.lista.dados.foraDaCompetencia > 0 ? `${d.lista.dados.foraDaCompetencia} importação(ões) desta página não tocaram a competência. Use "Mostrar todas" ou a próxima página.` : "O motor não registrou importações."} colunas={["Importação", "Estado", "Iniciada", "Lidos", "Aceitos", "Rejeitados", `Em ${contexto.competencia}`, "Ações"]} linhas={d.lista.dados.itens.map((i) => ({ id: String(i.id), celulas: [
            <span key="o">#{i.id}<span className="block text-helper text-fg-muted">{i.origem}{i.host ? ` · ${i.host}` : ""}{i.dry_run ? " · simulação" : ""}</span></span>,
            <Selo key="e" tom={i.erro_fatal || i.estado === "erro" ? "perigo" : i.estado === "concluida" ? "sucesso" : "neutro"}>{ESTADO_DA_IMPORTACAO[i.estado] ?? i.estado}</Selo>,
            dataHora(i.iniciado_em),
            contagemDoMotor(i.lidos),
            contagemDoMotor(i.gravados_cte + i.gravados_nfe),
            contagemDoMotor(i.rejeitados),
            contagemDoMotor(i.por_competencia[contexto.competencia] ?? null),
            <Button key="a" size="xs" variant="secondary" href={aqui({ importacao: i.id, c_quar: null })} scroll={false}>Ver detalhes</Button>,
          ] }))} />
          <PaginacaoDoMotor temCursor={!!d.cursorImportacoes} proximo={d.lista.dados.proximo_cursor} hrefInicio={aqui({ c_imp: null })} hrefProxima={(c) => aqui({ c_imp: c })} />
        </>}
      </div>
    </BlocoFiscal>

    <BlocoFiscal titulo="Quarentena" descricao={`${d.detalhe?.dados ? `Rejeitados da importação #${d.detalhe.dados.id}` : "Rejeitados de todas as importações"}. Resolver não apaga: o XML continua guardado no motor.`} acao={d.detalhe ? <Button size="sm" variant="ghost" href={aqui({ importacao: null, c_quar: null })} scroll={false}>Ver todas as importações</Button> : undefined}>
      <div className="space-y-3">
        {escrita.visivel && <div className="space-y-1">
          <p className="text-helper text-fg-secondary">Reprocessar relê os rejeitados com os leitores de hoje e baixa os que passaram a ser legíveis (o XML continua guardado). Vira um pedido na fila do motor; as competências com documento recuperado precisam ser regeradas.</p>
          <ReprocessarQuarentena raiz={contexto.raiz} classes={classes.map((c) => c.classe)} permissao={escrita} hrefFila={hrefFila} />
        </div>}
        {d.resumo.dados && d.resumo.dados.por_motivo.length > 0 && <BlocoRecolhivel titulo="Motivos dos que pedem decisão" abertoInicial={false}>
          <div><TabelaFiscal colunas={["Motivo", "Rejeitados"]} linhas={d.resumo.dados.por_motivo.map((m, i) => ({ id: `${i}`, celulas: [m.motivo || "—", contagemDoMotor(m.total)] }))} /></div>
        </BlocoRecolhivel>}
        {d.quarentena.erro !== null ? <ErroDaLeitura falha={d.quarentena} hrefDeNovo={aqui()} /> : <>
          <CascoDaTabela contagem={`${d.quarentena.dados.itens.length} rejeitado(s) nesta página`} filtros={<FiltrosDaTela naBarra campos={filtrosDaQuarentena} />}>
            <TabelaFiscal vazio="Nenhum rejeitado neste filtro." descricaoVazio="Troque a classe ou inclua os resolvidos." colunas={["Arquivo", "Importação", "Classe", "Motivo", "Chave", "Situação", "Recebido", "XML", ...(escrita.visivel ? ["Ação"] : [])]} linhas={d.quarentena.dados.itens.map((r) => ({ id: String(r.id), celulas: [
              <span key="a" className="block max-w-56 break-all text-helper">{r.arquivo || `#${r.id}`}</span>,
              r.importacao_id ? `#${r.importacao_id}` : "—",
              r.classe || "—",
              <span key="m" className="block max-w-56 break-words">{r.motivo || "—"}</span>,
              r.chave ? <span key="c" className="block max-w-40 break-all text-helper">{r.chave}</span> : "—",
              r.resolvido ? <span key="r"><Selo tom="sucesso">Resolvido</Selo><span className="block text-helper text-fg-muted">{r.resolvido_por ?? ""} {dataHora(r.resolvido_em)}</span></span> : <Selo key="r" tom="atencao">Pendente</Selo>,
              dataHora(r.criado_em),
              <span key="x" className="flex flex-wrap justify-center gap-2"><Button size="xs" variant="secondary" href={xml(r.id)} nativo target="_blank" rel="noopener">Ver</Button><Button size="xs" variant="ghost" href={xml(r.id, true)} download>Baixar</Button></span>,
              ...(escrita.visivel ? [<ResolverRejeitado key="r" raiz={contexto.raiz} id={r.id} resolvido={r.resolvido} permissao={escrita} />] : []),
            ] }))} />
            {escrita.visivel && escrita.motivo && <p className="px-5 py-2 text-helper text-fg-muted">{escrita.motivo}</p>}
          </CascoDaTabela>
          <PaginacaoDoMotor temCursor={!!d.cursorQuarentena} proximo={d.quarentena.dados.proximo_cursor} hrefInicio={aqui({ c_quar: null })} hrefProxima={(c) => aqui({ c_quar: c })} />
        </>}
      </div>
    </BlocoFiscal>
  </div>;
}

const ESTADO_DA_COBERTURA: Record<CoberturaDoMotor["estado"], string> = { apurando: "Apurando", ok: "Apurada", erro: "Erro na apuração" };
const COR_DO_MOTIVO: Record<string, "perigo" | "atencao" | "neutro"> = { vermelho: "perigo", amarelo: "atencao", cinza: "neutro" };

function contadores(c: Record<string, number>) {
  return Object.entries(c).map(([k, v]) => `${k}: ${contagemDoMotor(v)}`).join(" · ") || "—";
}

/** Aba Cobertura: o registro e a avaliação do motor (os textos vêm prontos), as apurações, os erros de extração e a NFS-e. */
export async function CoberturaMotor({ tela, params }: { tela: TelaDoMotor; params: Params }) {
  const { contexto, estabelecimento } = tela;
  if (!contexto) return null;
  const [d, escrita] = await Promise.all([carregarCobertura(tela), escritaNaTela(tela.ctx, tela.motor, "fiscal_acervo")]);
  if (!d) return null;
  const aqui = hrefComParams(CAMINHO, params);
  const hrefFila = tela.modulos.includes("fiscal_operacao") ? hrefDoMotor("/fiscal/operacao", contexto, { aba: "executar" }) : null;
  const apurar = estabelecimento && escrita.visivel ? <ApurarCobertura raiz={contexto.raiz} estabelecimentoId={estabelecimento.id} competencia={contexto.competencia} permissao={escrita} hrefFila={hrefFila} /> : null;
  const porId = new Map(tela.mapa.visiveis.map((e) => [e.id, e]));
  const nfseDaCompetencia = (d.nfse.dados?.itens ?? []).filter((n) => n.competencia === contexto.competencia);
  return <div className="space-y-5">
    {!estabelecimento ? <Aviso tom="neutro">Escolha um estabelecimento para ver a avaliação da cobertura de {contexto.competencia}. A lista abaixo mostra as apurações de todos.</Aviso>
      : d.cobertura?.erro !== null && d.cobertura ? <ErroDaLeitura falha={d.cobertura} hrefDeNovo={aqui} />
        : d.cobertura?.dados && <BlocoFiscal titulo={`Cobertura de ${contexto.competencia}`} descricao={estabelecimento.companyNome} acao={d.cobertura.dados.avaliacao ? <Selo tom={tomDoSemaforo(d.cobertura.dados.avaliacao.semaforo)}>{d.cobertura.dados.avaliacao.semaforo === "neutro" ? "Sem avaliação" : d.cobertura.dados.avaliacao.semaforo === "verde" ? "Coberta" : d.cobertura.dados.avaliacao.semaforo === "amarelo" ? "Conferir" : "Incompleta"}</Selo> : undefined}>
          {!d.cobertura.dados.registro ? <div className="space-y-3"><Aviso tom="neutro">Competência ainda não apurada.{apurar ? " A apuração vai para a fila do motor e leva alguns minutos." : " Apure no painel do motor."}</Aviso>{apurar}</div> : (() => {
            const r = d.cobertura.dados.registro;
            const ant = d.cobertura.dados.anterior;
            return <div className="space-y-4">
              {r.abandonada && <Aviso tom="atencao">A apuração está “apurando” há mais de 15 minutos e foi dada como abandonada. {apurar ? "Apure de novo." : "Apure de novo no painel do motor."}</Aviso>}
              {apurar && (r.estado !== "apurando" || r.abandonada) ? apurar : r.estado === "apurando" && !r.abandonada ? <p className="text-helper text-fg-muted">Apurando agora; acompanhe na fila do motor.</p> : null}
              {r.mensagem && <Aviso tom={r.estado === "erro" ? "perigo" : "neutro"}>{r.mensagem}</Aviso>}
              {(d.cobertura.dados.avaliacao?.motivos ?? []).length > 0 && <ul className="space-y-2">{d.cobertura.dados.avaliacao!.motivos.map((m, i) => <li key={i} className="flex items-start gap-2 text-ui text-fg"><Selo tom={COR_DO_MOTIVO[m.cor] ?? "neutro"}>{m.cor}</Selo><span>{m.texto}</span></li>)}</ul>}
              <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">{([
                ["Estado", ESTADO_DA_COBERTURA[r.estado]], ["Apurada em", dataHora(r.apurado_em)], ["Duração", r.duracao_seg != null ? `${r.duracao_seg} s` : "—"],
                ["CT-e", `${contagemDoMotor(r.cte_total)}${ant ? ` (anterior ${contagemDoMotor(ant.cte_total)})` : ""}`],
                ["NF-e", `${contagemDoMotor(r.nfe_total)}${ant ? ` (anterior ${contagemDoMotor(ant.nfe_total)})` : ""}`],
                ["Variação de CT-e", percentualDoMotor(d.cobertura.dados.avaliacao?.variacao_cte ?? null)],
              ] as [string, string][]).map(([k, v]) => <div key={k}><dt className="text-helper text-fg-secondary">{k}</dt><dd className="mt-1 text-ui text-fg">{v}</dd></div>)}</dl>
              <dl className="grid gap-4 sm:grid-cols-3">
                <div><dt className="text-helper text-fg-secondary">CT-e por série</dt><dd className="mt-1 text-ui text-fg">{contadores(r.cte_por_serie)}</dd></div>
                <div><dt className="text-helper text-fg-secondary">NF-e por fonte</dt><dd className="mt-1 text-ui text-fg">{contadores(r.nfe_por_fonte)}</dd></div>
                <div><dt className="text-helper text-fg-secondary">Dias sem nenhum documento</dt><dd className="mt-1 text-ui text-fg">{r.dias_sem_nada.length ? r.dias_sem_nada.map((x) => data(x)).join(", ") : "Nenhum"}</dd></div>
              </dl>
            </div>;
          })()}
        </BlocoFiscal>}

    <BlocoFiscal titulo="Apurações de cobertura" descricao={estabelecimento ? `As últimas de ${estabelecimento.companyNome}.` : "As últimas de todos os estabelecimentos que você vê."}>
      {d.lista.erro !== null ? <ErroDaLeitura falha={d.lista} hrefDeNovo={aqui} /> : <TabelaFiscal vazio="Nenhuma apuração de cobertura." descricaoVazio={escrita.visivel ? "Escolha um estabelecimento e use “Apurar cobertura”." : "Apure no painel do motor."} colunas={["Competência", "Estabelecimento", "Avaliação", "CT-e", "NF-e", "Apurada em"]} linhas={d.lista.dados.map((c) => ({ id: `${c.empresa_id}-${c.competencia}`, celulas: [
        c.competencia, porId.get(c.empresa_id)?.companyNome ?? c.cnpj_empresa,
        <Selo key="s" tom={tomDoSemaforo(c.avaliacao?.semaforo)}>{c.abandonada ? "Abandonada" : ESTADO_DA_COBERTURA[c.estado]}</Selo>,
        contagemDoMotor(c.cte_total), contagemDoMotor(c.nfe_total), dataHora(c.apurado_em),
      ] }))} />}
    </BlocoFiscal>

    <BlocoFiscal titulo="Erros de extração pendentes" descricao={`CT-e com rota de ${contexto.competencia} que não foram extraídos. Para tentar de novo, peça a execução "erros" em Executar.`} acao={tela.modulos.includes("fiscal_operacao") ? <Button size="sm" variant="secondary" href={`/fiscal/operacao?aba=executar&raiz=${contexto.raiz}&competencia=${contexto.competencia}`}>Executar</Button> : undefined}>
      {d.erros.erro !== null ? <ErroDaLeitura falha={d.erros} hrefDeNovo={aqui} /> : <div className="space-y-3">
        <MetricasFiscais itens={[
          { rotulo: "Pendências", valor: d.erros.dados.total, icone: <AlertTriangle />, tom: d.erros.dados.total > 0 ? "text-warning-fg" : undefined },
          { rotulo: "Rotas inteiras", valor: d.erros.dados.rotas_inteiras, icone: <Inbox /> },
          { rotulo: "Documentos", valor: d.erros.dados.documentos, icone: <FileWarning /> },
        ]} />
        {d.erros.dados.truncado && <p className="text-helper text-fg-muted">Mostrando as primeiras 1000 pendências.</p>}
        <TabelaFiscal vazio="Nenhum erro de extração pendente." descricaoVazio="" colunas={["Rota", "Data da rota", "Etapa", "CT-e", "Erro", "Ocorrido em"]} linhas={d.erros.dados.itens.slice(0, 200).map((e, i) => ({ id: `${e.route_id}-${e.cte_key ?? i}-${i}`, celulas: [
          e.route_id || "—", data(e.data_rota), e.step_type || "—", e.cte_key ? <span key="k" className="block max-w-40 break-all text-helper">{e.cte_key}</span> : "Rota inteira",
          <span key="e" className="block max-w-72 break-words">{e.erro}</span>, dataHora(e.ocorrido_em),
        ] }))} />
        {d.erros.dados.itens.length > 200 && <p className="text-helper text-fg-muted">Mostrando 200 de {d.erros.dados.itens.length}.</p>}
      </div>}
    </BlocoFiscal>

    <BlocoFiscal titulo="NFS-e por competência" descricao={`A lista de NFS-e está no acervo. Aqui, o que chegou sem XML.${d.nfse.dados?.quarentena_por_triar ? ` ${contagemDoMotor(d.nfse.dados.quarentena_por_triar)} na quarentena por triar.` : ""}`}>
      {d.nfse.erro !== null ? <ErroDaLeitura falha={d.nfse} hrefDeNovo={aqui} /> : <TabelaFiscal vazio="Sem NFS-e no motor." descricaoVazio="" colunas={["Competência", "Sentido", "Quantidade", "Valor", "Sem XML", "Prestadores"]} linhas={(nfseDaCompetencia.length ? nfseDaCompetencia : d.nfse.dados.itens).map((n, i) => ({ id: `${n.competencia}-${n.sentido}-${i}`, celulas: [
        n.competencia, n.sentido === "entrada" ? "Tomada" : n.sentido === "saida" ? "Prestada" : n.sentido || "—", contagemDoMotor(n.quantidade), <span key="v" className="tabular-nums">{reaisDoMotor(n.valor)}</span>,
        n.sem_xml > 0 ? <Selo key="x" tom="atencao">{contagemDoMotor(n.sem_xml)}</Selo> : "0", contagemDoMotor(n.prestadores),
      ] }))} />}
    </BlocoFiscal>
  </div>;
}
