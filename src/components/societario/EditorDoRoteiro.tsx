"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Bot, Plug, Plus, Trash2, User } from "lucide-react";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Aviso } from "@/components/ui/Aviso";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/useConfirm";
import { publicarRoteiro } from "@/app/(app)/processos/roteiros/actions";
import {
  EXECUTORES,
  EXECUTOR_ROTULO,
  LIMITES_DO_ROTEIRO,
  blocosDoEditor,
  descerEtapa,
  devolverEtapa,
  doEditor,
  etapaEmBranco,
  inserirEtapa,
  lerRoteiro,
  marcarParalela,
  moverItem,
  nomearGrupo,
  normalizarRoteiro,
  paraOEditor,
  podeDescer,
  podeSubir,
  posicoesDoEditor,
  subirEtapa,
  tirarEtapa,
  type CampoDoRoteiro,
  type EtapaDoRoteiro,
  type EtapaNoEditor,
  type Executor,
  type ItemNoEditor,
  type OrgaoDoRoteiro,
  type RoteiroLido,
} from "@/lib/societario/roteiroEditavel";

// Os mesmos ícones do roteiro do processo (`RoteiroDoProcesso`): quem edita vê
// a etapa com a cara que ela terá no processo.
const EXECUTOR_ICONE = { PESSOA: User, ROBO: Bot, INTEGRACAO: Plug } as const;

type Erro = { mensagem: string; chave?: string; campo?: CampoDoRoteiro };

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const nomeDaEtapa = (e: Pick<EtapaNoEditor, "rotulo">) => e.rotulo.trim() || "Etapa sem nome";
/** A forma comparável do que está na tela — "mudou?" não conta espaço sobrando nem item vazio. */
const assinatura = (etapas: readonly EtapaNoEditor[]) => JSON.stringify(normalizarRoteiro(doEditor(etapas)));

type Props = {
  tipoId: string;
  /** A maior versão do tipo quando a tela abriu; a publicação cria a seguinte. */
  versaoBase: number;
  /** O número da versão em vigor, ou nulo quando o tipo ainda não tem roteiro. */
  vigente: number | null;
  inicial: EtapaDoRoteiro[];
  orgaos: OrgaoDoRoteiro[];
  /** Processos do tipo em andamento, em qualquer versão: a confirmação diz que eles não mudam. */
  emAndamento: number;
};

/**
 * O editor do roteiro de um tipo de processo (09/11/2026).
 *
 * - Uma lista na ordem do processo, com a trilha numerada do roteiro do
 *   processo à esquerda; etapas na mesma posição ficam numa caixa "Em
 *   paralelo", com o nome do grupo.
 * - Cada etapa é um bloco recolhível que começa fechado (regra de 08/10), com
 *   o resumo na linha — quem executa, o órgão, o checklist. Subir, descer e
 *   tirar ficam na linha, sem abrir; etapa nova já abre, com o foco no nome.
 * - Nada é gravado até "Publicar versão N": a publicação confirma, diz que os
 *   processos em andamento não mudam, e grava a versão inteira. Tirar uma
 *   etapa tem "Desfazer" no aviso.
 * - O erro aparece na etapa (aberta, com o foco no campo) e no rodapé. A tela
 *   roda a mesma leitura do servidor antes de enviar.
 */
export function EditorDoRoteiro({ tipoId, versaoBase, vigente, inicial, orgaos, emAndamento }: Props) {
  const router = useRouter();
  const toast = useToast();
  const { dialog, requestConfirm } = useConfirm();

  // Tipo sem roteiro começa com uma etapa em branco, aberta.
  const [inicio] = useState<EtapaNoEditor[]>(() => {
    const doBanco = paraOEditor(inicial, { etapa: (i) => `v${i}`, item: (i, k) => `v${i}-${k}` });
    return doBanco.length > 0 ? doBanco : [etapaEmBranco("n0")];
  });
  const [etapas, setEtapas] = useState<EtapaNoEditor[]>(inicio);
  const [abertas, setAbertas] = useState<ReadonlySet<string>>(() => new Set(inicial.length > 0 ? [] : ["n0"]));
  const [erro, setErro] = useState<Erro | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const proximaChave = useRef(1);
  // Ids para focar depois do próximo desenho — a etapa que sobe pode ir para
  // outra caixa (sair de um grupo), e o React monta o botão de novo.
  const focoPendente = useRef<string[] | null>(null);

  const [original] = useState(() => assinatura(inicio));
  const mudou = assinatura(etapas) !== original;
  const blocos = blocosDoEditor(etapas);
  const posicoes = posicoesDoEditor(etapas);
  const proxima = versaoBase + 1;

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

  // Sair da página com mudança não publicada pede confirmação do navegador.
  useEffect(() => {
    if (!mudou) return;
    const antes = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", antes);
    return () => window.removeEventListener("beforeunload", antes);
  }, [mudou]);

  const novaChave = (prefixo: string) => `${prefixo}${proximaChave.current++}`;

  function mudar(fn: (atual: EtapaNoEditor[]) => EtapaNoEditor[]) {
    setEtapas(fn);
    setErro(null);
  }

  function mudarEtapa(chave: string, patch: Partial<EtapaNoEditor>) {
    mudar((l) => l.map((e) => (e.chave === chave ? { ...e, ...patch } : e)));
  }

  function mudarItens(chave: string, fn: (itens: ItemNoEditor[]) => ItemNoEditor[]) {
    mudar((l) => l.map((e) => (e.chave === chave ? { ...e, itens: fn(e.itens) } : e)));
  }

  function abrir(chave: string, aberta: boolean) {
    setAbertas((a) => {
      const n = new Set(a);
      if (aberta) n.add(chave);
      else n.delete(chave);
      return n;
    });
  }

  function mover(indice: number, direcao: "subir" | "descer") {
    const chave = etapas[indice].chave;
    const novas = direcao === "subir" ? subirEtapa(etapas, indice) : descerEtapa(etapas, indice);
    mudar(() => novas);
    const onde = novas.findIndex((e) => e.chave === chave);
    const emGrupo = novas[onde].paralelaAAnterior || novas[onde + 1]?.paralelaAAnterior === true;
    setAnuncio(`${nomeDaEtapa(novas[onde])}: posição ${posicoesDoEditor(novas)[onde]}${emGrupo ? ", em paralelo" : ""}.`);
    focoPendente.current = [`${direcao}-${chave}`, `${direcao === "subir" ? "descer" : "subir"}-${chave}`];
  }

  function acrescentar(depoisDe = -1) {
    const chave = novaChave("n");
    mudar((l) => inserirEtapa(l, etapaEmBranco(chave), depoisDe));
    abrir(chave, true);
    focoPendente.current = [`rotulo-${chave}`];
  }

  function tirar(indice: number) {
    const { etapas: novas, tirada } = tirarEtapa(etapas, indice);
    if (!tirada) return;
    mudar(() => novas);
    const vizinha = novas[Math.min(indice, novas.length - 1)];
    // A lixeira da etapa que ficou no lugar; com uma etapa só, ela trava, e o foco vai para "Acrescentar etapa".
    focoPendente.current = vizinha ? [`tirar-${vizinha.chave}`, "acrescentar-etapa"] : ["acrescentar-etapa"];
    toast.show(`“${nomeDaEtapa(tirada.etapa)}” saiu do roteiro.`, "info", {
      rotuloDoClique: "Desfazer",
      aoClicar: () => mudar((l) => devolverEtapa(l, tirada)),
    });
  }

  function acrescentarItem(chave: string) {
    const item = novaChave("i");
    mudarItens(chave, (itens) => [...itens, { chave: item, rotulo: "", obrigatorio: true }]);
    focoPendente.current = [`item-${item}`];
  }

  /** Mostra o erro da leitura na etapa: abre, e o foco vai para o campo. */
  function mostrarErro(lido: Extract<RoteiroLido, { ok: false }>, chaves: string[]) {
    const chave = lido.indice !== undefined ? chaves[lido.indice] : undefined;
    setErro({ mensagem: lido.erro, chave, campo: lido.campo });
    if (!chave) return;
    abrir(chave, true);
    const blocoDaEtapa = blocosDoEditor(etapas).find((b) => b.etapas.some((x) => x.etapa.chave === chave));
    const campo =
      lido.campo === "grupo" && blocoDaEtapa
        ? `grupo-${blocoDaEtapa.etapas[0].etapa.chave}`
        : lido.campo === "orgao"
          ? `orgao-${chave}`
          : lido.campo === "descricao"
            ? `descricao-${chave}`
            : `rotulo-${chave}`;
    focoPendente.current = [campo, `rotulo-${chave}`];
  }

  function publicar() {
    const enviada = doEditor(etapas);
    const chaves = etapas.map((e) => e.chave);
    const lido = lerRoteiro(enviada, new Set(orgaos.map((o) => o.id)));
    if (!lido.ok) {
      mostrarErro(lido, chaves);
      return;
    }
    const andamento =
      emAndamento === 0
        ? "Nenhum processo deste tipo está em andamento."
        : `${emAndamento === 1 ? "O processo em andamento continua" : `Os ${emAndamento} processos em andamento continuam`} na versão em que começou.`;
    requestConfirm(
      {
        title: `Publicar a versão ${proxima}?`,
        description:
          vigente === null
            ? `O roteiro passa a valer para os processos abertos daqui em diante. ${andamento}`
            : `A versão ${proxima} substitui a ${vigente} nos processos abertos daqui em diante. ${andamento}`,
        confirmLabel: `Publicar versão ${proxima}`,
      },
      async () => {
        const r = await publicarRoteiro({ tipoId, versaoBase, etapas: enviada });
        if (!r.ok) {
          // Erro de uma etapa vai para a etapa; o resto fica na janela.
          if (r.indice !== undefined) {
            mostrarErro(r, chaves);
            return null;
          }
          return { error: r.erro };
        }
        toast.success(`Versão ${r.versao} publicada.`);
        router.refresh();
        return null;
      }
    );
  }

  function descartar() {
    requestConfirm(
      {
        title: "Descartar as mudanças?",
        description: vigente === null ? "O que você montou aqui não foi publicado e será perdido." : `O roteiro volta a ser o da versão ${vigente}, como está em vigor.`,
        confirmLabel: "Descartar mudanças",
        destructive: true,
      },
      async () => {
        setEtapas(inicio);
        setAbertas(new Set());
        setErro(null);
        return null;
      }
    );
  }

  const todasAbertas = etapas.every((e) => abertas.has(e.chave));
  const noLimite = etapas.length >= LIMITES_DO_ROTEIRO.etapas;

  return (
    <Card as="section" aria-labelledby="etapas-do-roteiro" className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="etapas-do-roteiro" className="text-section font-semibold text-fg">
            Etapas
          </h2>
          <p className="text-fs-2 text-fg-muted tabular-nums">
            {plural(etapas.length, "etapa", "etapas")} em {plural(blocos.length, "posição", "posições")}, na ordem em que o processo anda. Etapas na mesma posição correm ao mesmo tempo.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setAbertas(todasAbertas ? new Set() : new Set(etapas.map((e) => e.chave)))}
        >
          {todasAbertas ? "Recolher todas" : "Abrir todas"}
        </Button>
      </div>

      {/* A posição muda com subir e descer: o leitor de tela ouve para onde a etapa foi. */}
      <p className="sr-only" aria-live="polite">
        {anuncio}
      </p>

      <ol aria-label="Etapas do roteiro, na ordem" className="flex flex-col">
        {blocos.map((bloco, b) => {
          const ultimo = b === blocos.length - 1;
          const primeira = bloco.etapas[0].etapa;
          const emParalelo = bloco.etapas.length > 1;
          const etapasDoBloco = bloco.etapas.map(({ etapa, indice }) => (
            <EtapaEditavel
              key={etapa.chave}
              etapa={etapa}
              posicao={posicoes[indice]}
              primeira={indice === 0}
              aberta={abertas.has(etapa.chave)}
              orgaos={orgaos}
              podeSubir={podeSubir(etapas, indice)}
              podeDescer={podeDescer(etapas, indice)}
              podeTirar={etapas.length > 1}
              erro={erro?.chave === etapa.chave ? erro : null}
              aoAbrir={(a) => abrir(etapa.chave, a)}
              aoMudar={(patch) => mudarEtapa(etapa.chave, patch)}
              aoMudarItens={(fn) => mudarItens(etapa.chave, fn)}
              aoAcrescentarItem={() => acrescentarItem(etapa.chave)}
              aoSubir={() => mover(indice, "subir")}
              aoDescer={() => mover(indice, "descer")}
              aoTirar={() => tirar(indice)}
              aoMarcarParalela={(ligada) => {
                mudar((l) => marcarParalela(l, indice, ligada));
                focoPendente.current = [`paralela-${etapa.chave}`];
              }}
              aoFocarDepois={(ids) => {
                focoPendente.current = ids;
              }}
              aoInserirDepois={noLimite ? undefined : () => acrescentar(indice)}
            />
          ));
          const erroDoGrupo = erro?.campo === "grupo" && bloco.etapas.some((x) => x.etapa.chave === erro.chave);
          return (
            <li key={primeira.chave} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3">
              {/* A trilha do roteiro do processo: o número é o da posição, que as paralelas dividem. */}
              <div aria-hidden className="flex flex-col items-center">
                <span className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-border bg-surface text-micro font-semibold tabular-nums text-fg-secondary ${emParalelo ? "mt-3" : "mt-2"}`}>
                  {bloco.posicao}
                </span>
                {!ultimo && <span className="my-1 w-0.5 flex-1 rounded-full bg-border" />}
              </div>
              <div className={`min-w-0 ${ultimo ? "" : "pb-3"}`}>
                {emParalelo ? (
                  <div className="flex flex-col gap-2 rounded-lg border border-dashed border-brand/35 bg-brand/5 p-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span className="c41-rotulo">Em paralelo</span>
                      <Input
                        id={`grupo-${primeira.chave}`}
                        compact
                        value={primeira.grupo}
                        maxLength={LIMITES_DO_ROTEIRO.grupo}
                        error={erroDoGrupo}
                        aria-invalid={erroDoGrupo || undefined}
                        onChange={(e) => mudar((l) => nomearGrupo(l, bloco.etapas[0].indice, e.target.value))}
                        placeholder="Nome do grupo (opcional)"
                        aria-label={`Nome do grupo da posição ${bloco.posicao}`}
                        className="w-60 max-w-full"
                      />
                      <span className="text-fs-2 text-fg-muted">{bloco.etapas.length} etapas liberadas ao mesmo tempo</span>
                    </div>
                    {etapasDoBloco}
                  </div>
                ) : (
                  etapasDoBloco
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <Button
        id="acrescentar-etapa"
        type="button"
        variant="secondary"
        size="sm"
        className="self-start"
        disabled={noLimite}
        onClick={() => acrescentar()}
      >
        <Plus size={14} /> Acrescentar etapa
      </Button>

      {/* O rodapé fica preso embaixo enquanto a lista rola: publicar não pede
          descer até o fim de um roteiro de dez etapas abertas. */}
      <div className="sticky bottom-0 z-10 -mx-4 -mb-4 flex flex-wrap items-center justify-end gap-3 rounded-b-lg border-t border-border bg-surface px-4 py-3">
        {erro ? (
          <p className="mr-auto text-helper font-medium text-danger" role="alert">
            {erro.mensagem}
          </p>
        ) : (
          <p className="mr-auto text-helper text-fg-muted">
            {mudou
              ? "Mudanças ainda não publicadas — os processos só veem o roteiro depois de publicar."
              : vigente === null
                ? "Monte as etapas e publique para o tipo ganhar roteiro."
                : `Sem mudanças em relação à versão ${vigente}.`}
          </p>
        )}
        {mudou && (
          <Button type="button" variant="secondary" onClick={descartar}>
            Descartar mudanças
          </Button>
        )}
        <Button type="button" disabled={!mudou} onClick={publicar}>
          Publicar versão {proxima}
        </Button>
      </div>
      {dialog}
    </Card>
  );
}

type PropsDaEtapa = {
  etapa: EtapaNoEditor;
  posicao: number;
  /** A primeira do roteiro não tem "de cima" para correr junto. */
  primeira: boolean;
  aberta: boolean;
  orgaos: OrgaoDoRoteiro[];
  podeSubir: boolean;
  podeDescer: boolean;
  podeTirar: boolean;
  erro: Erro | null;
  aoAbrir: (aberta: boolean) => void;
  aoMudar: (patch: Partial<EtapaNoEditor>) => void;
  aoMudarItens: (fn: (itens: ItemNoEditor[]) => ItemNoEditor[]) => void;
  aoAcrescentarItem: () => void;
  aoSubir: () => void;
  aoDescer: () => void;
  aoTirar: () => void;
  aoMarcarParalela: (ligada: boolean) => void;
  /** O foco depois do próximo desenho — o primeiro destes ids que estiver na tela e ativo. */
  aoFocarDepois: (ids: string[]) => void;
  /** Ausente no teto de etapas. */
  aoInserirDepois?: () => void;
};

function EtapaEditavel({
  etapa,
  posicao,
  primeira,
  aberta,
  orgaos,
  podeSubir,
  podeDescer,
  podeTirar,
  erro,
  aoAbrir,
  aoMudar,
  aoMudarItens,
  aoAcrescentarItem,
  aoSubir,
  aoDescer,
  aoTirar,
  aoMarcarParalela,
  aoFocarDepois,
  aoInserirDepois,
}: PropsDaEtapa) {
  const c = etapa.chave;
  const nome = nomeDaEtapa(etapa);
  const Icone = EXECUTOR_ICONE[etapa.executor];
  const orgao = orgaos.find((o) => o.id === etapa.orgaoId) ?? null;
  const preenchidos = etapa.itens.filter((i) => i.rotulo.trim());
  const obrigatorios = preenchidos.filter((i) => i.obrigatorio).length;
  // O resumo da linha fechada: o que muda o jeito de tocar a etapa.
  const resumo = [
    EXECUTOR_ROTULO[etapa.executor],
    orgao && `protocolo em ${orgao.sigla ?? orgao.nome}`,
    preenchidos.length > 0 && `checklist com ${plural(preenchidos.length, "item", "itens")}`,
    etapa.opcional && "opcional",
  ]
    .filter(Boolean)
    .join(" · ");
  const erroNo = (campo: CampoDoRoteiro) => (erro?.campo === campo ? erro.mensagem : undefined);
  // Órgão desativado só aparece na etapa que já o usa — para não sumir do seletor dela.
  const orgaosDaEtapa = orgaos.filter((o) => o.ativo || o.id === etapa.orgaoId);

  return (
    <BlocoRecolhivel
      aberto={aberta}
      onAbertoChange={aoAbrir}
      espacoDaAcao="pr-32"
      className={`bg-surface ${erro ? "border-danger/50!" : ""}`}
      classeDoConteudo="px-4 pb-4"
      acao={
        <span className="flex items-center gap-0.5">
          <IconButton id={`subir-${c}`} title="Subir" aria-label={`Subir “${nome}”`} disabled={!podeSubir} onClick={aoSubir}>
            <ArrowUp size={15} />
          </IconButton>
          <IconButton id={`descer-${c}`} title="Descer" aria-label={`Descer “${nome}”`} disabled={!podeDescer} onClick={aoDescer}>
            <ArrowDown size={15} />
          </IconButton>
          <IconButton
            id={`tirar-${c}`}
            title={podeTirar ? "Tirar do roteiro" : "O roteiro precisa de pelo menos uma etapa"}
            aria-label={`Tirar “${nome}” do roteiro`}
            disabled={!podeTirar}
            onClick={aoTirar}
            className="hover:text-danger! hover:bg-danger/8!"
          >
            <Trash2 size={15} />
          </IconButton>
        </span>
      }
      titulo={
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className={`truncate ${etapa.rotulo.trim() ? "" : "font-normal italic text-fg-muted"}`}>
            <span className="sr-only">Posição {posicao}: </span>
            {nome}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-fs-2 font-normal text-fg-muted">
            <Icone size={13} aria-hidden className="shrink-0" />
            <span className="truncate">{resumo}</span>
          </span>
        </span>
      }
    >
      <div className="flex flex-col gap-4 border-t border-border-soft pt-4">
        <CampoForm label="Nome da etapa" htmlFor={`rotulo-${c}`} required error={erroNo("rotulo")}>
          <Input
            id={`rotulo-${c}`}
            value={etapa.rotulo}
            maxLength={LIMITES_DO_ROTEIRO.rotulo}
            error={Boolean(erroNo("rotulo"))}
            onChange={(e) => aoMudar({ rotulo: e.target.value })}
            placeholder="Ex.: Viabilidade na Junta"
          />
        </CampoForm>

        <CampoForm
          label="Descrição"
          htmlFor={`descricao-${c}`}
          helper="Orientação para quem toca a etapa. Aparece no processo."
          error={erroNo("descricao")}
          acao={
            <span className="tabular-nums text-fg-muted">
              {etapa.descricao.length}/{LIMITES_DO_ROTEIRO.descricao}
            </span>
          }
        >
          <Textarea
            id={`descricao-${c}`}
            rows={2}
            value={etapa.descricao}
            maxLength={LIMITES_DO_ROTEIRO.descricao}
            error={Boolean(erroNo("descricao"))}
            onChange={(e) => aoMudar({ descricao: e.target.value })}
          />
        </CampoForm>

        <div className="grid gap-4 sm:grid-cols-2">
          <CampoForm label="Quem executa" htmlFor={`executor-${c}`}>
            <Select id={`executor-${c}`} value={etapa.executor} onChange={(e) => aoMudar({ executor: e.target.value as Executor })}>
              {EXECUTORES.map((x) => (
                <option key={x} value={x}>
                  {EXECUTOR_ROTULO[x]}
                </option>
              ))}
            </Select>
          </CampoForm>
          <CampoForm label="Órgão" htmlFor={`orgao-${c}`} helper="Com órgão, concluir a etapa abre um protocolo nele." error={erroNo("orgao")}>
            <Select id={`orgao-${c}`} value={etapa.orgaoId} error={Boolean(erroNo("orgao"))} onChange={(e) => aoMudar({ orgaoId: e.target.value })}>
              <option value="">Nenhum</option>
              {orgaosDaEtapa.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                  {o.sigla ? ` (${o.sigla})` : ""}
                  {o.ativo ? "" : " — desativado"}
                </option>
              ))}
            </Select>
          </CampoForm>
        </div>

        <div className="flex flex-col gap-3">
          <Checkbox
            id={`opcional-${c}`}
            checked={etapa.opcional}
            onChange={(e) => aoMudar({ opcional: e.target.checked })}
            label="Opcional"
            helper="O processo ganha o botão “Não se aplica” nesta etapa."
          />
          {!primeira && (
            <Checkbox
              id={`paralela-${c}`}
              checked={etapa.paralelaAAnterior}
              onChange={(e) => aoMarcarParalela(e.target.checked)}
              label="Corre junto com a etapa de cima"
              helper="As duas ficam na mesma posição e são liberadas ao mesmo tempo."
            />
          )}
        </div>

        <section aria-labelledby={`checklist-${c}`} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id={`checklist-${c}`} className="c41-rotulo">
              Checklist
            </h3>
            {preenchidos.length > 0 && (
              <span className="text-micro text-fg-muted tabular-nums">
                {obrigatorios} de {plural(preenchidos.length, "item obrigatório", "itens obrigatórios")}
              </span>
            )}
          </div>
          {etapa.itens.length === 0 ? (
            <p className="text-fs-2 text-fg-muted">Sem itens. O checklist lista o que a etapa pede; item obrigatório trava a conclusão até ser marcado.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {etapa.itens.map((item, k) => (
                <ItemEditavel
                  key={item.chave}
                  item={item}
                  posicao={k}
                  total={etapa.itens.length}
                  aoMudar={(patch) => aoMudarItens((itens) => itens.map((i) => (i.chave === item.chave ? { ...i, ...patch } : i)))}
                  aoMover={(delta) => {
                    aoMudarItens((itens) => moverItem(itens, k, delta));
                    const seta = delta < 0 ? "subir" : "descer";
                    aoFocarDepois([`${seta}-item-${item.chave}`, `${seta === "subir" ? "descer" : "subir"}-item-${item.chave}`]);
                  }}
                  aoTirar={() => {
                    aoMudarItens((itens) => itens.filter((i) => i.chave !== item.chave));
                    const vizinho = etapa.itens[k + 1] ?? etapa.itens[k - 1];
                    aoFocarDepois(vizinho ? [`item-${vizinho.chave}`] : [`acrescentar-item-${c}`]);
                  }}
                />
              ))}
            </ul>
          )}
          {erroNo("itens") && <Aviso>{erroNo("itens")}</Aviso>}
          <Button
            id={`acrescentar-item-${c}`}
            type="button"
            variant="secondary"
            size="sm"
            className="self-start"
            disabled={etapa.itens.length >= LIMITES_DO_ROTEIRO.itensPorEtapa}
            onClick={aoAcrescentarItem}
          >
            <Plus size={14} /> Acrescentar item
          </Button>
        </section>

        {aoInserirDepois && (
          <div className="flex justify-end border-t border-border-soft pt-3">
            <Button type="button" variant="ghost" size="sm" onClick={aoInserirDepois}>
              <Plus size={14} /> Inserir etapa abaixo
            </Button>
          </div>
        )}
      </div>
    </BlocoRecolhivel>
  );
}

function ItemEditavel({
  item,
  posicao,
  total,
  aoMudar,
  aoMover,
  aoTirar,
}: {
  item: ItemNoEditor;
  posicao: number;
  total: number;
  aoMudar: (patch: Partial<ItemNoEditor>) => void;
  aoMover: (delta: -1 | 1) => void;
  aoTirar: () => void;
}) {
  const nome = item.rotulo.trim() || `item ${posicao + 1}`;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <Input
        id={`item-${item.chave}`}
        compact
        value={item.rotulo}
        maxLength={LIMITES_DO_ROTEIRO.item}
        onChange={(e) => aoMudar({ rotulo: e.target.value })}
        placeholder="Ex.: RG e CPF dos sócios"
        aria-label={`Item ${posicao + 1} do checklist`}
        className="min-w-0 flex-1 basis-56"
      />
      <Checkbox id={`obrigatorio-${item.chave}`} checked={item.obrigatorio} onChange={(e) => aoMudar({ obrigatorio: e.target.checked })} label="Obrigatório" />
      <span className="flex items-center gap-0.5">
        <IconButton id={`subir-item-${item.chave}`} title="Subir item" aria-label={`Subir “${nome}”`} disabled={posicao === 0} onClick={() => aoMover(-1)}>
          <ArrowUp size={14} />
        </IconButton>
        <IconButton id={`descer-item-${item.chave}`} title="Descer item" aria-label={`Descer “${nome}”`} disabled={posicao === total - 1} onClick={() => aoMover(1)}>
          <ArrowDown size={14} />
        </IconButton>
        <IconButton title="Tirar item" aria-label={`Tirar “${nome}” do checklist`} onClick={aoTirar} className="hover:text-danger! hover:bg-danger/8!">
          <Trash2 size={14} />
        </IconButton>
      </span>
    </li>
  );
}
