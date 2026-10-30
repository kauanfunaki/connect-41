"use client";

// O formulário da regra de conciliação e a prévia do "aplicar às pendentes"
// (fila do BPO, 21/10). Os dois servem à conciliação — a regra criada a partir
// de uma linha — e à tela das regras da empresa.

import { useEffect, useState, useTransition } from "react";
import { Pencil, Play, Pause, Trash2, ListChecks, Undo2, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Modal } from "@/components/ui/Modal";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { FormFooter } from "@/components/ui/FormFooter";
import { Aviso } from "@/components/ui/Aviso";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/useConfirm";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { ItemDoMenu } from "@/components/ui/Popover";
import { CampoDeProjeto } from "@/components/financeiro/CampoDeProjeto";
import {
  salvarRegra,
  verPreviaDaRegra,
  aplicarRegra,
  alterarRegraAtiva,
  excluirRegra,
  desfazerLancamentoPelaRegra,
} from "@/app/(app)/conciliacao/regras/actions";
import type { ItemDaPrevia } from "@/lib/financeiro/conciliacao/regrasServidor";
import type { CamposDaRegra } from "@/lib/financeiro/conciliacao/regras";
import { moeda } from "@/lib/financeiro/formato";
import { dataCurta } from "./data";

/** Os cadastros da empresa que o formulário oferece. */
export type OpcoesDaRegra = {
  contrapartes: { id: string; nome: string; documento: string | null }[];
  categorias: { id: string; nome: string; kind: "PAGAR" | "RECEBER" }[];
  centros: { id: string; nome: string }[];
  projetos: { id: string; nome: string }[];
  /** As contas com extrato da empresa. */
  contas: { id: string; nome: string }[];
};

export const CAMPOS_VAZIOS: CamposDaRegra = {
  nome: "",
  sentido: "SAIDA",
  texto: "",
  tipoDoValor: "qualquer",
  valor: "",
  valorMinimo: "",
  valorMaximo: "",
  bankAccountId: "",
  counterpartyId: "",
  categoryId: "",
  costCenterId: "",
  projectId: "",
  descricao: "",
  modo: "SUGERIR",
};

const AVISO_DO_OMIE =
  "Esta empresa ainda é lida do Omie: até a virada, a regra só sugere — o Connect não lança sozinho o que o BPO lança no Omie e a leitura traria de novo.";

/**
 * Criar ou editar uma regra. `id` vazio é regra nova. `porQue` aparece no topo
 * — "sempre que vier assim…" quando a regra nasce de uma linha conciliada.
 */
export function FormularioDaRegra({
  id,
  companyId,
  inicial,
  opcoes,
  lidaDoOmie,
  porQue,
  onClose,
  onSalva,
}: {
  id?: string;
  companyId: string;
  inicial: CamposDaRegra;
  opcoes: OpcoesDaRegra;
  lidaDoOmie: boolean;
  porQue?: React.ReactNode;
  onClose: () => void;
  onSalva?: (r: { id: string; nova: boolean; nome: string }) => void;
}) {
  const [sentido, setSentido] = useState<"SAIDA" | "ENTRADA">(inicial.sentido === "ENTRADA" ? "ENTRADA" : "SAIDA");
  const [tipoDoValor, setTipoDoValor] = useState(inicial.tipoDoValor);
  const [categoria, setCategoria] = useState(inicial.categoryId);
  const [modo, setModo] = useState<"SUGERIR" | "LANCAR">(inicial.modo === "LANCAR" ? "LANCAR" : "SUGERIR");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const kind = sentido === "SAIDA" ? "PAGAR" : "RECEBER";
  const doTipo = opcoes.categorias.filter((c) => c.kind === kind);

  function trocarSentido(s: "SAIDA" | "ENTRADA") {
    setSentido(s);
    // A categoria é de um tipo só: a de despesa não serve numa entrada.
    const k = s === "SAIDA" ? "PAGAR" : "RECEBER";
    if (!opcoes.categorias.some((c) => c.id === categoria && c.kind === k)) setCategoria("");
  }

  return (
    <Modal open onClose={() => !pendente && onClose()} title={id ? "Editar regra" : "Nova regra de conciliação"} maxWidth="max-w-2xl">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const dados = new FormData(e.currentTarget);
          setErro(null);
          startTransition(async () => {
            const r = await salvarRegra(dados);
            if ("error" in r) {
              setErro(r.error);
              return;
            }
            onSalva?.({ id: r.id, nova: r.nova, nome: String(dados.get("nome") ?? "") });
            onClose();
          });
        }}
      >
        {id && <input type="hidden" name="id" value={id} />}
        <input type="hidden" name="companyId" value={companyId} />
        {porQue && <p className="text-helper text-fg-secondary">{porQue}</p>}

        <CampoForm label="Nome da regra" htmlFor="regra-nome" required helper="É como a regra aparece na linha do extrato e no registro.">
          <Input id="regra-nome" name="nome" defaultValue={inicial.nome} maxLength={120} required />
        </CampoForm>

        <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3">
          <legend className="px-1 text-label font-semibold text-fg">Quando a linha do extrato…</legend>
          <RadioGroup
            name="sentido"
            variante="linha"
            colunas="sm:grid-cols-2"
            valor={sentido}
            onChange={trocarSentido}
            opcoes={[
              { valor: "SAIDA", rotulo: "For uma saída", descricao: "Vira conta a pagar." },
              { valor: "ENTRADA", rotulo: "For uma entrada", descricao: "Vira conta a receber." },
            ]}
          />
          <CampoForm
            label="O histórico ou o favorecido contém"
            htmlFor="regra-texto"
            helper="Sem diferença de acento nem de maiúscula. Deixe de fora a data e o número do documento, que mudam todo mês."
          >
            <Input id="regra-texto" name="texto" defaultValue={inicial.texto} maxLength={120} placeholder="Ex.: TARIFA BANCARIA" />
          </CampoForm>
          <FieldGrid columns={tipoDoValor === "faixa" ? "sm:grid-cols-3" : "sm:grid-cols-2"}>
            <CampoForm label="Valor" htmlFor="regra-tipo-do-valor">
              <Select id="regra-tipo-do-valor" name="tipoDoValor" value={tipoDoValor} onChange={(e) => setTipoDoValor(e.target.value)}>
                <option value="qualquer">Qualquer valor</option>
                <option value="exato">Valor exato</option>
                <option value="faixa">Entre dois valores</option>
              </Select>
            </CampoForm>
            {tipoDoValor === "exato" && (
              <CampoForm label="Valor exato" htmlFor="regra-valor" required>
                <Input id="regra-valor" name="valor" prefix="R$" inputMode="decimal" defaultValue={inicial.valor} required />
              </CampoForm>
            )}
            {tipoDoValor === "faixa" && (
              <>
                <CampoForm label="De" htmlFor="regra-valor-minimo">
                  <Input id="regra-valor-minimo" name="valorMinimo" prefix="R$" inputMode="decimal" defaultValue={inicial.valorMinimo} />
                </CampoForm>
                <CampoForm label="Até" htmlFor="regra-valor-maximo">
                  <Input id="regra-valor-maximo" name="valorMaximo" prefix="R$" inputMode="decimal" defaultValue={inicial.valorMaximo} />
                </CampoForm>
              </>
            )}
          </FieldGrid>
          <CampoForm label="Na conta" htmlFor="regra-conta">
            <Select id="regra-conta" name="bankAccountId" defaultValue={inicial.bankAccountId}>
              <option value="">Qualquer conta da empresa</option>
              {opcoes.contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </CampoForm>
        </fieldset>

        <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3">
          <legend className="px-1 text-label font-semibold text-fg">…lançar como</legend>
          <FieldGrid columns="sm:grid-cols-2">
            <CampoForm label={sentido === "SAIDA" ? "Fornecedor" : "Cliente (sacado)"} htmlFor="regra-contraparte" required>
              <Select id="regra-contraparte" name="counterpartyId" defaultValue={inicial.counterpartyId} required>
                <option value="" disabled>
                  Escolha…
                </option>
                {opcoes.contrapartes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                    {c.documento ? ` · ${c.documento}` : ""}
                  </option>
                ))}
              </Select>
            </CampoForm>
            <CampoForm label="Categoria" htmlFor="regra-categoria" required={sentido === "SAIDA"}>
              <Select id="regra-categoria" name="categoryId" value={categoria} onChange={(e) => setCategoria(e.target.value)} required={sentido === "SAIDA"}>
                <option value="">{sentido === "SAIDA" ? "Escolha…" : "Sem categoria"}</option>
                {doTipo.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </CampoForm>
            {opcoes.centros.length > 0 && (
              <CampoForm label="Centro de custo" htmlFor="regra-centro" helper="Em branco, herda o padrão da contraparte.">
                <Select id="regra-centro" name="costCenterId" defaultValue={inicial.costCenterId}>
                  <option value="">Padrão da contraparte</option>
                  {opcoes.centros.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </Select>
              </CampoForm>
            )}
            <CampoDeProjeto id="regra-projeto" companyId={companyId} projetos={opcoes.projetos} defaultValue={inicial.projectId} />
          </FieldGrid>
          <CampoForm label="Descrição do lançamento" htmlFor="regra-descricao" helper="Em branco, o lançamento leva o histórico do extrato.">
            <Input id="regra-descricao" name="descricao" defaultValue={inicial.descricao} maxLength={255} />
          </CampoForm>
          <p className="text-micro text-fg-muted">
            O lançamento nasce pago no dia da linha, com o valor dela e a competência do mês dela, e já conciliado.
          </p>
        </fieldset>

        <RadioGroup
          name="modo"
          legenda="O que a regra faz"
          colunas="sm:grid-cols-2"
          valor={modo}
          onChange={setModo}
          opcoes={[
            { valor: "SUGERIR", rotulo: "Sugerir", descricao: "Mostra a regra na linha do extrato; a pessoa confirma." },
            {
              valor: "LANCAR",
              rotulo: "Lançar sozinha",
              descricao: "Lança e concilia ao importar o extrato. Na dúvida — outra regra, lançamento de mesmo valor —, só sugere.",
            },
          ]}
        />
        {lidaDoOmie && modo === "LANCAR" && <Aviso tom="atencao">{AVISO_DO_OMIE}</Aviso>}

        <FormFooter pending={pendente} pendingLabel="Salvando…" submitLabel={id ? "Salvar" : "Criar regra"} onCancel={onClose} erro={erro} />
      </form>
    </Modal>
  );
}

/**
 * A prévia do "aplicar às pendentes": as linhas que a regra pegaria agora,
 * marcadas — menos as que pedem um olhar (lançamento de mesmo valor, outra
 * regra, regra já desfeita ali). Só grava no "Lançar".
 */
export function PreviaDaRegra({ id, nome, onClose }: { id: string; nome: string; onClose: () => void }) {
  const toast = useToast();
  const [itens, setItens] = useState<ItemDaPrevia[] | null>(null);
  const [limitado, setLimitado] = useState(false);
  const [lidaDoOmie, setLidaDoOmie] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [recusas, setRecusas] = useState<string[]>([]);
  const [pendente, startTransition] = useTransition();

  useEffect(() => {
    let vivo = true;
    verPreviaDaRegra(id).then((r) => {
      if (!vivo) return;
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      setItens(r.itens);
      setLimitado(r.limitado);
      setLidaDoOmie(r.lidaDoOmie);
      setMarcadas(new Set(r.itens.filter((i) => !pedeOlhar(i)).map((i) => i.transactionId)));
    });
    return () => {
      vivo = false;
    };
  }, [id]);

  function alternar(t: string) {
    setMarcadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(t)) novo.delete(t);
      else novo.add(t);
      return novo;
    });
  }

  const total = (itens ?? []).filter((i) => marcadas.has(i.transactionId)).reduce((a, i) => a + Math.abs(i.centavos), 0);

  return (
    <Modal open onClose={() => !pendente && onClose()} title={`Aplicar “${nome}” às pendentes`} maxWidth="max-w-3xl">
      <div className="flex flex-col gap-4">
        <p className="text-helper text-fg-secondary">
          As linhas pendentes do extrato que a regra pega agora. Nada foi gravado: confira, desmarque o que não for, e lance. Cada
          linha marcada vira um lançamento pago e conciliado.
        </p>
        {lidaDoOmie && <Aviso tom="atencao">Esta empresa ainda é lida do Omie: lance aqui só o que o BPO não vai lançar no Omie.</Aviso>}
        <div className="max-h-[380px] overflow-y-auto border border-border rounded-md">
          {itens === null && !erro ? (
            <p className="p-3 text-fs-2 text-fg-muted">Carregando…</p>
          ) : itens && itens.length === 0 ? (
            <p className="p-3 text-fs-2 text-fg-muted">Nenhuma linha pendente pega esta regra agora. As próximas, ela pega quando o extrato chegar.</p>
          ) : (
            <table className="w-full text-ui">
              <tbody>
                {(itens ?? []).map((i) => {
                  const campo = `previa-${i.transactionId}`;
                  return (
                    <tr key={i.transactionId} className="border-b border-border-soft align-top">
                      <td className="py-2 px-3 w-8">
                        <Checkbox id={campo} checked={marcadas.has(i.transactionId)} onChange={() => alternar(i.transactionId)} />
                      </td>
                      <td className="py-2 pr-3">
                        <label htmlFor={campo} className="cursor-pointer">
                          <span className="text-fg">{[i.nome, i.memo].filter(Boolean).join(" · ") || "Sem descrição no extrato"}</span>
                          <span className="block text-micro text-fg-muted">
                            {dataCurta(i.dataKey)} · {i.contaNome}
                          </span>
                          {pedeOlhar(i) && <span className="block text-micro text-warning-fg">{porQueOlhar(i)}</span>}
                        </label>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{moeda(i.centavos)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {limitado && <p className="text-micro text-fg-muted">Mostrando as 500 mais antigas. Aplique e abra a prévia de novo para as seguintes.</p>}
        {recusas.length > 0 && (
          <Aviso tom="atencao">
            <span className="flex flex-col gap-0.5">
              <span>Algumas linhas não foram lançadas:</span>
              {recusas.map((r) => (
                <span key={r}>{r}</span>
              ))}
            </span>
          </Aviso>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            setRecusas([]);
            startTransition(async () => {
              const r = await aplicarRegra(id, [...marcadas]);
              if ("error" in r) {
                setErro(r.error);
                return;
              }
              if (r.lancadas > 0) toast.success(`${r.lancadas} ${r.lancadas === 1 ? "linha lançada e conciliada" : "linhas lançadas e conciliadas"}.`);
              if (r.recusas.length > 0) {
                setRecusas(r.recusas);
                const de = await verPreviaDaRegra(id);
                if ("ok" in de) {
                  setItens(de.itens);
                  setMarcadas(new Set());
                }
              } else onClose();
            });
          }}
        >
          <FormFooter
            pending={pendente}
            pendingLabel="Lançando…"
            submitLabel={marcadas.size > 0 ? `Lançar ${marcadas.size}` : "Lançar"}
            cancelLabel="Fechar"
            onCancel={onClose}
            submitDisabled={marcadas.size === 0}
            erro={erro}
            nota={marcadas.size > 0 ? <span className="tabular-nums">Marcado: {moeda(total)}</span> : undefined}
          />
        </form>
      </div>
    </Modal>
  );
}

function pedeOlhar(i: ItemDaPrevia): boolean {
  return i.candidatosDeMesmoValor > 0 || i.outrasRegras > 0 || i.desfeita;
}

function porQueOlhar(i: ItemDaPrevia): string {
  const motivos: string[] = [];
  if (i.candidatosDeMesmoValor > 0) {
    motivos.push(
      i.candidatosDeMesmoValor === 1 ? "Há um lançamento em aberto de mesmo valor — pode ser ele." : `Há ${i.candidatosDeMesmoValor} lançamentos em aberto de mesmo valor.`
    );
  }
  if (i.outrasRegras > 0) motivos.push(i.outrasRegras === 1 ? "Outra regra também pega esta linha." : `Outras ${i.outrasRegras} regras também pegam esta linha.`);
  if (i.desfeita) motivos.push("Esta regra já lançou aqui e alguém desfez.");
  return `${motivos.join(" ")} Desmarcada.`;
}

// ─── Os botões da tela das regras ───────────────────────────────────────────

/** "Nova regra", no cabeçalho da tela das regras. Criada, abre a prévia. */
export function NovaRegra({ companyId, opcoes, lidaDoOmie }: { companyId: string; opcoes: OpcoesDaRegra; lidaDoOmie: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [previa, setPrevia] = useState<{ id: string; nome: string } | null>(null);
  return (
    <>
      <Button onClick={() => setAberto(true)}>
        <Plus size={14} /> Nova regra
      </Button>
      {aberto && (
        <FormularioDaRegra
          companyId={companyId}
          inicial={CAMPOS_VAZIOS}
          opcoes={opcoes}
          lidaDoOmie={lidaDoOmie}
          onClose={() => setAberto(false)}
          onSalva={(r) => setPrevia({ id: r.id, nome: r.nome })}
        />
      )}
      {previa && <PreviaDaRegra id={previa.id} nome={previa.nome} onClose={() => setPrevia(null)} />}
    </>
  );
}

/** Editar, aplicar às pendentes, pausar ou retomar, excluir — na linha da regra. */
export function AcoesDaRegra({
  id,
  nome,
  ativa,
  campos,
  companyId,
  opcoes,
  lidaDoOmie,
}: {
  id: string;
  nome: string;
  ativa: boolean;
  campos: CamposDaRegra;
  companyId: string;
  opcoes: OpcoesDaRegra;
  lidaDoOmie: boolean;
}) {
  const toast = useToast();
  const { dialog, requestConfirm } = useConfirm();
  const [editando, setEditando] = useState(false);
  const [previa, setPrevia] = useState(false);
  const [pendente, startTransition] = useTransition();

  // "Editar" à vista e o resto no "⋯" (auditoria de UX, 30/10/2026): eram quatro
  // botões por regra, com o Excluir vermelho em toda linha. Pausar e retomar
  // passaram a confirmar com aviso — antes a regra mudava sem retorno.
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button size="xs" variant="secondary" onClick={() => setEditando(true)}>
        <Pencil size={12} /> Editar
      </Button>
      <MenuDeMaisAcoes rotulo={`Mais ações da regra ${nome}`} width={200} sempreMenu>
        {({ close }) => (
          <>
            <ItemDoMenu icone={<ListChecks />} onClick={() => { close(); setPrevia(true); }}>
              Aplicar às pendentes
            </ItemDoMenu>
            <ItemDoMenu
              icone={ativa ? <Pause /> : <Play />}
              disabled={pendente}
              onClick={() => {
                close();
                startTransition(async () => {
                  const r = await alterarRegraAtiva(id, !ativa);
                  if ("error" in r) toast.error(r.error);
                  else toast.success(ativa ? `“${nome}” pausada: deixa de sugerir e de lançar.` : `“${nome}” retomada.`);
                });
              }}
            >
              {ativa ? "Pausar" : "Retomar"}
            </ItemDoMenu>
            <ItemDoMenu
              icone={<Trash2 />}
              danger
              onClick={() => {
                close();
                requestConfirm(
                  {
                    title: "Excluir a regra?",
                    description: `“${nome}” deixa de sugerir e de lançar. O que ela já lançou fica — para tirar um lançamento, desfaça no registro abaixo.`,
                    confirmLabel: "Excluir",
                    destructive: true,
                  },
                  async () => {
                    const r = await excluirRegra(id);
                    if ("error" in r) throw new Error(r.error);
                  }
                );
              }}
            >
              Excluir
            </ItemDoMenu>
          </>
        )}
      </MenuDeMaisAcoes>
      {dialog}
      {editando && (
        <FormularioDaRegra id={id} companyId={companyId} inicial={campos} opcoes={opcoes} lidaDoOmie={lidaDoOmie} onClose={() => setEditando(false)} />
      )}
      {previa && <PreviaDaRegra id={id} nome={nome} onClose={() => setPrevia(false)} />}
    </div>
  );
}

/** Desfazer o que uma regra lançou — no registro e na linha conciliada pela regra. */
export function DesfazerDaRegra({ applicationId, nome, rotulo = "Desfazer" }: { applicationId: string; nome: string; rotulo?: string }) {
  const { dialog, requestConfirm } = useConfirm();
  return (
    <>
      <Button
        size="xs"
        variant="secondary"
        onClick={() =>
          requestConfirm(
            {
              title: "Desfazer o que a regra lançou?",
              description: `O lançamento que “${nome}” criou é cancelado, e a linha do extrato volta às pendentes. A regra não lança sozinha de novo nesta linha.`,
              confirmLabel: "Desfazer",
              destructive: true,
            },
            async () => {
              const r = await desfazerLancamentoPelaRegra(applicationId);
              if ("error" in r) throw new Error(r.error);
            }
          )
        }
      >
        <Undo2 size={12} /> {rotulo}
      </Button>
      {dialog}
    </>
  );
}
