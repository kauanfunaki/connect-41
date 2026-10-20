"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Layers, BadgeCheck, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { ItemDoMenu } from "@/components/ui/Popover";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { FiltrosDaTela, type CampoDeFiltro } from "@/components/shared/FiltrosDaTela";
import { Pagination } from "@/components/shared/Pagination";
import { MenuFiscal } from "./MenuFiscal";
import { useFiscal } from "./ContextoFiscal";
import { AcoesFiscais, EstadoFiscal, MetricasFiscais, PreviaTexto, TabelaFiscal, dataFiscal, reais } from "./Compartilhados";
import { precisaRevisar, textoDoArquivoTeste, type ArquivoTeste, type Imposto } from "@/lib/fiscal/previa/cenario";
import { arquivoNoContexto, ultimasVersoesDoContexto } from "@/lib/fiscal/previa/fluxo";

const FILTROS: CampoDeFiltro[] = [
  { chave: "obrigacao", rotulo: "Obrigação", opcoes: [{ value: "icms", label: "ICMS/IPI" }, { value: "contribuicoes", label: "Contribuições" }] },
  { chave: "vigencia", rotulo: "Vigência", opcoes: [{ value: "vigente", label: "Vigentes" }, { value: "superada", label: "Superadas" }] },
  { chave: "validacao", rotulo: "Situação", opcoes: ["Não validado", "Aprovado", "Com pendências", "Revisão necessária", "Entregue"].map((value) => ({ value, label: value })) },
];
type Detalhe = "previa" | "validacao" | "apuracao" | "entrega";

function baixar(a: ArquivoTeste) {
  const url = URL.createObjectURL(new Blob([textoDoArquivoTeste(a)], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = a.nome.startsWith("EXEMPLO_") ? a.nome : `EXEMPLO_${a.nome}`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ArquivosFiscal({ aba, imposto }: { aba: string; imposto?: Imposto }) {
  const { cenario, modulos, pronto, resultado, simular } = useFiscal();
  const params = useSearchParams();
  const [detalhe, setDetalhe] = useState<{ id: string; modo: Detalhe } | null>(() => params.get("arquivo") ? { id: params.get("arquivo")!, modo: "previa" } : null);
  const todos = cenario.arquivos.filter((a) => !a.dominio && arquivoNoContexto(a, cenario.contexto) && (!imposto || a.tipo === imposto));
  const atuais = ultimasVersoesDoContexto(cenario);
  const atuaisIds = new Set(atuais.map((a) => a.id));
  const situacao = (a: ArquivoTeste) => precisaRevisar(cenario, a) ? "Revisão necessária" : a.entregue ? "Entregue" : a.validacao;
  const filtrados = todos.filter((a) => (!params.get("obrigacao") || a.tipo === (params.get("obrigacao") === "icms" ? "ICMS/IPI" : "Contribuições"))
    && (!params.get("vigencia") || atuaisIds.has(a.id) === (params.get("vigencia") === "vigente"))
    && (!params.get("validacao") || situacao(a) === params.get("validacao")));
  const paginas = Math.max(1, Math.ceil(filtrados.length / 12));
  const pagina = Math.min(paginas, Math.max(1, Number(params.get("pagina")) || 1));
  const hrefPagina = (n: number) => { const q = new URLSearchParams(params.toString()); q.set("pagina", String(n)); return `/fiscal/entregas?${q}`; };
  const arquivo = todos.find((a) => a.id === detalhe?.id);
  const podeValidar = (a: ArquivoTeste) => atuaisIds.has(a.id) && !precisaRevisar(cenario, a) && !a.entregue;
  const empresa = cenario.empresas.find((e) => e.id === cenario.contexto.empresaId)!;
  return <div className="space-y-5">
    <MetricasFiscais itens={[
      { rotulo: "Versões de teste", valor: todos.length, icone: <Layers /> },
      { rotulo: "Validação aprovada", valor: todos.filter((a) => atuaisIds.has(a.id) && a.validacao === "Aprovado" && !precisaRevisar(cenario, a)).length, icone: <BadgeCheck /> },
      { rotulo: "Precisam de revisão", valor: todos.filter((a) => atuaisIds.has(a.id) && precisaRevisar(cenario, a)).length, icone: <RefreshCw /> },
      { rotulo: "Entregas simuladas", valor: todos.filter((a) => a.entregue).length, icone: <Send /> },
    ]} />
    {(aba === "validacao" || aba === "entregas") && <Aviso tom="info">{aba === "validacao" ? "Abra Validar ou Ver relatório nas ações do arquivo para consultar a validação." : "Abra Registrar entrega ou Ver entrega nas ações do arquivo para consultar o protocolo de teste."}</Aviso>}
    <CascoDaTabela contagem={contarItens(filtrados.length, "arquivo", "arquivos")} filtros={<FiltrosDaTela naBarra campos={FILTROS} />} acoes={modulos.includes("fiscal_operacao") && <Button href="/fiscal/operacao?aba=executar&secao=gerar">Gerar novo SPED</Button>}>
      <TabelaFiscal vazio="Nenhum SPED gerado neste filtro." colunas={["Arquivo / obrigação", "Empresa / estabelecimento", "Competência", "Versão / vigência", "Validação", "Gerado em", "Ações"]} linhas={filtrados.slice((pagina - 1) * 12, pagina * 12).map((a) => ({ id: a.id, celulas: [
        <span key="nome" className="block max-w-60 break-words text-helper">{a.nome}<span className="block text-ui font-medium">{a.tipo}</span></span>,
        <span key="empresa">{empresa.nome}<span className="block text-helper text-fg-muted">{empresa.estabelecimentos.find((f) => f.id === a.contexto.estabelecimentoId)?.nome ?? "Todos os estabelecimentos · CNPJ raiz"}</span></span>,
        a.contexto.competencia,
        <span key="versao">v{a.versao}<span className="block text-helper text-fg-muted">{atuaisIds.has(a.id) ? "Vigente" : "Substituída por nova versão"}</span></span>,
        <EstadoFiscal key="estado">{situacao(a)}</EstadoFiscal>, dataFiscal(a.criadoEm),
        <AcoesFiscais key="acoes"><Button size="xs" variant="secondary" onClick={() => setDetalhe({ id: a.id, modo: "previa" })}>Ver prévia</Button><MenuFiscal rotulo={`Opções de ${a.nome}`} width={250}>{({ close }) => <>
          <ItemDoMenu onClick={() => { close(); baixar(a); }}>Baixar prévia de teste</ItemDoMenu>
          <ItemDoMenu onClick={() => { close(); setDetalhe({ id: a.id, modo: "validacao" }); }}>{podeValidar(a) && a.validacao !== "Aprovado" ? "Validar" : "Ver relatório de validação"}</ItemDoMenu>
          <ItemDoMenu onClick={() => { close(); setDetalhe({ id: a.id, modo: "apuracao" }); }}>Consultar apuração</ItemDoMenu>
          {(a.entregue || (podeValidar(a) && a.validacao === "Aprovado")) && <ItemDoMenu onClick={() => { close(); setDetalhe({ id: a.id, modo: "entrega" }); }}>{a.entregue ? "Ver entrega" : "Registrar entrega"}</ItemDoMenu>}
        </>}</MenuFiscal></AcoesFiscais>,
      ] }))} />
    </CascoDaTabela>
    <Pagination page={pagina} totalPages={paginas} buildHref={hrefPagina} total={filtrados.length} rotulo="arquivos" />
    <Modal open={!!arquivo} title={arquivo ? `${detalhe?.modo === "apuracao" ? "Apuração" : detalhe?.modo === "validacao" ? "Validação" : detalhe?.modo === "entrega" ? "Entrega" : "Prévia"} · ${arquivo.nome}` : "Arquivo"} onClose={() => setDetalhe(null)} maxWidth="max-w-3xl">
      {arquivo && <div className="space-y-4">
        <p className="text-ui text-fg-secondary">Dados fictícios · {arquivo.tipo} · {arquivo.contexto.competencia} · versão {arquivo.versao} · {atuaisIds.has(arquivo.id) ? "vigente" : "superada"}</p>
        <EstadoFiscal>{situacao(arquivo)}</EstadoFiscal>
        {detalhe?.modo === "previa" && <><PreviaTexto texto={textoDoArquivoTeste(arquivo)} /><Button variant="secondary" onClick={() => baixar(arquivo)}>Baixar prévia de teste</Button></>}
        {detalhe?.modo === "apuracao" && (arquivo.resumo ? <TabelaFiscal colunas={["Composição na geração", "Valor de teste"]} linhas={Object.entries(arquivo.resumo).map(([campo, valor]) => ({ id: campo, celulas: [({ entradas: "Entradas", saidas: "Receita", creditavel: "Base de crédito", icms: "ICMS", ipi: "IPI", pis: "PIS", cofins: "COFINS", pendentes: "Classificações pendentes", rejeitados: "Documentos em quarentena" } as Record<string, string>)[campo], ["pendentes", "rejeitados"].includes(campo) ? valor : reais(valor)] }))} /> : <Aviso tom="info">Resumo histórico indisponível para esta versão. Os valores atuais não substituem a apuração do arquivo antigo.</Aviso>)}
        {detalhe?.modo === "validacao" && <>
          <p className="text-ui text-fg-secondary">Validação do cenário de teste, sem consulta ao PVA.</p>
          {arquivo.erros.length > 0 && <ul className="list-disc pl-5 text-ui text-warning-fg">{arquivo.erros.map((erro, i) => <li key={i}>{erro}</li>)}</ul>}
          {podeValidar(arquivo) && <Button disabled={!pronto} onClick={() => simular({ tipo: "validar", id: arquivo.id })}>Simular validação</Button>}
          {!podeValidar(arquivo) && !arquivo.entregue && <Aviso tom="atencao">Use uma versão vigente com os dados atualizados para validar.</Aviso>}
        </>}
        {detalhe?.modo === "entrega" && (arquivo.entregue ? <Aviso tom="sucesso">Protocolo demonstrativo: {arquivo.protocolo}</Aviso> : <><p className="text-ui">Registrar uma entrega fictícia para a versão {arquivo.versao}, aprovada na validação de teste.</p><Button disabled={!pronto || !podeValidar(arquivo) || arquivo.validacao !== "Aprovado"} onClick={() => simular({ tipo: "entregar", id: arquivo.id })}>Confirmar entrega simulada</Button></>)}
        {resultado && <div role={resultado.erro ? "alert" : "status"}><Aviso tom={resultado.erro ? "atencao" : "info"}>{resultado.mensagem}</Aviso></div>}
      </div>}
    </Modal>
  </div>;
}
