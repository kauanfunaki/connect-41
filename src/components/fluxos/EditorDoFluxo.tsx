"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, CornerUpLeft, Diamond, GripVertical, Plus, Square, Trash2 } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CampoData } from "@/components/ui/CampoData";
import { CampoForm } from "@/components/ui/CampoForm";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useConfirm } from "@/components/ui/useConfirm";
import { useToast } from "@/components/ui/Toast";
import { hojeIso } from "@/lib/datas/calendario";
import { desenharFluxo } from "@/lib/fluxos/desenho";
import {
  LIMITES_DO_FLUXO,
  ROTULO_DO_EXECUTOR,
  TIPOS_DE_EXECUTOR,
  assinaturaDasEtapas,
  ehVolta,
  inserirEtapa,
  moverEtapa,
  nomeCurtoDaEtapa,
  numerosDasEtapas,
  podeMover,
  proximoIdDeEtapa,
  rotuloDoExecutor,
  saidasDasEtapas,
  tirarEtapa,
  validarFluxo,
  type CampoDaEtapa,
  type Etapa,
  type TipoDeEtapa,
  type TipoDeExecutor,
} from "@/lib/fluxos/etapas";
import type { FluxoAberto, OpcaoDeSetor, OpcaoDeTela, Pessoa } from "@/lib/fluxos/tipos";
import type { EntradaDaVersao, ResultadoDaVersao } from "@/app/(app)/fluxos/actions";
import { DesenhoDoFluxo } from "./DesenhoDoFluxo";

type Props = {
  fluxo: FluxoAberto;
  pessoas: Pessoa[];
  setores: OpcaoDeSetor[];
  telas: OpcaoDeTela[];
  /** O setor do repositório: o padrão de "Pessoa" numa etapa nova. */
  setorDaTela: string;
  rotuloDoSetor: (codigo: string) => string;
  salvarAction: (entrada: EntradaDaVersao) => Promise<ResultadoDaVersao>;
  /** Volta para a leitura (depois de salvar ou de cancelar). */
  aoSair: () => void;
  /** Avisa a área de trabalho de que há mudança não salva — ela confere antes de abrir outro fluxo. */
  aoMudarSujo: (sujo: boolean) => void;
};

type Erro = { mensagem: string; etapaId?: string; campo?: string };

const TITULO_PADRAO: Record<TipoDeEtapa, string> = { inicio: "Início", etapa: "", decisao: "", fim: "Fim" };
const PLACEHOLDER: Record<TipoDeEtapa, string> = {
  inicio: "Ex.: Cliente pede a admissão",
  etapa: "Ex.: Conferir os documentos",
  decisao: "Ex.: Documentos completos?",
  fim: "Ex.: Admissão concluída",
};

/**
 * Editar um fluxo (10/11/2026, pedido do Kauan — "Lista de etapas que vira
 * desenho"): à esquerda, a lista na ordem do processo; à direita, o desenho,
 * que se monta sozinho a cada mudança. Ninguém arrasta caixa nem seta.
 *
 * - Cada etapa é um bloco recolhível que começa fechado (regra de 08/10), com
 *   quem executa e para onde vai no resumo da linha. Subir, descer e tirar
 *   ficam na linha; o puxador arrasta com o mouse.
 * - "Volta" é uma etapa cujo destino fica antes dela na lista.
 * - Nada é gravado até "Salvar versão N"; a action roda a mesma validação.
 * - Sair com mudança não salva pede confirmação (fechar a aba e clicar num
 *   link do Connect).
 */
export function EditorDoFluxo({ fluxo, pessoas, setores, telas, setorDaTela, rotuloDoSetor, salvarAction, aoSair, aoMudarSujo }: Props) {
  const router = useRouter();
  const toast = useToast();
  const { dialog, requestConfirm } = useConfirm();

  const [titulo, setTitulo] = useState(fluxo.titulo);
  const [donoId, setDonoId] = useState(fluxo.donoId ?? "");
  // Salvar uma versão é revisar o fluxo: a data já vem com hoje.
  const [revisadoEm, setRevisadoEm] = useState(hojeIso());
  const metodologia = useRef(fluxo.metodologia ?? "");
  const [metodologiaMudou, setMetodologiaMudou] = useState(false);
  const [etapas, setEtapas] = useState<Etapa[]>(fluxo.etapas);
  const [abertas, setAbertas] = useState<ReadonlySet<string>>(new Set());
  const [erro, setErro] = useState<Erro | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [anuncio, setAnuncio] = useState("");
  const [arrastada, setArrastada] = useState<number | null>(null);
  const [alvoDoArraste, setAlvoDoArraste] = useState<number | null>(null);
  const focoPendente = useRef<string[] | null>(null);
  const saindo = useRef(false);

  const [original] = useState(() => JSON.stringify([fluxo.titulo, fluxo.donoId ?? "", assinaturaDasEtapas(fluxo.etapas)]));
  const sujo = metodologiaMudou || JSON.stringify([titulo, donoId, assinaturaDasEtapas(etapas)]) !== original;
  const proxima = fluxo.versao + 1;
  const numeros = useMemo(() => numerosDasEtapas(etapas), [etapas]);
  const desenho = useMemo(() => desenharFluxo(etapas), [etapas]);
  const telaValida = useMemo(() => {
    const s = new Set(telas.map((t) => t.href));
    return (h: string) => s.has(h);
  }, [telas]);
  const validacao = useMemo(() => validarFluxo(etapas, { telaValida }), [etapas, telaValida]);

  // A área de trabalho precisa saber, para conferir antes de abrir outro fluxo.
  const avisarSujo = useRef(aoMudarSujo);
  useEffect(() => {
    avisarSujo.current = aoMudarSujo;
  });
  useEffect(() => {
    avisarSujo.current(sujo);
  }, [sujo]);
  useEffect(() => () => avisarSujo.current(false), []);

  // Fechar a aba ou recarregar com mudança não salva: o navegador pergunta.
  useEffect(() => {
    if (!sujo) return;
    const antes = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", antes);
    return () => window.removeEventListener("beforeunload", antes);
  }, [sujo]);

  // Clicar num link do Connect (menu, árvore, topo) com mudança não salva: a
  // confirmação do app. Na captura do documento, antes do <Link> navegar.
  const confirmar = useRef(requestConfirm);
  useEffect(() => {
    confirmar.current = requestConfirm;
  });
  useEffect(() => {
    if (!sujo) return;
    const aoClicar = (e: MouseEvent) => {
      if (saindo.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(a instanceof HTMLAnchorElement) || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      e.preventDefault();
      e.stopPropagation();
      confirmar.current(
        { title: "Sair sem salvar?", description: "As mudanças deste fluxo ainda não viraram uma versão e serão perdidas.", confirmLabel: "Sair sem salvar", destructive: true },
        async () => {
          saindo.current = true;
          router.push(`${url.pathname}${url.search}${url.hash}`);
          return null;
        }
      );
    };
    document.addEventListener("click", aoClicar, true);
    return () => document.removeEventListener("click", aoClicar, true);
  }, [sujo, router]);

  useEffect(() => {
    const ids = focoPendente.current;
    if (!ids) return;
    focoPendente.current = null;
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el && !(el instanceof HTMLButtonElement && el.disabled)) {
        el.focus();
        return;
      }
    }
  });

  function mudar(fn: (l: Etapa[]) => Etapa[]) {
    setEtapas(fn);
    setErro(null);
  }
  function mudarEtapa(id: string, patch: Partial<Etapa>) {
    mudar((l) => l.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }
  function abrir(id: string, aberta: boolean) {
    setAbertas((a) => {
      const n = new Set(a);
      if (aberta) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  function mover(de: number, para: number, comTeclado: boolean) {
    if (!podeMover(etapas, de, para)) return;
    const id = etapas[de].id;
    const novas = moverEtapa(etapas, de, para);
    mudar(() => novas);
    const e = novas[para];
    setAnuncio(`${e.titulo.trim() || "Etapa sem nome"}: agora na posição ${para + 1} de ${novas.length}.`);
    if (comTeclado) focoPendente.current = [`${para < de ? "subir" : "descer"}-${id}`, `${para < de ? "descer" : "subir"}-${id}`];
  }

  /** Etapa nova entra antes do Fim do pé da lista (se houver): o Fim continua sendo o último. */
  function acrescentar(tipo: TipoDeEtapa, opcoes: { volta?: boolean; depoisDe?: number } = {}) {
    if (etapas.length >= LIMITES_DO_FLUXO.etapas) return;
    const id = proximoIdDeEtapa(etapas);
    const nova: Etapa = { id, tipo, titulo: TITULO_PADRAO[tipo] };
    if (tipo === "etapa") nova.executor = { tipo: "pessoa", setor: setorDaTela };
    // A volta já nasce apontando para uma etapa de cima — a primeira depois do Início; quem edita troca.
    if (opcoes.volta) nova.proxima = etapas.find((e) => e.tipo === "etapa" || e.tipo === "decisao")?.id ?? etapas[0]?.id;
    const ultima = etapas.length - 1;
    const depoisDe = opcoes.depoisDe ?? (tipo !== "fim" && etapas[ultima]?.tipo === "fim" ? ultima - 1 : ultima);
    mudar((l) => inserirEtapa(l, nova, depoisDe));
    abrir(id, true);
    focoPendente.current = [opcoes.volta ? `proxima-${id}` : `titulo-${id}`, `titulo-${id}`];
  }

  function tirar(indice: number) {
    const antes = etapas;
    const tirada = etapas[indice];
    const novas = tirarEtapa(etapas, indice);
    mudar(() => novas);
    const vizinha = novas[Math.min(indice, novas.length - 1)];
    focoPendente.current = vizinha ? [`tirar-${vizinha.id}`, "acrescentar-etapa"] : ["acrescentar-etapa"];
    toast.show(`“${tirada.titulo.trim() || "Etapa sem nome"}” saiu da lista.`, "info", { rotuloDoClique: "Desfazer", aoClicar: () => mudar(() => antes) });
  }

  function mostrarErro(e: Erro) {
    setErro(e);
    if (!e.etapaId) {
      if (e.campo === "titulo-do-fluxo") focoPendente.current = ["titulo-do-fluxo"];
      return;
    }
    abrir(e.etapaId, true);
    focoPendente.current = [`${e.campo ?? "titulo"}-${e.etapaId}`, `titulo-${e.etapaId}`];
  }

  async function salvar() {
    if (!titulo.trim()) return mostrarErro({ mensagem: "Dê um nome ao fluxo.", campo: "titulo-do-fluxo" });
    const primeiro = validacao.erros[0];
    if (primeiro) return mostrarErro(primeiro);
    setSalvando(true);
    const r = await salvarAction({ fluxoId: fluxo.id, versaoBase: fluxo.versao, titulo, donoId: donoId || null, revisadoEm: revisadoEm || null, metodologia: metodologia.current, etapas });
    setSalvando(false);
    if (!r.ok) return mostrarErro(r);
    saindo.current = true;
    avisarSujo.current(false);
    toast.success(`Versão ${r.versao} salva.`);
    aoSair();
    router.refresh();
  }

  function cancelar() {
    if (!sujo) return aoSair();
    requestConfirm({ title: "Descartar as mudanças?", description: "O que você mudou aqui não foi salvo e será perdido.", confirmLabel: "Descartar mudanças", destructive: true }, async () => {
      saindo.current = true;
      aoSair();
      return null;
    });
  }

  const noLimite = etapas.length >= LIMITES_DO_FLUXO.etapas;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="c41-rotulo">Editando</span>
        <h2 className="text-title font-semibold leading-tight tracking-[-0.02em] text-fg">{titulo.trim() || "Fluxo sem nome"}</h2>
      </div>

      <Card className="grid gap-4 p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
        <CampoForm label="Nome do fluxo" htmlFor="titulo-do-fluxo" required error={erro?.campo === "titulo-do-fluxo" ? erro.mensagem : undefined}>
          <Input id="titulo-do-fluxo" value={titulo} maxLength={160} onChange={(e) => { setTitulo(e.target.value); setErro(null); }} error={erro?.campo === "titulo-do-fluxo"} />
        </CampoForm>
        <CampoForm label="Dono" htmlFor="dono-do-fluxo" helper="Quem responde pelo processo no setor." error={erro?.campo === "dono" ? erro.mensagem : undefined}>
          <Select id="dono-do-fluxo" value={donoId} onChange={(e) => setDonoId(e.target.value)}>
            <option value="">Sem dono</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Select>
        </CampoForm>
        <CampoForm label="Revisado em" htmlFor="revisado-em" helper="Hoje, ao salvar a versão." error={erro?.campo === "revisado" ? erro.mensagem : undefined}>
          <CampoData id="revisado-em" value={revisadoEm} onChange={setRevisadoEm} max={hojeIso()} />
        </CampoForm>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(360px,440px)_minmax(0,1fr)]">
        <Card as="section" aria-labelledby="etapas-do-fluxo" className="flex min-w-0 flex-col gap-3 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="etapas-do-fluxo" className="text-section font-semibold text-fg">
              Etapas
            </h3>
            <span className="text-fs-2 text-fg-muted">o desenho se monta sozinho</span>
          </div>
          <p className="sr-only" aria-live="polite">
            {anuncio}
          </p>
          <ol aria-label="Etapas do fluxo, na ordem" className="flex flex-col gap-2">
            {etapas.map((e, i) => (
              <li
                key={e.id}
                onDragOver={(ev) => {
                  if (arrastada === null || !podeMover(etapas, arrastada, i)) return;
                  ev.preventDefault();
                  setAlvoDoArraste(i);
                }}
                onDrop={(ev) => {
                  ev.preventDefault();
                  if (arrastada !== null) mover(arrastada, i, false);
                  setArrastada(null);
                  setAlvoDoArraste(null);
                }}
                className={alvoDoArraste === i && arrastada !== i ? "rounded-lg outline-2 outline-dashed outline-brand/60" : ""}
              >
                <EtapaEditavel
                  etapa={e}
                  indice={i}
                  etapas={etapas}
                  numeros={numeros}
                  aberta={abertas.has(e.id)}
                  erro={erro?.etapaId === e.id ? erro : null}
                  setores={setores}
                  telas={telas}
                  setorDaTela={setorDaTela}
                  rotuloDoSetor={rotuloDoSetor}
                  podeSubir={podeMover(etapas, i, i - 1)}
                  podeDescer={podeMover(etapas, i, i + 1)}
                  aoAbrir={(a) => abrir(e.id, a)}
                  aoMudar={(patch) => mudarEtapa(e.id, patch)}
                  aoSubir={() => mover(i, i - 1, true)}
                  aoDescer={() => mover(i, i + 1, true)}
                  aoTirar={() => tirar(i)}
                  aoComecarArraste={() => setArrastada(i)}
                  aoTerminarArraste={() => {
                    setArrastada(null);
                    setAlvoDoArraste(null);
                  }}
                  aoInserirDepois={noLimite ? undefined : () => acrescentar("etapa", { depoisDe: i })}
                />
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap gap-2">
            <Button id="acrescentar-etapa" type="button" variant="secondary" size="sm" disabled={noLimite} onClick={() => acrescentar("etapa")} className="max-md:h-11">
              <Plus size={14} /> Etapa
            </Button>
            <Button type="button" variant="secondary" size="sm" disabled={noLimite} onClick={() => acrescentar("decisao")} className="max-md:h-11">
              <Diamond size={14} /> Decisão
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={noLimite || etapas.length < 2} onClick={() => acrescentar("etapa", { volta: true })} className="max-md:h-11">
              <CornerUpLeft size={14} /> Volta
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={noLimite} onClick={() => acrescentar("fim", { depoisDe: etapas.length - 1 })} className="max-md:h-11">
              <Square size={14} /> Fim
            </Button>
          </div>
          <p className="text-fs-2 text-fg-muted">
            Sem destino escolhido, cada etapa segue para a seguinte da lista. Uma <strong className="font-semibold">volta</strong> é uma etapa que segue para uma de cima — o desenho a mostra tracejada.
          </p>
        </Card>

        <Card as="section" aria-labelledby="desenho-ao-vivo" className="flex min-w-0 flex-col gap-3 p-4 lg:sticky lg:top-4">
          <h3 id="desenho-ao-vivo" className="text-section font-semibold text-fg">
            Desenho
          </h3>
          <DesenhoDoFluxo etapas={etapas} titulo={titulo.trim() || "fluxo sem nome"} rotuloDoSetor={rotuloDoSetor} />
          {desenho.simplificado && <p className="text-fs-2 text-fg-muted">O desenho foi simplificado: há caminhos que se cruzam ou ramos dentro de ramos. A lista continua valendo como está.</p>}
          {validacao.avisos.map((a) => (
            <Aviso key={a.etapaId ?? a.mensagem} tom="atencao">
              {a.mensagem}
            </Aviso>
          ))}
          {validacao.erros.length > 0 && (
            <p className="text-fs-2 text-fg-muted">
              {validacao.erros.length === 1 ? "Falta 1 ponto para salvar" : `Faltam ${validacao.erros.length} pontos para salvar`}: {validacao.erros[0].mensagem}
            </p>
          )}
        </Card>
      </div>

      <Card as="section" aria-labelledby="metodologia-editando" className="flex flex-col gap-2 p-4">
        <h3 id="metodologia-editando" className="text-section font-semibold text-fg">
          Metodologia
        </h3>
        <p className="text-fs-2 text-fg-muted">Como o setor toca este processo e por quê: o que o desenho não conta.</p>
        <RichTextEditor
          defaultValue={fluxo.metodologia ?? ""}
          onChange={(html) => {
            metodologia.current = html;
            setMetodologiaMudou(true);
          }}
        />
      </Card>

      {/* O rodapé fica preso embaixo enquanto a página rola: salvar não pede descer até o fim. */}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-md">
        {erro ? (
          <p className="mr-auto text-helper font-medium text-danger" role="alert">
            {erro.mensagem}
          </p>
        ) : (
          <p className="mr-auto text-helper text-fg-muted">{sujo ? "Mudanças ainda não salvas." : fluxo.versao > 0 ? `Sem mudanças em relação à versão ${fluxo.versao}.` : "Escreva as etapas e salve a primeira versão."}</p>
        )}
        <Button type="button" variant="secondary" onClick={cancelar} className="max-md:h-11">
          Cancelar
        </Button>
        <Button type="button" onClick={salvar} loading={salvando} className="max-md:h-11">
          Salvar versão {proxima}
        </Button>
      </div>
      {dialog}
    </div>
  );
}

type PropsDaEtapa = {
  etapa: Etapa;
  indice: number;
  etapas: Etapa[];
  numeros: Map<string, number>;
  aberta: boolean;
  erro: Erro | null;
  setores: OpcaoDeSetor[];
  telas: OpcaoDeTela[];
  setorDaTela: string;
  rotuloDoSetor: (codigo: string) => string;
  podeSubir: boolean;
  podeDescer: boolean;
  aoAbrir: (aberta: boolean) => void;
  aoMudar: (patch: Partial<Etapa>) => void;
  aoSubir: () => void;
  aoDescer: () => void;
  aoTirar: () => void;
  aoComecarArraste: () => void;
  aoTerminarArraste: () => void;
  aoInserirDepois?: () => void;
};

function EtapaEditavel({
  etapa: e,
  indice,
  etapas,
  numeros,
  aberta,
  erro,
  setores,
  telas,
  setorDaTela,
  rotuloDoSetor,
  podeSubir,
  podeDescer,
  aoAbrir,
  aoMudar,
  aoSubir,
  aoDescer,
  aoTirar,
  aoComecarArraste,
  aoTerminarArraste,
  aoInserirDepois,
}: PropsDaEtapa) {
  const c = e.id;
  const nomeCurto = nomeCurtoDaEtapa(e, numeros);
  const nome = e.titulo.trim() || "Sem nome";
  const erroNo = (campo: CampoDaEtapa) => (erro?.campo === campo ? erro.mensagem : undefined);
  const outras = etapas.filter((x) => x.id !== e.id);
  const seguinte = etapas[indice + 1];
  const destino = (id: string) => {
    const alvo = etapas.find((x) => x.id === id);
    return alvo ? `${nomeCurtoDaEtapa(alvo, numeros)} · ${alvo.titulo.trim() || "sem nome"}${ehVolta(etapas, e.id, id) ? " (volta)" : ""}` : "";
  };
  const saidas = saidasDasEtapas(etapas).get(e.id) ?? [];
  const curto = (id: string) => {
    const alvo = etapas.find((x) => x.id === id);
    return alvo ? nomeCurtoDaEtapa(alvo, numeros) : "?";
  };
  // O resumo da linha fechada: quem executa e para onde vai.
  const resumo = [
    e.executor && rotuloDoExecutor(e.executor, rotuloDoSetor),
    e.tipo === "decisao" && [e.sim || seguinte ? `Sim → ${curto(e.sim ?? seguinte!.id)}` : "Sim → ?", e.nao ? `Não → ${curto(e.nao)}` : "Não → escolher"].join(" · "),
    (e.tipo === "etapa" || e.tipo === "inicio") && saidas[0] && ehVolta(etapas, e.id, saidas[0].para) && `depois volta para ${curto(saidas[0].para)}`,
    (e.tipo === "etapa" || e.tipo === "inicio") && e.proxima && saidas[0] && !ehVolta(etapas, e.id, saidas[0].para) && `vai para ${curto(saidas[0].para)}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const marca =
    e.tipo === "decisao" ? (
      <span aria-hidden className="flex size-6 shrink-0 rotate-45 items-center justify-center rounded-sm border border-warning bg-warning/10">
        <span className="-rotate-45 text-micro font-bold text-warning-fg tabular-nums">{numeros.get(c)}</span>
      </span>
    ) : (
      <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-micro font-bold text-brand tabular-nums">
        {numeros.get(c) ?? (e.tipo === "inicio" ? "▶" : "■")}
      </span>
    );

  return (
    <BlocoRecolhivel
      aberto={aberta}
      onAbertoChange={aoAbrir}
      espacoDaAcao="pr-36"
      className={`bg-surface ${erro ? "border-danger/50!" : ""}`}
      classeDoConteudo="px-4 pb-4"
      acao={
        <span className="flex items-center gap-0.5">
          {e.tipo !== "inicio" && (
            // O puxador do mouse; no teclado e no toque, as setas ao lado.
            <span
              draggable
              onDragStart={(ev) => {
                ev.dataTransfer.effectAllowed = "move";
                ev.dataTransfer.setData("text/plain", c);
                aoComecarArraste();
              }}
              onDragEnd={aoTerminarArraste}
              aria-hidden
              title="Arraste para mudar de lugar"
              className="hidden size-7 cursor-grab items-center justify-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg md:inline-flex"
            >
              <GripVertical size={15} />
            </span>
          )}
          <IconButton id={`subir-${c}`} title="Subir" aria-label={`Subir “${nome}”`} disabled={!podeSubir} onClick={aoSubir} className="max-md:size-11">
            <ArrowUp size={15} />
          </IconButton>
          <IconButton id={`descer-${c}`} title="Descer" aria-label={`Descer “${nome}”`} disabled={!podeDescer} onClick={aoDescer} className="max-md:size-11">
            <ArrowDown size={15} />
          </IconButton>
          <IconButton
            id={`tirar-${c}`}
            title={e.tipo === "inicio" ? "O fluxo começa pelo Início" : "Tirar da lista"}
            aria-label={`Tirar “${nome}” da lista`}
            disabled={e.tipo === "inicio"}
            onClick={aoTirar}
            className="hover:text-danger! hover:bg-danger/8! max-md:size-11"
          >
            <Trash2 size={15} />
          </IconButton>
        </span>
      }
      titulo={
        <span className="flex min-w-0 items-start gap-2">
          {marca}
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className={`truncate ${e.titulo.trim() ? "" : "font-normal italic text-fg-muted"}`}>
              <span className="sr-only">{nomeCurto}: </span>
              {nome}
            </span>
            {resumo && <span className="truncate text-fs-2 font-normal text-fg-muted">{resumo}</span>}
          </span>
        </span>
      }
    >
      <div className="flex flex-col gap-4 border-t border-border-soft pt-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <CampoForm label={e.tipo === "decisao" ? "Pergunta" : "Nome"} htmlFor={`titulo-${c}`} required error={erroNo("titulo")}>
            <Input id={`titulo-${c}`} value={e.titulo} maxLength={LIMITES_DO_FLUXO.titulo} error={!!erroNo("titulo")} placeholder={PLACEHOLDER[e.tipo]} onChange={(ev) => aoMudar({ titulo: ev.target.value })} />
          </CampoForm>
          {e.tipo !== "inicio" && (
            <CampoForm label="Tipo" htmlFor={`tipo-${c}`}>
              <Select
                id={`tipo-${c}`}
                value={e.tipo}
                onChange={(ev) => {
                  const tipo = ev.target.value as TipoDeEtapa;
                  // Trocar o tipo leva só o que faz sentido no novo.
                  aoMudar(tipo === "fim" ? { tipo, executor: undefined, proxima: undefined, sim: undefined, nao: undefined } : tipo === "decisao" ? { tipo, proxima: undefined } : { tipo, sim: undefined, nao: undefined });
                }}
              >
                <option value="etapa">Etapa</option>
                <option value="decisao">Decisão</option>
                <option value="fim">Fim</option>
              </Select>
            </CampoForm>
          )}
        </div>

        {e.tipo !== "fim" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoForm label="Quem executa" htmlFor={`executor-${c}`} error={erroNo("executor")}>
              <Select
                id={`executor-${c}`}
                value={e.executor?.tipo ?? ""}
                onChange={(ev) => {
                  const tipo = ev.target.value as TipoDeExecutor | "";
                  aoMudar({ executor: tipo ? (tipo === "pessoa" ? { tipo, setor: e.executor?.setor ?? setorDaTela } : { tipo }) : undefined });
                }}
              >
                <option value="">Ninguém em especial</option>
                {TIPOS_DE_EXECUTOR.map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_DO_EXECUTOR[t]}
                  </option>
                ))}
              </Select>
            </CampoForm>
            {e.executor?.tipo === "pessoa" && (
              <CampoForm label="Setor da pessoa" htmlFor={`setor-${c}`}>
                <Select id={`setor-${c}`} value={e.executor.setor ?? ""} onChange={(ev) => aoMudar({ executor: { tipo: "pessoa", setor: ev.target.value || undefined } })}>
                  <option value="">Sem setor</option>
                  {setores.map((s) => (
                    <option key={s.codigo} value={s.codigo}>
                      {s.rotulo}
                    </option>
                  ))}
                </Select>
              </CampoForm>
            )}
          </div>
        )}

        {(e.tipo === "etapa" || e.tipo === "inicio") && (
          <CampoForm label="Depois vai para" htmlFor={`proxima-${c}`} helper="Uma etapa de cima vira uma volta, tracejada no desenho." error={erroNo("proxima")}>
            <Select id={`proxima-${c}`} value={e.proxima ?? ""} error={!!erroNo("proxima")} onChange={(ev) => aoMudar({ proxima: ev.target.value || undefined })}>
              <option value="">{seguinte ? `A seguinte da lista (${nomeCurtoDaEtapa(seguinte, numeros)})` : "Escolha (é a última da lista)"}</option>
              {outras.map((x) => (
                <option key={x.id} value={x.id}>
                  {destino(x.id)}
                </option>
              ))}
            </Select>
          </CampoForm>
        )}

        {e.tipo === "decisao" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoForm label="Se sim, vai para" htmlFor={`sim-${c}`} error={erroNo("sim")}>
              <Select id={`sim-${c}`} value={e.sim ?? ""} error={!!erroNo("sim")} onChange={(ev) => aoMudar({ sim: ev.target.value || undefined })}>
                <option value="">{seguinte ? `A seguinte da lista (${nomeCurtoDaEtapa(seguinte, numeros)})` : "Escolha"}</option>
                {outras.map((x) => (
                  <option key={x.id} value={x.id}>
                    {destino(x.id)}
                  </option>
                ))}
              </Select>
            </CampoForm>
            <CampoForm label="Se não, vai para" htmlFor={`nao-${c}`} required error={erroNo("nao")}>
              <Select id={`nao-${c}`} value={e.nao ?? ""} error={!!erroNo("nao")} onChange={(ev) => aoMudar({ nao: ev.target.value || undefined })}>
                <option value="">Escolha</option>
                {outras.map((x) => (
                  <option key={x.id} value={x.id}>
                    {destino(x.id)}
                  </option>
                ))}
              </Select>
            </CampoForm>
          </div>
        )}

        {e.tipo !== "fim" && (
          <>
            <CampoForm label="Prazo" htmlFor={`prazo-${c}`} error={erroNo("prazo")}>
              <Input id={`prazo-${c}`} value={e.prazo ?? ""} maxLength={LIMITES_DO_FLUXO.texto} placeholder="Ex.: Até 1 dia antes do início" onChange={(ev) => aoMudar({ prazo: ev.target.value })} />
            </CampoForm>
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoForm label="Entra" htmlFor={`entra-${c}`} helper="O que precisa para começar." error={erroNo("entra")}>
                <Textarea id={`entra-${c}`} rows={2} value={e.entra ?? ""} maxLength={LIMITES_DO_FLUXO.texto} onChange={(ev) => aoMudar({ entra: ev.target.value })} />
              </CampoForm>
              <CampoForm label="Sai" htmlFor={`sai-${c}`} helper="O que resulta." error={erroNo("sai")}>
                <Textarea id={`sai-${c}`} rows={2} value={e.sai ?? ""} maxLength={LIMITES_DO_FLUXO.texto} onChange={(ev) => aoMudar({ sai: ev.target.value })} />
              </CampoForm>
            </div>
            <CampoForm label="Se der erro" htmlFor={`seDerErro-${c}`} error={erroNo("seDerErro")}>
              <Textarea id={`seDerErro-${c}`} rows={2} value={e.seDerErro ?? ""} maxLength={LIMITES_DO_FLUXO.texto} onChange={(ev) => aoMudar({ seDerErro: ev.target.value })} />
            </CampoForm>
            <CampoForm label="Tela no Connect" htmlFor={`tela-${c}`} helper="Onde a etapa se faz. Quem lê o fluxo abre a tela por um link." error={erroNo("tela")}>
              <Select id={`tela-${c}`} busca value={e.tela ?? ""} error={!!erroNo("tela")} onChange={(ev) => aoMudar({ tela: ev.target.value || undefined })}>
                <option value="">Nenhuma</option>
                {telas.map((t) => (
                  <option key={t.href} value={t.href}>
                    {t.rotulo}
                  </option>
                ))}
              </Select>
            </CampoForm>
          </>
        )}

        {aoInserirDepois && e.tipo !== "fim" && (
          <div className="flex justify-end border-t border-border-soft pt-3">
            <Button type="button" variant="ghost" size="sm" onClick={aoInserirDepois} className="max-md:h-11">
              <Plus size={14} /> Inserir etapa abaixo
            </Button>
          </div>
        )}
      </div>
    </BlocoRecolhivel>
  );
}
