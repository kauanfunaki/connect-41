"use client";

import { useActionState, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Building2, Check, Plus, Search, Send, TriangleAlert, User, X } from "lucide-react";
import type { CampoDaTransferencia, HandoffState } from "@/app/(app)/transferencias/actions";
import type { EntityType, HandoffPriority } from "@/generated/prisma/enums";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { CampoData } from "@/components/ui/CampoData";
import { Aviso } from "@/components/ui/Aviso";
import { Selo } from "@/components/ui/Selo";
import { SectorChip } from "@/components/ui/SectorChip";
import { SeletorDeSetores } from "@/components/ui/SeletorDeSetores";
import { Stepper, type StepDef } from "@/components/ui/Stepper";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { useConfirm } from "@/components/ui/useConfirm";
import { SearchableSelect, type Opcao } from "@/components/shared/SearchableSelect";
import { MentionTextarea, type MentionUser } from "@/components/transferencias/MentionTextarea";
import { SectorAssigneePicker } from "@/components/transferencias/SectorAssigneePicker";
import { ASSUNTO_MAXIMO, HANDOFF_PRIORITY_LABEL, HANDOFF_PRIORITY_OPTIONS, HANDOFF_PRIORITY_TOM } from "@/lib/handoffs";
import { doSetor } from "@/lib/handoffTransicoes";
import {
  TAREFA_MAXIMA,
  TAREFAS_POR_SETOR,
  getHandoffTemplate,
  normalizarTexto,
  setoresDoModelo,
  type CampoDoModelo,
  type HandoffTemplate,
} from "@/lib/handoffTemplates";
import { formatCnpj } from "@/lib/format";

type FixedEntity = { entityType: EntityType; entityId: string; entityName: string; entityCnpj?: string | null };

type OpcaoDeSetor = { value: string; label: string; color: string };

type Props = {
  action: (prev: HandoffState, form: FormData) => Promise<HandoffState>;
  /** Setores de onde a pessoa pode pedir (os que ela coordena; todos, para o administrador). */
  fromSectorOptions: { value: string; label: string }[];
  /** A origem já escolhida: o setor ativo, ou o único setor da pessoa. */
  fromSectorInicial?: string;
  toSectorOptions: OpcaoDeSetor[];
  cancelHref: string;
  fixedEntity?: FixedEntity;
  /**
   * A busca de empresa ou pessoa no servidor (13/11/2026, melhoria-662): a
   * página mandava todas as empresas e pessoas do escritório para o seletor.
   */
  buscarEntidades?: (tipo: EntityType, termo: string, incluir: string[]) => Promise<{ opcoes: Opcao[]; incluidas: Opcao[] }>;
  mentionUsers?: MentionUser[];
  /** Membros elegíveis como responsável por setor de destino (setor + admins do tenant). */
  assigneeOptionsBySector?: Record<string, MentionUser[]>;
  /** Preenchimento inicial — a transferência sugerida pelo chat de IA. */
  inicial?: { toSectors: string[]; description: string };
  /** As chaves dos 16 modelos, do mais usado no escritório para o menos. */
  ordemDosModelos: string[];
};

const PASSOS = ["Empresa e assunto", "Setores e tarefas", "Revisar e enviar"] as const;
/** Quantos blocos de assunto aparecem antes do "Ver os outros". */
const MODELOS_A_VISTA = 6;

// Em que passo mora cada campo: o erro do servidor volta a pessoa para ele.
const PASSO_DO_CAMPO: Record<Exclude<CampoDaTransferencia, "geral">, number> = {
  entidade: 0,
  assunto: 0,
  prioridade: 0,
  origem: 1,
  setores: 1,
};

type Erros = Partial<Record<CampoDaTransferencia, string>>;

const mesmaLista = (a: readonly string[] = [], b: readonly string[] = []) => a.length === b.length && a.every((x, i) => x === b[i]);

/** O texto da coordenação que decide, com o artigo do setor: "A coordenação do Fiscal decide". */
const coordenacaoDecide = (setor: string) => `A coordenação ${doSetor(setor)} decide`;

/**
 * A nova transferência em três passos centralizados num cartão (10/11/2026,
 * escolha "B · Três passos no cartão" do Kauan). Desde 17/11/2026
 * (melhoria-705, escolhas "A · Blocos com os setores e busca" e "A · Tarefas
 * marcáveis e a coordenação como responsável"):
 * 1. a empresa ou pessoa e o assunto em blocos, cada um com os setores que o
 *    modelo marca, com busca entre os 16; a prioridade fica na linha dos botões;
 * 2. os setores que recebem, o que o modelo precisa saber (as perguntas que
 *    ficavam entre colchetes no texto) e, por setor, as tarefas e o responsável
 *    — ou "A coordenação do setor decide";
 * 3. a revisão do que cada setor vai receber e o "Enviar".
 *
 * Tudo mora no estado deste componente, e o que vai para o servidor sai dos
 * campos escondidos no fim do formulário: cada passo aparece só quando é a
 * vez dele, e nada se perde ao voltar.
 */
export function HandoffForm({
  action,
  fromSectorOptions,
  fromSectorInicial,
  toSectorOptions,
  cancelHref,
  fixedEntity,
  buscarEntidades,
  mentionUsers = [],
  assigneeOptionsBySector = {},
  inicial,
  ordemDosModelos,
}: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [passo, setPasso] = useState(0);
  const [erros, setErros] = useState<Erros>({});

  const [entityType, setEntityType] = useState<EntityType>(fixedEntity?.entityType ?? "COMPANY");
  const [entityId, setEntityId] = useState(fixedEntity?.entityId ?? "");
  const [modelo, setModelo] = useState("");
  const [outroAssunto, setOutroAssunto] = useState(false);
  const [assuntoLivre, setAssuntoLivre] = useState("");
  const [verTodos, setVerTodos] = useState(false);
  const [busca, setBusca] = useState("");
  const [prioridade, setPrioridade] = useState<HandoffPriority>("MEDIUM");
  const [fromSector, setFromSector] = useState(
    fromSectorInicial && fromSectorOptions.some((s) => s.value === fromSectorInicial)
      ? fromSectorInicial
      : fromSectorOptions.length === 1
        ? fromSectorOptions[0].value
        : ""
  );
  const [selectedSectors, setSelectedSectors] = useState<string[]>(inicial?.toSectors ?? []);
  const [tarefas, setTarefas] = useState<Record<string, string[]>>({});
  const [novaTarefa, setNovaTarefa] = useState<Record<string, string>>({});
  // As tarefas que o modelo pôs: trocar de modelo só substitui sem perguntar o
  // que a pessoa não mexeu.
  const [tarefasDoModelo, setTarefasDoModelo] = useState<Record<string, string[]>>({});
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [assignees, setAssignees] = useState<Record<string, string[]>>({});
  const [description, setDescription] = useState(inicial?.description ?? "");
  const { dialog: templateConfirmDialog, requestConfirm: requestTemplateConfirm } = useConfirm();

  // O erro do servidor leva ao passo do campo que o causou (ajustado durante a
  // renderização, como no Accordion, e não num efeito).
  const [estadoVisto, setEstadoVisto] = useState<HandoffState>(null);
  // Mexer no campo do erro do servidor apaga a frase dele.
  const [erroDispensado, setErroDispensado] = useState(false);
  if (state !== estadoVisto) {
    setEstadoVisto(state);
    setErroDispensado(false);
    if (state?.campo && state.campo !== "geral") setPasso(PASSO_DO_CAMPO[state.campo]);
  }
  const erroDoServidor = state?.error && !erroDispensado ? { campo: state.campo ?? "geral", texto: state.error } : null;
  const erroDe = (campo: CampoDaTransferencia) => erros[campo] ?? (erroDoServidor?.campo === campo ? erroDoServidor.texto : undefined);

  // A empresa ou pessoa escolhida no seletor: o nome e o CNPJ vêm da opção
  // (empresa com logo, CNPJ, filial e recentes; pessoa com a foto), que a
  // busca no servidor devolve — a página não manda mais a lista inteira.
  const [escolhida, setEscolhida] = useState<{ id: string; name: string; cnpj: string | null } | null>(null);
  const buscarDoTipo = useMemo(
    () => (buscarEntidades ? (termo: string, incluir: string[]) => buscarEntidades(entityType, termo, incluir) : undefined),
    [buscarEntidades, entityType]
  );

  const modelos = useMemo(
    () => ordemDosModelos.map((k) => getHandoffTemplate(k)).filter((t): t is HandoffTemplate => Boolean(t)),
    [ordemDosModelos]
  );
  const setoresPorModelo = useMemo(
    () => Object.fromEntries(modelos.map((t) => [t.key, setoresDoModelo(t.key, toSectorOptions)])),
    [modelos, toSectorOptions]
  );
  const termo = normalizarTexto(busca);
  const buscando = termo.length > 0;
  // Buscando, todos os que casam; senão os seis primeiros, e o escolhido junto
  // quando ele está mais para baixo.
  const modelosVisiveis = buscando
    ? modelos.filter((t) => normalizarTexto(t.label).includes(termo))
    : verTodos
      ? modelos
      : [...modelos.slice(0, MODELOS_A_VISTA), ...modelos.slice(MODELOS_A_VISTA).filter((t) => t.key === modelo)];
  const escondidos = modelos.length - modelosVisiveis.length;
  const rotuloDoSetor = (code: string) => toSectorOptions.find((s) => s.value === code)?.label ?? code;
  const corDoSetor = (code: string) => toSectorOptions.find((s) => s.value === code)?.color ?? "#586577";

  const destinationOptions = toSectorOptions.filter((s) => s.value !== fromSector);
  const selectedInOrder = destinationOptions.filter((s) => selectedSectors.includes(s.value));
  const origemFixa = fromSectorOptions.length === 1;
  const modeloEscolhido = modelo ? getHandoffTemplate(modelo) : undefined;
  const campos = modeloEscolhido?.campos ?? [];

  function limparErro(campo: CampoDaTransferencia) {
    if (erroDoServidor?.campo === campo) setErroDispensado(true);
    setErros((e) => {
      if (!e[campo]) return e;
      const resto = { ...e };
      delete resto[campo];
      return resto;
    });
  }

  // O modelo marca os setores e põe as tarefas de cada um. As tarefas que o
  // modelo anterior pôs e a pessoa não mexeu saem junto com ele.
  function aplicarModelo(key: string) {
    const doModelo = setoresDoModelo(key, toSectorOptions);
    const porSetor = Object.fromEntries(doModelo.map((s) => [s.setor, s.tarefas]));
    if (doModelo.length > 0) setSelectedSectors(doModelo.map((s) => s.setor));
    setTarefas((atuais) => {
      const proximas = { ...atuais };
      for (const [code, lista] of Object.entries(tarefasDoModelo)) if (mesmaLista(proximas[code], lista)) delete proximas[code];
      return { ...proximas, ...porSetor };
    });
    setTarefasDoModelo(porSetor);
  }

  function escolherModelo(key: string) {
    limparErro("assunto");
    if (key === modelo) return;
    const mexeuNasTarefas = Object.entries(tarefas).some(([code, lista]) => lista.length > 0 && !mesmaLista(lista, tarefasDoModelo[code]));
    const trocar = () => {
      setOutroAssunto(false);
      setModelo(key);
      aplicarModelo(key);
    };
    if (mexeuNasTarefas) {
      requestTemplateConfirm(
        {
          title: "Trocar as tarefas pelas do modelo?",
          description: "Você já mexeu nas tarefas dos setores. O modelo põe as tarefas dele no lugar.",
          confirmLabel: "Trocar",
        },
        async () => trocar()
      );
      return;
    }
    trocar();
  }

  function escolherOutroAssunto() {
    limparErro("assunto");
    setModelo("");
    setOutroAssunto(true);
  }

  function trocarEntidade(id: string, opcao?: Opcao) {
    limparErro("entidade");
    setEntityId(id);
    // O CNPJ da empresa é a descrição da opção, já formatado.
    setEscolhida(id && opcao ? { id, name: opcao.label, cnpj: entityType === "COMPANY" ? (opcao.descricao ?? null) : null } : null);
  }

  // O seletor devolve os destinos marcados; o que estava marcado fora deles (o
  // setor que hoje é a origem) fica guardado, como nas pílulas de antes.
  function escolherSetores(destinos: string[]) {
    limparErro("setores");
    setSelectedSectors((atuais) => [...atuais.filter((c) => !destinationOptions.some((s) => s.value === c)), ...destinos]);
  }

  function acrescentarTarefa(code: string) {
    const texto = (novaTarefa[code] ?? "").replace(/\s+/g, " ").trim();
    if (!texto) return;
    setTarefas((atuais) => {
      const lista = atuais[code] ?? [];
      if (lista.length >= TAREFAS_POR_SETOR || lista.some((t) => t.toLowerCase() === texto.toLowerCase())) return atuais;
      return { ...atuais, [code]: [...lista, texto] };
    });
    setNovaTarefa((atuais) => ({ ...atuais, [code]: "" }));
  }

  function tirarTarefa(code: string, indice: number) {
    setTarefas((atuais) => ({ ...atuais, [code]: (atuais[code] ?? []).filter((_, i) => i !== indice) }));
  }

  const assuntoEscolhido = modeloEscolhido ? modeloEscolhido.label : outroAssunto ? assuntoLivre.replace(/\s+/g, " ").trim() : "";

  function errosDoPasso(p: number): Erros {
    const e: Erros = {};
    if (p === 0) {
      if (!entityId) e.entidade = `Escolha ${entityType === "COMPANY" ? "a empresa" : "a pessoa"}.`;
      if (!assuntoEscolhido) e.assunto = outroAssunto ? "Escreva o assunto." : "Escolha um assunto ou escreva o seu em “Outro assunto”.";
    }
    if (p === 1) {
      if (!fromSector) e.origem = "Escolha o setor que pede a transferência.";
      if (selectedInOrder.length === 0) e.setores = "Escolha pelo menos um setor para receber.";
    }
    return e;
  }

  function continuar() {
    const e = errosDoPasso(passo);
    setErros(e);
    if (Object.keys(e).length === 0) setPasso((p) => Math.min(PASSOS.length - 1, p + 1));
  }

  const passos: StepDef[] = PASSOS.map((label, i) => {
    const comErro = erroDoServidor && erroDoServidor.campo !== "geral" && PASSO_DO_CAMPO[erroDoServidor.campo] === i && i !== passo;
    return { label, status: comErro ? "error" : i < passo ? "done" : i === passo ? "current" : "upcoming" };
  });

  const nomeDaEntidade = fixedEntity ? fixedEntity.entityName : escolhida?.name;
  const cnpjDaEntidade = fixedEntity ? (fixedEntity.entityCnpj ? formatCnpj(fixedEntity.entityCnpj) : null) : escolhida?.cnpj;
  const ehEmpresa = (fixedEntity?.entityType ?? entityType) === "COMPANY";
  const nomeDoResponsavel = (code: string, id: string) => assigneeOptionsBySector[code]?.find((u) => u.id === id)?.name ?? null;
  const nomesDosResponsaveis = (code: string) =>
    (assignees[code] ?? []).map((id) => nomeDoResponsavel(code, id)).filter((n): n is string => Boolean(n));
  const respostasPreenchidas = campos
    .map((c) => ({ campo: c, valor: (respostas[c.chave] ?? "").trim() }))
    .filter((r) => r.valor || (r.campo.deCadastro && ehEmpresa));

  const blocoDeAcao = "flex min-h-11 flex-col items-start justify-center gap-0.5 rounded-lg border border-dashed border-border-strong bg-surface px-3 py-2.5 text-left transition-colors hover:border-brand hover:bg-surface-hover";

  return (
    <form
      action={formAction}
      // Enter num campo de texto antes do último passo não envia: segue para o
      // próximo, como o "Continuar". `preventDefault` aqui impede o React de
      // chamar a action.
      onSubmit={(e) => {
        if (passo < PASSOS.length - 1) {
          e.preventDefault();
          continuar();
        }
      }}
      className="mx-auto w-full max-w-[900px]"
    >
      <Card className="flex flex-col">
        <div className="flex flex-col items-center gap-1 px-6 pt-6 text-center">
          <h1 className="text-title font-bold text-fg tracking-[-0.01em]">Nova transferência</h1>
        </div>
        <Stepper steps={passos} onStepClick={(i) => i < passo && setPasso(i)} />

        <div className="flex flex-col gap-6 px-5 py-6 sm:px-8">
          {passo === 0 && (
            <>
              {/* Empresa ou pessoa: fixa, vinda da ficha; com busca, vinda do "Nova transferência". */}
              {fixedEntity ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-label font-medium leading-5 text-fg">{fixedEntity.entityType === "COMPANY" ? "Empresa" : "Pessoa"}</span>
                  <p className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2.5 text-input text-fg">
                    {fixedEntity.entityType === "COMPANY" ? <Building2 size={15} aria-hidden className="text-fg-muted" /> : <User size={15} aria-hidden className="text-fg-muted" />}
                    <span className="min-w-0 break-words font-medium">{fixedEntity.entityName}</span>
                    {cnpjDaEntidade && <span className="text-fg-muted tabular-nums">· {cnpjDaEntidade}</span>}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span id="rotulo-entidade" className="text-label font-medium leading-5 text-fg">
                      Empresa ou pessoa<span className="text-danger"> *</span>
                    </span>
                    <SegmentedControl
                      label="Empresa ou pessoa"
                      tocavel
                      active={entityType}
                      onChange={(t) => {
                        setEntityType(t);
                        setEntityId("");
                        setEscolhida(null);
                      }}
                      items={[
                        { key: "COMPANY" as EntityType, label: "Empresa", icon: <Building2 size={13} aria-hidden /> },
                        { key: "PERSON" as EntityType, label: "Pessoa", icon: <User size={13} aria-hidden /> },
                      ]}
                    />
                  </div>
                  <CampoForm
                    label={entityType === "COMPANY" ? "Empresa" : "Pessoa"}
                    htmlFor="entityId-busca"
                    error={erroDe("entidade")}
                  >
                    {/* A chave remonta o campo ao trocar de tipo, que zera a escolha. */}
                    <SearchableSelect
                      key={entityType}
                      id="entityId-busca"
                      name="entityId-busca"
                      options={[]}
                      buscar={buscarDoTipo}
                      defaultValue={entityId}
                      onChange={trocarEntidade}
                      avatar
                      textoSemValor="Selecionar…"
                      placeholder={entityType === "COMPANY" ? "Buscar empresa…" : "Buscar pessoa…"}
                      lembrarRecentes={entityType === "COMPANY" ? "empresas" : undefined}
                    />
                  </CampoForm>
                </div>
              )}

              {/* O assunto em blocos: cada um é um modelo, com os setores que ele marca. */}
              <fieldset className="flex min-w-0 flex-col gap-2" aria-describedby={erroDe("assunto") ? "assunto-erro" : undefined}>
                <legend className="sr-only">Assunto (obrigatório)</legend>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span aria-hidden className="text-label font-medium leading-5 text-fg">
                    Assunto<span className="text-danger"> *</span>
                  </span>
                  <div className="w-full sm:w-64">
                    <Input
                      compact
                      type="search"
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      // Enter na busca não leva ao passo 2: escolhe o modelo, se só um casa.
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        if (modelosVisiveis.length === 1) escolherModelo(modelosVisiveis[0].key);
                      }}
                      placeholder={`Buscar entre os ${modelos.length} modelos`}
                      aria-label="Buscar modelo"
                      icon={<Search size={14} />}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {modelosVisiveis.map((t) => {
                    const ativo = modelo === t.key;
                    const setores = setoresPorModelo[t.key] ?? [];
                    return (
                      <button
                        key={t.key}
                        type="button"
                        aria-pressed={ativo}
                        onClick={() => escolherModelo(t.key)}
                        className={`flex min-h-11 flex-col items-start gap-1.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                          ativo ? "border-brand bg-brand-subtle shadow-[inset_0_0_0_1px_var(--c41-brand)]" : "border-border bg-surface hover:border-border-strong hover:bg-surface-hover"
                        }`}
                      >
                        <span className="flex w-full items-start justify-between gap-2 text-ui font-semibold text-fg">
                          {t.label}
                          {ativo && <Check size={14} aria-hidden className="mt-0.5 flex-shrink-0 text-brand" />}
                        </span>
                        {setores.length > 0 ? (
                          <span className="flex flex-wrap gap-1">
                            {setores.map((s) => (
                              <span key={s.setor} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-px text-micro text-fg-secondary">
                                <span aria-hidden className="size-1.5 rounded-full" style={{ background: corDoSetor(s.setor) }} />
                                {rotuloDoSetor(s.setor)}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="text-helper text-fg-muted">Você escolhe os setores</span>
                        )}
                      </button>
                    );
                  })}
                  {!buscando && modelos.length > MODELOS_A_VISTA && (
                    <button type="button" onClick={() => setVerTodos((v) => !v)} aria-expanded={verTodos} className={blocoDeAcao}>
                      <span className="text-ui font-semibold text-brand">{verTodos ? "Ver menos" : `Ver os outros ${escondidos}`}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={escolherOutroAssunto}
                    aria-pressed={outroAssunto}
                    className={`${blocoDeAcao} ${outroAssunto ? "border-solid border-brand bg-brand-subtle" : ""}`}
                  >
                    <span className="flex w-full items-start justify-between gap-2 text-ui font-semibold text-brand">
                      Outro assunto
                      {outroAssunto && <Check size={14} aria-hidden className="mt-0.5 flex-shrink-0" />}
                    </span>
                    <span className="text-helper text-fg-muted">Você escreve e escolhe os setores</span>
                  </button>
                </div>
                {buscando && modelosVisiveis.length === 0 && (
                  <p className="text-helper text-fg-muted">Nenhum modelo com “{busca.trim()}”.</p>
                )}
                {outroAssunto && (
                  <CampoForm
                    label="Qual é o assunto?"
                    htmlFor="assunto-livre"
                    acao={
                      <span className="tabular-nums text-fg-muted">
                        {assuntoLivre.length}/{ASSUNTO_MAXIMO}
                      </span>
                    }
                  >
                    <Input
                      id="assunto-livre"
                      value={assuntoLivre}
                      maxLength={ASSUNTO_MAXIMO}
                      autoFocus
                      placeholder="Ex.: Troca do contador responsável"
                      error={Boolean(erroDe("assunto"))}
                      onChange={(e) => {
                        limparErro("assunto");
                        setAssuntoLivre(e.target.value);
                      }}
                    />
                  </CampoForm>
                )}
                {erroDe("assunto") && (
                  <p id="assunto-erro" className="text-helper font-medium text-danger">
                    {erroDe("assunto")}
                  </p>
                )}
              </fieldset>
            </>
          )}

          {passo === 1 && (
            <>
              {/* A origem antes dos destinos: o setor que pede não aparece entre os que recebem. */}
              {origemFixa ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-label font-medium leading-5 text-fg">Pedida pelo setor</span>
                  <span className="flex items-center gap-2">
                    <SectorChip label={rotuloDoSetor(fromSector)} color={corDoSetor(fromSector)} />
                  </span>
                </div>
              ) : (
                <CampoForm label="Pedida pelo setor" htmlFor="fromSector" required error={erroDe("origem")}>
                  <Select
                    id="fromSector"
                    value={fromSector}
                    error={Boolean(erroDe("origem"))}
                    onChange={(e) => {
                      limparErro("origem");
                      setFromSector(e.target.value);
                    }}
                    className="sm:max-w-xs"
                  >
                    <option value="" disabled>
                      Selecionar…
                    </option>
                    {fromSectorOptions.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </CampoForm>
              )}

              {/* O seletor de setores padrão (25/11/2026, melhoria-812); eram pílulas.
                  O modelo continua marcando os setores dele, e os `toSectors` saem
                  dos campos escondidos no fim do formulário, como antes. */}
              <SeletorDeSetores
                rotulo="Setores que recebem"
                required
                opcoes={destinationOptions.map((s) => ({ value: s.value, label: s.label, cor: s.color }))}
                valor={selectedInOrder.map((s) => s.value)}
                onChange={escolherSetores}
                erro={erroDe("setores")}
                className="sm:max-w-md"
              />

              {campos.length > 0 && (
                <fieldset className="flex min-w-0 flex-col gap-3">
                  <legend className="mb-1.5 text-label font-medium leading-5 text-fg">O que este modelo precisa saber</legend>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {campos.map((c) => (
                      <CampoDoPedido
                        key={c.chave}
                        campo={c}
                        valor={respostas[c.chave] ?? ""}
                        doCadastro={ehEmpresa}
                        onChange={(v) => setRespostas((atuais) => ({ ...atuais, [c.chave]: v }))}
                      />
                    ))}
                  </div>
                </fieldset>
              )}

              {selectedInOrder.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-label font-medium leading-5 text-fg">Tarefas e responsável de cada setor</span>
                  {/* Cada setor num bloco que começa fechado, com o resumo na linha (regra do Kauan, 08/10). */}
                  {selectedInOrder.map((s) => {
                    const lista = tarefas[s.value] ?? [];
                    const nomes = nomesDosResponsaveis(s.value);
                    const resumo = [
                      lista.length === 0 ? "Sem tarefas" : lista.length === 1 ? "1 tarefa" : `${lista.length} tarefas`,
                      nomes.length === 0 ? "a coordenação decide" : nomes.length === 1 ? nomes[0] : `${nomes.length} responsáveis`,
                    ].join(" · ");
                    const idDaNova = `tarefa-nova-${s.value}`;
                    return (
                      <BlocoRecolhivel key={s.value} titulo={s.label} cor={s.color} resumo={<span className="truncate">{resumo}</span>} classeDoConteudo="flex flex-col gap-3 px-4 pb-4">
                        {lista.length > 0 && (
                          <ul className="flex flex-col gap-1" aria-label={`Tarefas ${doSetor(s.label)}`}>
                            {lista.map((t, i) => (
                              <li key={`${i}-${t}`} className="flex items-start justify-between gap-2 rounded-md px-2 py-1.5 text-ui text-fg hover:bg-surface-hover">
                                <span className="flex min-w-0 items-start gap-2">
                                  <span aria-hidden className="mt-[3px] size-3.5 flex-shrink-0 rounded-[4px] border border-border-strong" />
                                  <span className="break-words">{t}</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => tirarTarefa(s.value, i)}
                                  className="-m-1 flex-shrink-0 rounded p-1 text-fg-muted hover:text-danger"
                                  aria-label={`Tirar a tarefa “${t}”`}
                                >
                                  <X size={13} aria-hidden />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        {lista.length < TAREFAS_POR_SETOR && (
                          <div className="flex items-center gap-2">
                            <Input
                              id={idDaNova}
                              compact
                              value={novaTarefa[s.value] ?? ""}
                              maxLength={TAREFA_MAXIMA}
                              onChange={(e) => setNovaTarefa((atuais) => ({ ...atuais, [s.value]: e.target.value }))}
                              // Enter acrescenta a tarefa, e não leva ao passo seguinte.
                              onKeyDown={(e) => {
                                if (e.key !== "Enter") return;
                                e.preventDefault();
                                acrescentarTarefa(s.value);
                              }}
                              placeholder="Nova tarefa"
                              aria-label={`Nova tarefa ${doSetor(s.label)}`}
                            />
                            <Button type="button" variant="secondary" size="sm" onClick={() => acrescentarTarefa(s.value)} disabled={!(novaTarefa[s.value] ?? "").trim()}>
                              <Plus size={14} aria-hidden /> Adicionar
                            </Button>
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-ui text-fg-muted">Responsável</span>
                          <SectorAssigneePicker
                            options={assigneeOptionsBySector[s.value] ?? []}
                            value={assignees[s.value] ?? []}
                            onChange={(ids) => setAssignees((atuais) => ({ ...atuais, [s.value]: ids }))}
                            rotulo={`Responsáveis ${doSetor(s.label)}`}
                            semNinguem={coordenacaoDecide(s.label)}
                          />
                        </div>
                      </BlocoRecolhivel>
                    );
                  })}
                </div>
              )}

              <CampoForm label="Descrição" htmlFor="descricao">
                <MentionTextarea
                  id="descricao"
                  rows={4}
                  crescer
                  placeholder="O contexto do pedido. Digite @ para chamar um colega."
                  value={description}
                  onChange={setDescription}
                  users={mentionUsers}
                />
              </CampoForm>
            </>
          )}

          {passo === 2 && (
            <>
              <section aria-labelledby="revisao-resumo" className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-4">
                <h2 id="revisao-resumo" className="c41-rotulo">
                  A transferência
                </h2>
                <p className="text-card-title font-semibold text-fg break-words">{assuntoEscolhido}</p>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-ui sm:grid-cols-[max-content_1fr]">
                  <dt className="text-fg-muted">{ehEmpresa ? "Empresa" : "Pessoa"}</dt>
                  <dd className="text-fg break-words">
                    {nomeDaEntidade ?? "—"}
                    {cnpjDaEntidade && <span className="text-fg-muted tabular-nums"> · {cnpjDaEntidade}</span>}
                  </dd>
                  <dt className="text-fg-muted">Prioridade</dt>
                  <dd>
                    <Selo tom={HANDOFF_PRIORITY_TOM[prioridade]}>{HANDOFF_PRIORITY_LABEL[prioridade]}</Selo>
                  </dd>
                  <dt className="text-fg-muted">Pedida pelo setor</dt>
                  <dd className="text-fg">{rotuloDoSetor(fromSector)}</dd>
                  {respostasPreenchidas.map(({ campo, valor }) => (
                    <div key={campo.chave} className="contents">
                      <dt className="text-fg-muted">{campo.rotulo}</dt>
                      <dd className="min-w-0 whitespace-pre-line break-words text-fg-secondary">{valor || <span className="text-fg-muted">Do cadastro da empresa</span>}</dd>
                    </div>
                  ))}
                  <dt className="text-fg-muted">Descrição</dt>
                  <dd className="min-w-0">
                    {description.trim() ? (
                      <p className="whitespace-pre-line break-words text-fg-secondary line-clamp-6">{description.trim()}</p>
                    ) : (
                      <span className="text-fg-muted">Sem descrição</span>
                    )}
                  </dd>
                </dl>
              </section>

              <section aria-labelledby="revisao-setores" className="flex flex-col gap-3">
                <h2 id="revisao-setores" className="c41-rotulo">
                  O que cada setor vai receber
                </h2>
                {selectedInOrder.map((s) => {
                  const lista = tarefas[s.value] ?? [];
                  const nomes = nomesDosResponsaveis(s.value);
                  return (
                    <article key={s.value} className="flex flex-col gap-2.5 rounded-lg border border-border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <SectorChip label={s.label} color={s.color} />
                        <Button variant="link" onClick={() => setPasso(1)} className="min-h-11 sm:min-h-0">
                          Editar<span className="sr-only"> o que vai para {s.label}</span>
                        </Button>
                      </div>
                      {lista.length > 0 ? (
                        <ul className="flex list-disc flex-col gap-0.5 pl-5 text-ui text-fg-secondary">
                          {lista.map((t, i) => (
                            <li key={`${i}-${t}`} className="break-words">
                              {t}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="flex items-start gap-1.5 text-ui font-medium text-warning-fg">
                          <TriangleAlert size={14} aria-hidden className="mt-0.5 flex-shrink-0" />
                          Sem tarefas: o {s.label} vai receber só a descrição.
                        </p>
                      )}
                      <p className="text-ui text-fg-secondary">
                        <span className="text-fg-muted">{nomes.length > 1 ? "Responsáveis: " : "Responsável: "}</span>
                        {nomes.length > 0 ? nomes.join(", ") : coordenacaoDecide(s.label)}
                      </p>
                    </article>
                  );
                })}
              </section>

              {erroDoServidor?.campo === "geral" && <Aviso>{erroDoServidor.texto}</Aviso>}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 sm:px-8">
          {passo === 0 ? (
            // A prioridade na linha dos botões (17/11/2026, escolha "A · Blocos com os setores e busca").
            <div className="flex flex-wrap items-center gap-2">
              <span id="rotulo-prioridade" className="text-label font-medium leading-5 text-fg">
                Prioridade
              </span>
              <SegmentedControl
                label="Prioridade"
                tocavel
                active={prioridade}
                onChange={(p) => {
                  limparErro("prioridade");
                  setPrioridade(p);
                }}
                // Cada prioridade acesa na cor do selo dela (Baixa cinza, Média azul,
                // Alta âmbar, Urgente vermelho), a mesma da lista.
                items={HANDOFF_PRIORITY_OPTIONS.map((p) => ({
                  key: p.value,
                  label: p.label,
                  tone: ({ neutro: "neutral", marca: "brand", atencao: "warning", perigo: "danger" } as const)[HANDOFF_PRIORITY_TOM[p.value]],
                }))}
              />
              {erroDe("prioridade") && <p className="w-full text-helper font-medium text-danger">{erroDe("prioridade")}</p>}
            </div>
          ) : (
            <Button key="voltar" type="button" variant="ghost" onClick={() => setPasso((p) => Math.max(0, p - 1))} disabled={isPending}>
              <ArrowLeft size={14} aria-hidden /> Voltar
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {passo === 0 && (
              <Button key="cancelar" href={cancelHref} variant="secondary">
                Cancelar
              </Button>
            )}
            {/* Cada botão com a sua `key`: sem ela o React reaproveitaria o mesmo
                <button> e trocaria o `type` para "submit" dentro do clique do
                "Continuar", e o navegador enviaria sem revisão (o achado do Novo
                processo, 10/11/2026). */}
            {passo < PASSOS.length - 1 ? (
              <Button key="continuar" type="button" onClick={continuar}>
                Continuar <ArrowRight size={14} aria-hidden />
              </Button>
            ) : (
              <Button key="enviar" type="submit" loading={isPending} loadingLabel="Enviando…">
                <Send size={14} aria-hidden /> Enviar transferência
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* O que vai para o servidor, do estado — os passos aparecem um de cada vez. */}
      <input type="hidden" name="entityType" value={fixedEntity?.entityType ?? entityType} />
      <input type="hidden" name="entityId" value={fixedEntity?.entityId ?? entityId} />
      <input type="hidden" name="templateKey" value={modelo} />
      <input type="hidden" name="subject" value={modelo ? "" : outroAssunto ? assuntoLivre : ""} />
      <input type="hidden" name="priority" value={prioridade} />
      <input type="hidden" name="fromSector" value={fromSector} />
      <input type="hidden" name="description" value={description} />
      {campos.map((c) => (
        <input key={c.chave} type="hidden" name={`detalhe_${c.chave}`} value={respostas[c.chave] ?? ""} />
      ))}
      {selectedInOrder.map((s) => (
        <span key={s.value} hidden>
          <input type="hidden" name="toSectors" value={s.value} />
          {(tarefas[s.value] ?? []).map((t, i) => (
            <input key={`${i}-${t}`} type="hidden" name={`tarefa_${s.value}`} value={t} />
          ))}
          {(assignees[s.value] ?? []).map((id) => (
            <input key={id} type="hidden" name={`assignee_${s.value}`} value={id} />
          ))}
        </span>
      ))}
      {templateConfirmDialog}
    </form>
  );
}

/** Uma pergunta do modelo, no tipo de campo dela. */
function CampoDoPedido({
  campo,
  valor,
  doCadastro,
  onChange,
}: {
  campo: CampoDoModelo;
  valor: string;
  /** A transferência é de uma empresa: o campo em branco leva o dado do cadastro. */
  doCadastro: boolean;
  onChange: (v: string) => void;
}) {
  const id = `detalhe-${campo.chave}`;
  const placeholder = campo.deCadastro && doCadastro ? "Do cadastro da empresa" : undefined;
  return (
    <CampoForm label={campo.rotulo} htmlFor={id} className={campo.tipo === "longo" ? "sm:col-span-2" : undefined}>
      {campo.tipo === "longo" ? (
        <Textarea id={id} rows={3} value={valor} maxLength={2000} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      ) : campo.tipo === "opcoes" ? (
        <Select id={id} value={valor} onChange={(e) => onChange(e.target.value)}>
          <option value="">Selecionar…</option>
          {(campo.opcoes ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      ) : campo.tipo === "data" ? (
        <CampoData id={id} value={valor} onChange={onChange} />
      ) : (
        <Input
          id={id}
          value={valor}
          maxLength={300}
          onChange={(e) => onChange(e.target.value)}
          // Enter num campo do modelo não leva ao passo seguinte sem querer.
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
          placeholder={placeholder}
        />
      )}
    </CampoForm>
  );
}
