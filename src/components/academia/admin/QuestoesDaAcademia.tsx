"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, Pencil, Plus, Puzzle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { Selo } from "@/components/ui/Selo";
import { Aviso } from "@/components/ui/Aviso";
import { EmptyState } from "@/components/ui/EmptyState";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { CartoesNoCelular, Cartao, TabelaNoDesktop } from "@/components/shared/ListaResponsiva";
import { useToast } from "@/components/ui/Toast";
import { salvarQuestaoAction } from "@/app/(app)/academia/actions";
import { NIVEIS, ROTULO_DO_NIVEL, type Nivel } from "@/lib/academia/regras";
import { MAXIMO_DE_ALTERNATIVAS, MINIMO_DE_ALTERNATIVAS, TAMANHO_DA_ALTERNATIVA, TAMANHO_DO_ENUNCIADO, letraDaAlternativa } from "@/lib/academia/logica";
import type { QuestaoNaTela } from "@/lib/academia/tipos";
import { CampoDeImagem } from "./CampoDeImagem";
import { AtivoNaLinha, AtivosPorNivel, FiltrosDoBanco, SEM_FILTRO, filtrar } from "./FiltrosDoBanco";

type AlternativaNoRascunho = { texto: string; imagemUrl: string | null };
type Rascunho = { id?: string; nivel: Nivel; enunciado: string; imagemUrl: string | null; alternativas: AlternativaNoRascunho[]; correta: number; ativo: boolean };

const NOVA: Rascunho = {
  nivel: "medio", enunciado: "", imagemUrl: null, correta: 0, ativo: true,
  alternativas: [{ texto: "", imagemUrl: null }, { texto: "", imagemUrl: null }, { texto: "", imagemUrl: null }, { texto: "", imagemUrl: null }],
};

const doCadastro = (q: QuestaoNaTela): Rascunho => ({
  id: q.id, nivel: q.nivel, enunciado: q.enunciado, imagemUrl: q.imagemUrl, correta: q.correta, ativo: q.ativo,
  alternativas: q.alternativas.map((a) => ({ texto: a.texto ?? "", imagemUrl: a.imagemUrl ?? null })),
});

/**
 * As questões de lógica (10/11/2026, pedido do Kauan): enunciado, imagem no
 * enunciado e, se quiser, em cada alternativa (texto, imagem ou os dois),
 * a certa, o nível e se está ativa. Não se exclui questão — desliga.
 */
export function QuestoesDaAcademia({ questoes }: { questoes: QuestaoNaTela[] }) {
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [filtro, setFiltro] = useState(SEM_FILTRO);
  const [erro, setErro] = useState("");
  const [salvando, iniciar] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const mudar = (parcial: Partial<Rascunho>) => setRascunho((r) => (r ? { ...r, ...parcial } : r));
  const mudarAlternativa = (i: number, parcial: Partial<AlternativaNoRascunho>) =>
    setRascunho((r) => (r ? { ...r, alternativas: r.alternativas.map((a, j) => (j === i ? { ...a, ...parcial } : a)) } : r));
  function tirarAlternativa(i: number) {
    setRascunho((r) => {
      if (!r) return r;
      const correta = r.correta === i ? 0 : r.correta > i ? r.correta - 1 : r.correta;
      return { ...r, alternativas: r.alternativas.filter((_, j) => j !== i), correta };
    });
  }

  function salvar(e: React.SyntheticEvent, outra = false) {
    e.preventDefault();
    if (!rascunho) return;
    setErro("");
    iniciar(async () => {
      const r = await salvarQuestaoAction(rascunho);
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      toast.success(rascunho.id ? "Questão atualizada." : "Questão cadastrada.");
      // A próxima nasce no mesmo nível (melhoria-823): quem cadastra em série cadastra um nível de cada vez.
      setRascunho(outra ? { ...NOVA, nivel: rascunho.nivel } : null);
      router.refresh();
    });
  }

  const nova = (
    <Button size="sm" onClick={() => setRascunho(NOVA)} className="min-h-11 sm:min-h-0">
      <Plus size={14} aria-hidden /> Nova questão
    </Button>
  );
  const temImagem = (q: QuestaoNaTela) => Boolean(q.imagemUrl) || q.alternativas.some((a) => a.imagemUrl);
  const visiveis = filtrar(questoes, filtro);
  const detalhe = (q: QuestaoNaTela) =>
    [`${q.alternativas.length} alternativas`, temImagem(q) ? "com imagem" : null, q.doHub ? "veio do 41 Hub" : null].filter(Boolean).join(" · ");
  const ativa = (q: QuestaoNaTela) => (
    <AtivoNaLinha
      key={`${q.id}-${q.ativo}`}
      ativo={q.ativo}
      rotulo={`Questão ${ROTULO_DO_NIVEL[q.nivel]}: ${q.enunciado.slice(0, 40)}`}
      salvar={(ligado) => salvarQuestaoAction({ ...doCadastro(q), ativo: ligado })}
      aoSalvar={() => router.refresh()}
    />
  );

  return (
    <>
      {questoes.length === 0 ? (
        <EmptyState icon={<Puzzle />} title="Nenhuma questão ainda" description="Cadastre questões de cada nível para o teste de lógica. As do 41 Hub entram pela importação." action={nova} />
      ) : (
        <CascoDaTabela
          contagem={contarItens(visiveis.length, "questão", "questões")}
          total={<AtivosPorNivel itens={questoes} />}
          filtros={<FiltrosDoBanco filtro={filtro} onChange={setFiltro} feminino />}
          acoes={nova}
        >
          <TabelaNoDesktop padrao>
            <table className="w-full min-w-[680px]">
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="py-2 pr-3 w-24">Nível</th>
                  <th scope="col" className="py-2 pr-3">Enunciado</th>
                  <th scope="col" className="py-2 pr-3 w-20">Certa</th>
                  <th scope="col" className="py-2 pr-3 w-16">Ativa</th>
                  <th scope="col" className="py-2 pr-3 w-12"><span className="sr-only">Editar</span></th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((q) => (
                  <tr key={q.id} className={`border-b border-border-soft ${q.ativo ? "" : "text-fg-muted"}`}>
                    <td className="py-1.5 pr-3 text-ui">{ROTULO_DO_NIVEL[q.nivel]}</td>
                    <td className="max-w-0 py-1.5 pr-3 text-ui text-fg-secondary" title={detalhe(q)}>
                      <span className="flex min-w-0 items-center gap-1.5">
                        {temImagem(q) && <ImageIcon size={13} aria-label="com imagem" className="flex-shrink-0 text-fg-muted" />}
                        <span className="truncate">{q.enunciado}</span>
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-ui tabular-nums">{letraDaAlternativa(q.correta)} de {q.alternativas.length}</td>
                    <td className="py-1.5 pr-3">{ativa(q)}</td>
                    <td className="py-1.5 pr-3 text-right">
                      <IconButton title="Editar questão" onClick={() => setRascunho(doCadastro(q))}>
                        <Pencil size={14} />
                      </IconButton>
                    </td>
                  </tr>
                ))}
                {visiveis.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-ui text-fg-muted">Nenhuma questão neste filtro.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </TabelaNoDesktop>
          <CartoesNoCelular>
            {visiveis.map((q) => (
              <Cartao key={q.id}>
                <div className="flex items-center justify-between gap-2">
                  <Selo tom={q.ativo ? "sucesso" : "neutro"}>{ROTULO_DO_NIVEL[q.nivel]}</Selo>
                  {ativa(q)}
                </div>
                <p className="mt-1 line-clamp-2 text-ui text-fg-secondary">{q.enunciado}</p>
                <Button size="sm" variant="secondary" className="mt-2 min-h-11" onClick={() => setRascunho(doCadastro(q))}>
                  <Pencil size={14} aria-hidden /> Editar
                </Button>
              </Cartao>
            ))}
          </CartoesNoCelular>
        </CascoDaTabela>
      )}

      <Modal open={rascunho !== null} onClose={() => setRascunho(null)} title={rascunho?.id ? "Editar questão" : "Nova questão"} maxWidth="max-w-2xl">
        {rascunho && (
          <form onSubmit={salvar} className="flex flex-col gap-4">
            <CampoForm label="Nível" htmlFor="questao-nivel" required>
              <Select id="questao-nivel" value={rascunho.nivel} onChange={(e) => mudar({ nivel: e.target.value as Nivel })}>
                {NIVEIS.map((n) => (
                  <option key={n} value={n}>{ROTULO_DO_NIVEL[n]}</option>
                ))}
              </Select>
            </CampoForm>
            <CampoForm label="Enunciado" htmlFor="questao-enunciado" required dica="Descreva no texto o que a imagem mostra: é o que o leitor de tela lê.">
              <Textarea id="questao-enunciado" rows={4} maxLength={TAMANHO_DO_ENUNCIADO} value={rascunho.enunciado} onChange={(e) => mudar({ enunciado: e.target.value })} />
            </CampoForm>
            <div className="flex flex-col gap-1.5">
              <span className="text-label font-medium text-fg">Imagem do enunciado</span>
              <CampoDeImagem url={rascunho.imagemUrl} onMudar={(imagemUrl) => mudar({ imagemUrl })} rotulo="Imagem do enunciado" />
            </div>

            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 text-label font-medium text-fg">Alternativas</legend>
              {rascunho.alternativas.map((a, i) => {
                const letra = letraDaAlternativa(i);
                return (
                  <div key={i} className={`flex flex-col gap-2 rounded-md border p-3 ${rascunho.correta === i ? "border-success/40 bg-success/8" : "border-border"}`}>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-ui font-medium">
                        {letra} {rascunho.correta === i && <span className="text-success-fg">· a certa</span>}
                      </span>
                      {rascunho.alternativas.length > MINIMO_DE_ALTERNATIVAS && (
                        <IconButton title={`Tirar a alternativa ${letra}`} className="ml-auto" onClick={() => tirarAlternativa(i)}>
                          <Trash2 size={14} />
                        </IconButton>
                      )}
                    </div>
                    <Input
                      aria-label={`Texto da alternativa ${letra}`}
                      placeholder="Texto (opcional se houver imagem)"
                      maxLength={TAMANHO_DA_ALTERNATIVA}
                      value={a.texto}
                      onChange={(e) => mudarAlternativa(i, { texto: e.target.value })}
                    />
                    <CampoDeImagem url={a.imagemUrl} onMudar={(imagemUrl) => mudarAlternativa(i, { imagemUrl })} rotulo={`Imagem da alternativa ${letra}`} />
                  </div>
                );
              })}
              {rascunho.alternativas.length < MAXIMO_DE_ALTERNATIVAS && (
                <Button type="button" size="sm" variant="secondary" className="self-start min-h-11 sm:min-h-0" onClick={() => mudar({ alternativas: [...rascunho.alternativas, { texto: "", imagemUrl: null }] })}>
                  <Plus size={14} aria-hidden /> Alternativa
                </Button>
              )}
            </fieldset>

            <RadioGroup<string>
              legenda="Alternativa certa"
              variante="linha"
              classeDasOpcoes="flex flex-wrap gap-x-5 gap-y-2"
              valor={String(rascunho.correta)}
              onChange={(v) => mudar({ correta: Number(v) })}
              opcoes={rascunho.alternativas.map((_, i) => ({ valor: String(i), rotulo: letraDaAlternativa(i) }))}
            />

            <Switch checked={rascunho.ativo} onCheckedChange={(ativo) => mudar({ ativo })} rotulo="Ativa (entra no sorteio das rodadas)" />
            {erro && <Aviso>{erro}</Aviso>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setRascunho(null)}>Cancelar</Button>
              {!rascunho.id && (
                <Button type="button" variant="secondary" disabled={salvando} onClick={(e) => salvar(e, true)}>
                  Salvar e cadastrar outra
                </Button>
              )}
              <Button type="submit" loading={salvando}>Salvar</Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
