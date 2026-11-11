"use client";

import { useMemo, useRef, useState } from "react";
import { GitCommitHorizontal, MousePointerClick, Pencil, Trash2, Workflow } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { ItemDoMenu } from "@/components/ui/Popover";
import { Selo } from "@/components/ui/Selo";
import { READING_CLASS } from "@/components/bpoManual/ManualWorkspace";
import { formatInstantDateTime } from "@/lib/format";
import { dataBR } from "@/lib/datas/calendario";
import { desenharFluxo } from "@/lib/fluxos/desenho";
import { ehVolta, nomeCurtoDaEtapa, numerosDasEtapas, saidasDasEtapas, validarFluxo, type Etapa } from "@/lib/fluxos/etapas";
import type { FluxoAberto, VersaoAberta } from "@/lib/fluxos/tipos";
import { DesenhoDoFluxo } from "./DesenhoDoFluxo";
import { PainelDaEtapa } from "./PainelDaEtapa";
import { SeloDoExecutor } from "./SeloDoExecutor";
import { ArquivosDoFluxo } from "./ArquivosDoFluxo";

type Props = {
  fluxo: FluxoAberto;
  /** "Ver esta versão": a página mostra a versão antiga, só leitura. */
  versaoAberta: VersaoAberta | null;
  setorRotulo: string;
  rotuloDoSetor: (codigo: string) => string;
  podeEditar: boolean;
  podeExcluir: boolean;
  /** Endereço do fluxo nesta tela, com `?versao=` quando é uma versão antiga. */
  enderecoDaVersao: (versao: number | null) => string;
  aoEditar: () => void;
  aoExcluir: () => void;
  excluirAnexoAction: (anexoId: string) => Promise<{ error: string } | null>;
};

/**
 * O fluxo aberto, para ler (10/11/2026, pedido do Kauan — organização "Como
 * os Manuais" e leitura "Desenho com a etapa ao lado"): o cabeçalho com dono,
 * revisão e versão; a metodologia; o desenho com a etapa escolhida ao lado;
 * os arquivos e o histórico de versões.
 *
 * No celular, a lista das etapas vem primeiro (é o que se lê numa tela
 * estreita), o painel da etapa logo abaixo dela e o desenho por último, numa
 * caixa que rola de lado.
 */
export function LeituraDoFluxo({ fluxo, versaoAberta, setorRotulo, rotuloDoSetor, podeEditar, podeExcluir, enderecoDaVersao, aoEditar, aoExcluir, excluirAnexoAction }: Props) {
  const titulo = versaoAberta?.titulo ?? fluxo.titulo;
  const etapas = versaoAberta?.etapas ?? fluxo.etapas;
  const metodologia = versaoAberta ? versaoAberta.metodologia : fluxo.metodologia;
  const revisadoEm = versaoAberta ? versaoAberta.revisadoEm : fluxo.revisadoEm;
  const versao = versaoAberta?.versao ?? fluxo.versao;

  const numeros = useMemo(() => numerosDasEtapas(etapas), [etapas]);
  const desenho = useMemo(() => desenharFluxo(etapas), [etapas]);
  const avisos = useMemo(() => validarFluxo(etapas).avisos, [etapas]);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [sinalDeFoco, setSinalDeFoco] = useState(0);
  // De onde a etapa foi aberta (o desenho ou a lista): o Esc devolve o foco à
  // etapa aberta agora, no mesmo lugar — mesmo depois de Anterior e Próxima.
  const origem = useRef<"etapa-" | "lista-etapa-">("etapa-");
  const painelId = `painel-da-etapa-${fluxo.id}`;
  const etapa = etapas.find((e) => e.id === escolhida) ?? null;
  const soComecoEFim = etapas.every((e) => e.tipo === "inicio" || e.tipo === "fim");

  function escolher(id: string, prefixo: "etapa-" | "lista-etapa-") {
    origem.current = prefixo;
    setEscolhida(id);
    setSinalDeFoco((n) => n + 1);
  }
  function voltarParaAEtapa() {
    if (!escolhida) return;
    const alvo = document.getElementById(`${origem.current}${escolhida}`) ?? document.getElementById(`etapa-${escolhida}`);
    alvo?.focus();
  }

  return (
    <article className="flex flex-col gap-6" aria-labelledby={`titulo-do-fluxo-${fluxo.id}`}>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-[18rem] flex-col gap-2">
          {/* <h2>: o <h1> da tela é o "Repositório de fluxos" do cabeçalho (um título por tela). */}
          <h2 id={`titulo-do-fluxo-${fluxo.id}`} className="text-title font-semibold leading-tight tracking-[-0.02em] text-fg">
            {titulo}
          </h2>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-fs-2 text-fg-secondary">
            <span>Dono: {fluxo.donoId ? `${fluxo.donoNome ?? "—"} · ${setorRotulo}` : "—"}</span>
            <span>{revisadoEm ? `Revisado em ${dataBR(revisadoEm)}` : "Sem data de revisão"}</span>
            {versao > 0 ? (
              <span className="inline-flex items-center gap-1">
                <GitCommitHorizontal size={13} aria-hidden /> versão {versao}
              </span>
            ) : (
              <Selo tom="neutro">Sem versão salva</Selo>
            )}
          </p>
        </div>
        {!versaoAberta && (podeEditar || podeExcluir) && (
          <div className="flex items-center gap-2">
            {podeEditar && (
              <Button variant="secondary" size="sm" onClick={aoEditar} className="max-md:h-11">
                <Pencil size={14} /> Editar
              </Button>
            )}
            {podeExcluir && (
              <MenuDeMaisAcoes rotulo="Mais ações do fluxo" size="md" classeDoGatilho="max-md:size-11">
                <ItemDoMenu danger icone={<Trash2 size={14} />} onClick={aoExcluir}>
                  Excluir fluxo
                </ItemDoMenu>
              </MenuDeMaisAcoes>
            )}
          </div>
        )}
      </header>

      {versaoAberta && (
        <Aviso tom="info">
          Você está vendo a versão {versaoAberta.versao}, salva por {versaoAberta.salvaPor} em {formatInstantDateTime(new Date(versaoAberta.salvaEm))}. A versão em vigor é a {fluxo.versao}.{" "}
          <Button variant="link" href={enderecoDaVersao(null)} className="font-semibold">
            Voltar para a versão em vigor
          </Button>
        </Aviso>
      )}

      <section aria-labelledby={`metodologia-${fluxo.id}`} className="flex flex-col gap-2">
        <h3 id={`metodologia-${fluxo.id}`} className="text-section font-semibold text-fg">
          Metodologia
        </h3>
        {metodologia ? (
          // HTML sanitizado no servidor ao salvar (sanitizeDocumentHtml), como as páginas do manual.
          <div className={`${READING_CLASS} max-w-[72ch]`} dangerouslySetInnerHTML={{ __html: metodologia }} />
        ) : (
          <p className="text-ui text-fg-muted">{podeEditar ? "Sem metodologia escrita. Em “Editar”, conte como o setor toca este processo e por quê." : "Sem metodologia escrita."}</p>
        )}
      </section>

      <section aria-labelledby={`fluxograma-${fluxo.id}`} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id={`fluxograma-${fluxo.id}`} className="text-section font-semibold text-fg">
            Fluxograma
          </h3>
          {numeros.size > 0 && <span className="text-fs-2 text-fg-muted tabular-nums">{numeros.size === 1 ? "1 etapa" : `${numeros.size} etapas`}</span>}
        </div>

        {soComecoEFim && (
          <Aviso tom="neutro" icone={<Workflow />}>
            {podeEditar && !versaoAberta
              ? "Este fluxo ainda só tem o começo e o fim. Clique em “Editar” e escreva as etapas na ordem: o desenho se monta sozinho."
              : "Este fluxo ainda só tem o começo e o fim."}
          </Aviso>
        )}

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* A lista, no celular: o texto que o desenho mostra, para ler e tocar. */}
          <ListaDasEtapas etapas={etapas} numeros={numeros} rotuloDoSetor={rotuloDoSetor} escolhida={escolhida} painelId={painelId} aoEscolher={(id) => escolher(id, "lista-etapa-")} />

          <Card className="min-w-0 p-3 max-md:order-3 md:order-2">
            <DesenhoDoFluxo etapas={etapas} titulo={titulo} rotuloDoSetor={rotuloDoSetor} selecionada={escolhida} aoEscolher={(id) => escolher(id, "etapa-")} painelId={painelId} />
            {desenho.simplificado && (
              <p className="mt-2 text-fs-2 text-fg-muted">O desenho foi simplificado: há caminhos que se cruzam ou ramos dentro de ramos. A lista das etapas mostra cada caminho.</p>
            )}
          </Card>

          <div className="flex min-w-0 flex-col gap-3 max-md:order-2 md:order-3 lg:sticky lg:top-4">
            {etapa ? (
              <PainelDaEtapa
                etapa={etapa}
                etapas={etapas}
                numeros={numeros}
                rotuloDoSetor={rotuloDoSetor}
                painelId={painelId}
                sinalDeFoco={sinalDeFoco}
                aoIrPara={(id) => {
                  setEscolhida(id);
                  // Na primeira e na última, o botão que levou até lá desliga e perderia o foco: ele vai para o título.
                  const i = etapas.findIndex((e) => e.id === id);
                  if (i === 0 || i === etapas.length - 1) setSinalDeFoco((n) => n + 1);
                }}
                aoVoltarParaAEtapa={voltarParaAEtapa}
                aoFechar={() => {
                  voltarParaAEtapa();
                  setEscolhida(null);
                }}
              />
            ) : (
              <Card className="hidden flex-col items-start gap-2 p-4 text-ui text-fg-secondary md:flex">
                <MousePointerClick size={18} aria-hidden className="text-brand" />
                Clique numa etapa do desenho (ou chegue a ela com o Tab e aperte Enter) para ver o prazo, o que entra, o que sai e a tela do Connect onde ela se faz.
              </Card>
            )}
            {avisos.length > 0 && (
              <Aviso tom="atencao">
                {avisos.length === 1 ? avisos[0].mensagem : `${avisos.length} etapas estão fora do caminho: nenhum caminho a partir do Início chega a elas.`}
              </Aviso>
            )}
          </div>
        </div>
      </section>

      {!versaoAberta && (
        <section aria-labelledby={`arquivos-${fluxo.id}`} className="flex flex-col gap-2">
          <h3 id={`arquivos-${fluxo.id}`} className="text-section font-semibold text-fg">
            Arquivos
          </h3>
          <ArquivosDoFluxo fluxoId={fluxo.id} anexos={fluxo.anexos} podeAnexar={podeEditar} podeExcluir={podeExcluir} excluirAction={excluirAnexoAction} />
        </section>
      )}

      {fluxo.versoes.length > 0 && (
        // Recolhível começa fechado (regra de 08/10), com o resumo na linha.
        <BlocoRecolhivel titulo="Versões" resumo={fluxo.versoes.length === 1 ? "1 versão salva" : `${fluxo.versoes.length} versões salvas`}>
          <ul className="flex flex-col divide-y divide-border-soft">
            {fluxo.versoes.map((v) => {
              const vigente = v.versao === fluxo.versao;
              const aberta = v.versao === versaoAberta?.versao;
              return (
                <li key={v.versao} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-ui">
                  <span className="flex flex-wrap items-center gap-x-2">
                    <span className="font-medium text-fg tabular-nums">Versão {v.versao}</span>
                    {vigente && <Selo tom="sucesso">Em vigor</Selo>}
                    {aberta && <Selo tom="marca">Aberta agora</Selo>}
                    <span className="text-fs-2 text-fg-muted">
                      {v.salvaPor} · {formatInstantDateTime(new Date(v.salvaEm))}
                    </span>
                  </span>
                  {!vigente && !aberta && (
                    <Button href={enderecoDaVersao(v.versao)} variant="ghost" size="xs" className="max-md:h-11">
                      Ver esta versão
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </BlocoRecolhivel>
      )}
    </article>
  );
}

/** As etapas em lista, para o celular — com o que o desenho mostra em setas: Sim, Não e volta. */
function ListaDasEtapas({
  etapas,
  numeros,
  rotuloDoSetor,
  escolhida,
  painelId,
  aoEscolher,
}: {
  etapas: Etapa[];
  numeros: Map<string, number>;
  rotuloDoSetor: (c: string) => string;
  escolhida: string | null;
  painelId: string;
  aoEscolher: (id: string) => void;
}) {
  const saidas = saidasDasEtapas(etapas);
  const porId = new Map(etapas.map((e) => [e.id, e]));
  const curto = (id: string) => {
    const e = porId.get(id);
    return e ? nomeCurtoDaEtapa(e, numeros) : "";
  };
  return (
    <ol aria-label="Etapas do fluxo" className="flex flex-col gap-2 max-md:order-1 md:hidden">
      {etapas.map((e) => {
        const n = numeros.get(e.id);
        const destinos = saidas.get(e.id) ?? [];
        const caminho =
          e.tipo === "decisao"
            ? destinos.map((s) => `${s.tipo === "sim" ? "Sim" : "Não"} → ${curto(s.para)}`).join(" · ")
            : destinos[0] && ehVolta(etapas, e.id, destinos[0].para)
              ? `depois volta para ${curto(destinos[0].para)}`
              : "";
        return (
          <li key={e.id}>
            <button
              id={`lista-etapa-${e.id}`}
              type="button"
              onClick={() => aoEscolher(e.id)}
              aria-controls={painelId}
              aria-expanded={escolhida === e.id}
              className={`flex min-h-11 w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${escolhida === e.id ? "border-brand bg-brand-subtle" : "border-border bg-surface hover:bg-surface-hover"}`}
            >
              <span
                aria-hidden
                className={`mt-0.5 flex size-6 shrink-0 items-center justify-center text-micro font-bold tabular-nums ${e.tipo === "decisao" ? "rotate-45 rounded-sm border border-warning bg-warning/10" : "rounded-full bg-brand-subtle text-brand"}`}
              >
                <span className={e.tipo === "decisao" ? "-rotate-45 text-warning-fg" : ""}>{n ?? (e.tipo === "inicio" ? "▶" : "■")}</span>
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-ui font-medium text-fg">
                  <span className="sr-only">{nomeCurtoDaEtapa(e, numeros)}: </span>
                  {e.titulo || "Sem nome"}
                </span>
                {caminho && <span className="text-fs-2 text-fg-muted">{caminho}</span>}
                {e.executor && <SeloDoExecutor executor={e.executor} rotuloDoSetor={rotuloDoSetor} className="self-start" />}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
