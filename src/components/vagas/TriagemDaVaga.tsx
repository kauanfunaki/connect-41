"use client";

import { useId, useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Aviso } from "@/components/ui/Aviso";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { pontuarPassoDoLote, salvarRequisitosDaVaga } from "@/app/(app)/vagas/[id]/triagem-actions";
import { CORTES_PADRAO, MAX_REQUISITOS, ROTULO_DA_FAIXA, type Faixa, type Requisito } from "@/lib/recrutamento/triagem";
import {
  adicionarRequisito,
  faixasDaRegua,
  mudarRequisito,
  removerRequisito,
  ROTULO_DO_PESO,
  separarEmListas,
  type ItemDaLista,
  type LinhaDeRequisito,
} from "@/lib/recrutamento/editorDeRequisitos";

type Linha = LinhaDeRequisito;

const PESOS = [1, 2, 3] as const;

type Props = {
  vagaId: string;
  requisitos: { versao: number; itens: Requisito[]; corteCompativel: number; corteParcial: number } | null;
  pendentes: number;
  emAndamento: number;
  podeEditar: boolean;
  podePontuar: boolean;
  iaConfigurada: boolean;
};

const doGravado = (r: Props["requisitos"]): Linha[] => (r ? r.itens.map(({ tipo, texto, peso }) => ({ tipo, texto, peso })) : []);
const cortesDoGravado = (r: Props["requisitos"]) => ({
  corteParcial: String(r?.corteParcial ?? CORTES_PADRAO.corteParcial),
  corteCompativel: String(r?.corteCompativel ?? CORTES_PADRAO.corteCompativel),
});

/** O desenho de cada lista: a cor do tipo no filete de cima e no rótulo, e a frase do que ela vale. */
const LISTAS = {
  OBRIGATORIO: { titulo: "Obrigatórios", nota: "pesam o dobro", adicionar: "Adicionar obrigatório", filete: "border-t-warning", rotulo: "text-warning-fg" },
  DESEJAVEL: { titulo: "Desejáveis", nota: "contam a favor", adicionar: "Adicionar desejável", filete: "border-t-[color:var(--c41-grafico-neutro)]", rotulo: "" },
} as const;

/**
 * Requisitos da triagem e o lote de pontuação.
 *
 * Os requisitos em duas listas, Obrigatórios e Desejáveis — escolha "Vaga · 3
 * B" do Kauan (14/10/2026). Era uma linha por requisito com quatro controles
 * sem rótulo (tipo, texto, pontos, lixeira) e os cortes como dois números
 * soltos. Agora o tipo é a lista onde o requisito está, cada lista tem o
 * próprio campo de adicionar, o peso ganha nome (baixo, médio, alto) e os
 * cortes desenham uma régua de 0 a 100. O formato gravado e o versionamento
 * não mudam (ver `src/lib/recrutamento/editorDeRequisitos.ts`).
 *
 * O lote roda em passos curtos chamados daqui, um atrás do outro, com o
 * andamento na tela — 200 currículos numa requisição só estourariam o tempo
 * dela, e sem andamento o recrutador não sabe se travou.
 */
export function TriagemDaVaga({ vagaId, requisitos, pendentes, emAndamento, podeEditar, podePontuar, iaConfigurada }: Props) {
  const router = useRouter();
  const [editando, setEditando] = useState(!requisitos && podeEditar);
  const [linhas, setLinhas] = useState<Linha[]>(() => doGravado(requisitos));
  // O texto ainda não adicionado de cada lista: entra junto ao salvar, para
  // não se perder quem digitou e foi direto ao "Salvar requisitos".
  const [novos, setNovos] = useState<Record<Linha["tipo"], string>>({ OBRIGATORIO: "", DESEJAVEL: "" });
  const [cortes, setCortes] = useState(() => cortesDoGravado(requisitos));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, startSalvar] = useTransition();
  const [lote, setLote] = useState<{ rodando: boolean; feitas: number; total: number; log: string[] } | null>(null);

  const listas = separarEmListas(linhas);
  const regua = faixasDaRegua(cortes.corteParcial, cortes.corteCompativel);
  const cheio = linhas.length >= MAX_REQUISITOS;

  function adicionar(tipo: Linha["tipo"]) {
    if (cheio) return;
    setLinhas((ls) => adicionarRequisito(ls, tipo, novos[tipo]));
    setNovos((n) => ({ ...n, [tipo]: "" }));
  }

  function cancelar() {
    setLinhas(doGravado(requisitos));
    setCortes(cortesDoGravado(requisitos));
    setNovos({ OBRIGATORIO: "", DESEJAVEL: "" });
    setErro(null);
    setEditando(false);
  }

  function salvar() {
    setErro(null);
    const itens = adicionarRequisito(adicionarRequisito(linhas, "OBRIGATORIO", novos.OBRIGATORIO), "DESEJAVEL", novos.DESEJAVEL);
    startSalvar(async () => {
      const r = await salvarRequisitosDaVaga(vagaId, { itens, ...cortes });
      if ("error" in r) setErro(r.error);
      else {
        setLinhas(itens);
        setNovos({ OBRIGATORIO: "", DESEJAVEL: "" });
        setEditando(false);
        router.refresh();
      }
    });
  }

  async function rodar(modo: "pendentes" | "todas") {
    const pular: string[] = [];
    const feitas: string[] = [];
    const log: string[] = [];
    let total = modo === "pendentes" ? pendentes : emAndamento;
    setLote({ rodando: true, feitas: 0, total, log });
    for (;;) {
      const r = await pontuarPassoDoLote(vagaId, modo, pular, modo === "todas" ? feitas : []);
      if ("error" in r) {
        log.push(r.error);
        break;
      }
      for (const p of r.processadas) {
        feitas.push(p.id);
        log.push(`${p.nome}: ${p.score} · ${ROTULO_DA_FAIXA[p.faixa as Faixa]}`);
      }
      for (const f of r.falhas) {
        pular.push(f.id);
        log.push(`${f.nome}: não pontuado — ${f.erro}`);
      }
      total = feitas.length + pular.length + r.restantes;
      setLote({ rodando: true, feitas: feitas.length + pular.length, total, log: [...log] });
      if (r.restantes === 0 || (r.processadas.length === 0 && r.falhas.length === 0)) break;
    }
    setLote({ rodando: false, feitas: feitas.length + pular.length, total, log: [...log] });
    router.refresh();
  }

  return (
    <Card className="p-5 mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-section font-semibold text-fg">Triagem de currículos</h2>
          <p className="text-fs-2 text-fg-muted mt-0.5 max-w-[640px]">
            A IA confere o currículo contra cada requisito e aponta a evidência; a nota sai da tabela abaixo. Ela
            <strong className="font-medium text-fg-secondary"> só ordena os candidatos — nunca reprova ninguém</strong>. Nome, idade, cidade e
            foto não chegam ao pontuador.
          </p>
        </div>
        {requisitos && !editando && podeEditar && (
          <Button variant="secondary" size="sm" onClick={() => setEditando(true)}>
            <Pencil size={13} /> Editar requisitos
          </Button>
        )}
      </div>

      {editando ? (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            {(["OBRIGATORIO", "DESEJAVEL"] as const).map((tipo) => (
              <ListaDeRequisitos
                key={tipo}
                tipo={tipo}
                itens={tipo === "OBRIGATORIO" ? listas.obrigatorios : listas.desejaveis}
                onMudar={(indice, mudanca) => setLinhas((ls) => mudarRequisito(ls, indice, mudanca))}
                onRemover={(indice) => setLinhas((ls) => removerRequisito(ls, indice))}
                novo={novos[tipo]}
                onNovo={(texto) => setNovos((n) => ({ ...n, [tipo]: texto }))}
                onAdicionar={() => adicionar(tipo)}
                cheio={cheio}
              />
            ))}
          </div>
          <p className="text-helper text-fg-muted">
            Os pontos são o peso: um é baixo, três é alto. Clique para trocar.
            {cheio && ` Chegou ao limite de ${MAX_REQUISITOS} requisitos por vaga.`}
          </p>

          <div className="space-y-3">
            <p className="c41-rotulo">Como a nota vira faixa</p>
            <div className="flex flex-wrap gap-3">
              <CampoForm label="Parcial a partir de" htmlFor="corteParcial" className="w-[11rem]">
                <Input
                  id="corteParcial"
                  inputMode="numeric"
                  maxLength={3}
                  value={cortes.corteParcial}
                  onChange={(e) => setCortes({ ...cortes, corteParcial: e.target.value })}
                />
              </CampoForm>
              <CampoForm label="Compatível a partir de" htmlFor="corteCompativel" className="w-[11rem]">
                <Input
                  id="corteCompativel"
                  inputMode="numeric"
                  maxLength={3}
                  value={cortes.corteCompativel}
                  onChange={(e) => setCortes({ ...cortes, corteCompativel: e.target.value })}
                />
              </CampoForm>
            </div>
            {regua ? (
              <Regua faixas={regua} />
            ) : (
              <Aviso tom="atencao">O corte de Parcial tem de ficar abaixo do de Compatível, os dois entre 1 e 100.</Aviso>
            )}
            <p className="text-helper text-fg-muted">
              O peso vai de um a três pontos, e obrigatório pesa o dobro. Localidade não entra aqui: cidade não é avaliada pela IA, o recrutador confere.
            </p>
          </div>

          {erro && <Aviso>{erro}</Aviso>}

          <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-border">
            {requisitos && (
              <p className="mr-auto text-fs-2 text-fg-muted">
                Salvar cria a versão {requisitos.versao + 1}. As notas já dadas continuam no histórico, marcadas como de versão anterior.
              </p>
            )}
            {requisitos && (
              <Button variant="secondary" onClick={cancelar}>
                Cancelar
              </Button>
            )}
            <Button onClick={salvar} loading={salvando} disabled={salvando}>
              Salvar requisitos
            </Button>
          </div>
        </div>
      ) : requisitos ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 mb-4">
            {(["OBRIGATORIO", "DESEJAVEL"] as const).map((tipo) => (
              <ListaDeRequisitos key={tipo} tipo={tipo} itens={tipo === "OBRIGATORIO" ? listas.obrigatorios : listas.desejaveis} />
            ))}
          </div>
          {regua && (
            <div className="mb-4 max-w-2xl">
              <Regua faixas={regua} />
            </div>
          )}
          <p className="text-micro text-fg-muted mb-3">Versão {requisitos.versao} dos requisitos</p>
          {podePontuar &&
            (iaConfigurada ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={!!lote?.rodando || pendentes === 0} onClick={() => rodar("pendentes")}>
                  <Sparkles size={13} /> Pontuar pendentes ({pendentes})
                </Button>
                <Button variant="secondary" size="sm" disabled={!!lote?.rodando || emAndamento === 0} onClick={() => rodar("todas")}>
                  Reprocessar todas ({emAndamento})
                </Button>
              </div>
            ) : (
              <p className="text-fs-2 text-fg-muted">Configure a IA em Integrações para pontuar.</p>
            ))}
        </>
      ) : (
        <p className="text-ui text-fg-muted">Sem requisitos cadastrados — peça a quem gerencia a vaga.</p>
      )}

      {lote && (
        <div className="mt-3 rounded-md border border-border bg-surface-2 p-3">
          <p className="text-fs-2 font-medium text-fg">
            {lote.rodando ? "Pontuando…" : "Lote concluído"} {lote.feitas}/{lote.total}
          </p>
          <div className="h-1 rounded-full bg-border mt-1.5 overflow-hidden">
            <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${lote.total ? (lote.feitas / lote.total) * 100 : 100}%` }} />
          </div>
          {lote.log.length > 0 && (
            <ul className="mt-2 max-h-40 overflow-y-auto text-micro text-fg-muted space-y-0.5">
              {lote.log.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * Uma das duas listas. Com `onMudar`, é a edição: texto, peso nos três pontos
 * e o "×" em cada requisito, e o campo de adicionar no pé (Enter adiciona).
 * Sem, é a leitura: o texto e o peso desenhado.
 */
function ListaDeRequisitos({
  tipo,
  itens,
  onMudar,
  onRemover,
  novo = "",
  onNovo,
  onAdicionar,
  cheio = false,
}: {
  tipo: Linha["tipo"];
  itens: ItemDaLista[];
  onMudar?: (indice: number, mudanca: Partial<Linha>) => void;
  onRemover?: (indice: number) => void;
  novo?: string;
  onNovo?: (texto: string) => void;
  onAdicionar?: () => void;
  cheio?: boolean;
}) {
  const desenho = LISTAS[tipo];
  const idDoTitulo = useId();
  const editavel = !!onMudar;
  return (
    <section aria-labelledby={idDoTitulo} className={`min-w-0 rounded-lg border border-border border-t-[3px] ${desenho.filete} bg-surface p-3`}>
      <div className="flex items-baseline justify-between gap-2 px-1 pb-1.5">
        <h3 id={idDoTitulo} className={`c41-rotulo ${desenho.rotulo}`}>
          {desenho.titulo}
        </h3>
        <span className="text-micro text-fg-muted">{desenho.nota}</span>
      </div>

      {itens.length === 0 && !editavel && <p className="px-1 py-1.5 text-ui text-fg-muted">Nenhum.</p>}
      <ul className="divide-y divide-border">
        {itens.map(({ indice, linha }) => (
          <li key={indice} className="flex items-center gap-2 py-1.5 px-1">
            {editavel ? (
              <Input
                compact
                value={linha.texto}
                maxLength={300}
                onChange={(e) => onMudar(indice, { texto: e.target.value })}
                aria-label={`${tipo === "OBRIGATORIO" ? "Requisito obrigatório" : "Requisito desejável"}: texto`}
                className="min-w-0 flex-1"
              />
            ) : (
              <span className="min-w-0 flex-1 text-ui text-fg break-words">{linha.texto}</span>
            )}
            <span className="flex flex-shrink-0 items-center gap-1">
              {editavel ? (
                <PesoEmPontos valor={linha.peso} onChange={(peso) => onMudar(indice, { peso })} rotulo={`Peso de “${linha.texto || "requisito"}”`} />
              ) : (
                <PontosDoPeso valor={linha.peso} />
              )}
              <span className="w-10 text-micro text-fg-muted">{ROTULO_DO_PESO[linha.peso]}</span>
            </span>
            {onRemover && (
              <IconButton size="sm" variant="ghost" onClick={() => onRemover(indice)} aria-label={`Remover “${linha.texto || "requisito"}”`}>
                <X size={14} />
              </IconButton>
            )}
          </li>
        ))}
      </ul>

      {editavel && onNovo && onAdicionar && (
        <div className="mt-2 flex items-center gap-1.5">
          <Input
            compact
            value={novo}
            maxLength={300}
            disabled={cheio}
            onChange={(e) => onNovo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onAdicionar();
              }
            }}
            placeholder={`${desenho.adicionar} — tecle Enter`}
            aria-label={desenho.adicionar}
            className="min-w-0 flex-1"
          />
          <Button variant="secondary" size="sm" onClick={onAdicionar} disabled={cheio || !novo.trim()} aria-label={desenho.adicionar}>
            <Plus size={14} /> <span className="max-sm:sr-only">Adicionar</span>
          </Button>
        </div>
      )}
    </section>
  );
}

/** O peso desenhado, na leitura: os mesmos três pontos, sem clique. */
function PontosDoPeso({ valor }: { valor: Linha["peso"] }) {
  return (
    <span className="flex items-center gap-1 px-1" role="img" aria-label={`Peso ${valor} de ${PESOS.length}`}>
      {PESOS.map((p) => (
        <span key={p} aria-hidden className={`size-2.5 rounded-full border-[1.5px] border-brand ${p <= valor ? "bg-brand" : ""}`} />
      ))}
    </span>
  );
}

/**
 * A régua de 0 a 100 com os dois cortes: Incompatível em cinza, Parcial em
 * âmbar, Compatível em verde, e o número de cada corte em cima da marca. A
 * legenda embaixo diz o mesmo em texto — a régua é só desenho.
 */
function Regua({ faixas }: { faixas: NonNullable<ReturnType<typeof faixasDaRegua>> }) {
  const [incompativel, parcial, compativel] = faixas;
  const cor = { INCOMPATIVEL: "bg-[var(--c41-grafico-neutro)]/45", PARCIAL: "bg-warning", COMPATIVEL: "bg-success" } as const;
  return (
    <div>
      <div aria-hidden className="relative mx-2 mt-7 mb-3">
        <div className="flex h-2.5 overflow-hidden rounded-full">
          <span className={cor.INCOMPATIVEL} style={{ width: `${parcial!.de}%` }} />
          <span className={cor.PARCIAL} style={{ width: `${compativel!.de - parcial!.de}%` }} />
          <span className={cor.COMPATIVEL} style={{ width: `${100 - compativel!.de}%` }} />
        </div>
        {[parcial!.de, compativel!.de].map((n) => (
          <span
            key={n}
            className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-fg-secondary bg-surface shadow-xs"
            style={{ left: `${n}%` }}
          >
            <span className="absolute bottom-[calc(100%+3px)] left-1/2 -translate-x-1/2 text-fs-2 font-bold text-fg tnum">{n}</span>
          </span>
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-fs-2 text-fg-secondary tnum">
        {[incompativel!, parcial!, compativel!].map((f) => (
          <li key={f.faixa} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={`size-2.5 rounded-full ${cor[f.faixa]}`} />
            {f.legenda}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * O peso do requisito em três pontos (●●○): pintados até o peso escolhido.
 *
 * Cada ponto é um rádio de verdade, transparente por cima do desenho — as
 * setas do teclado trocam o peso, e o leitor de tela anuncia "Peso 2 de 3"
 * (o mesmo texto da dica, para quem passa o mouse). O alvo é de 24px, maior
 * que o ponto; o anel de foco envolve o ponto da vez.
 */
function PesoEmPontos({
  valor,
  onChange,
  rotulo,
  className = "",
}: {
  valor: Linha["peso"];
  onChange: (peso: Linha["peso"]) => void;
  rotulo: string;
  className?: string;
}) {
  const nome = useId();
  return (
    <div role="radiogroup" aria-label={rotulo} className={`flex items-center ${className}`.trim()}>
      {PESOS.map((p) => {
        const dica = `Peso ${p} de ${PESOS.length} (${ROTULO_DO_PESO[p]})`;
        return (
          <label
            key={p}
            data-dica={dica}
            className="relative inline-flex size-6 flex-shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-surface-hover has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-focus-ring"
          >
            <input
              type="radio"
              name={nome}
              value={p}
              checked={valor === p}
              onChange={() => onChange(p)}
              aria-label={dica}
              className="absolute inset-0 m-0 size-full cursor-pointer appearance-none rounded-full opacity-0"
            />
            <span
              aria-hidden
              className={`pointer-events-none size-2.5 rounded-full border-[1.5px] border-brand transition-colors ${p <= valor ? "bg-brand" : ""}`}
            />
          </label>
        );
      })}
    </div>
  );
}
