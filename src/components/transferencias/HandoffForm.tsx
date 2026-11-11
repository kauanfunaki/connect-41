"use client";

import { useActionState, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Building2, Check, Send, TriangleAlert, User } from "lucide-react";
import type { CampoDaTransferencia, HandoffState } from "@/app/(app)/transferencias/actions";
import type { EntityType, HandoffPriority } from "@/generated/prisma/enums";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Aviso } from "@/components/ui/Aviso";
import { Selo } from "@/components/ui/Selo";
import { SectorChip } from "@/components/ui/SectorChip";
import { Stepper, type StepDef } from "@/components/ui/Stepper";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { useConfirm } from "@/components/ui/useConfirm";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { MentionTextarea, type MentionUser } from "@/components/transferencias/MentionTextarea";
import { SectorAssigneePicker } from "@/components/transferencias/SectorAssigneePicker";
import { ASSUNTO_MAXIMO, HANDOFF_PRIORITY_LABEL, HANDOFF_PRIORITY_OPTIONS, HANDOFF_PRIORITY_TOM } from "@/lib/handoffs";
import {
  getHandoffTemplate,
  matchSectorsForTemplate,
  renderHandoffTemplate,
  splitDescriptionBySector,
  type HandoffTemplate,
} from "@/lib/handoffTemplates";
import { formatCnpj } from "@/lib/format";
import { opcoesDeEmpresa } from "@/lib/empresas/opcoesDoSeletor";
import { nomeExibicao } from "@/lib/companyName";

type EntityOption = {
  id: string;
  name: string;
  cnpj?: string | null;
  /** Da empresa, para o seletor com logo e a filial embaixo da matriz. */
  displayName?: string | null;
  logoUrl?: string | null;
  parentCompanyId?: string | null;
  /** Da pessoa. */
  photoUrl?: string | null;
};

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
  companies?: EntityOption[];
  people?: EntityOption[];
  mentionUsers?: MentionUser[];
  /** Membros elegíveis como responsável por setor de destino (setor + admins do tenant). */
  assigneeOptionsBySector?: Record<string, MentionUser[]>;
  /** Preenchimento inicial — a transferência sugerida pelo chat de IA. */
  inicial?: { toSectors: string[]; description: string };
  /** As chaves dos 16 modelos, do mais usado no escritório para o menos. */
  ordemDosModelos: string[];
};

const PASSOS = ["Empresa e assunto", "Setores e instruções", "Revisar e enviar"] as const;
/** Quantos blocos de assunto aparecem antes do "Ver os 16 modelos". */
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

/** O começo do texto, numa linha: o resumo do bloco do setor fechado. */
function resumoDoTexto(texto: string, maximo = 44): string {
  const linha = texto.replace(/\s+/g, " ").trim();
  return linha.length > maximo ? `${linha.slice(0, maximo - 1).trimEnd()}…` : linha;
}

/**
 * A nova transferência em três passos centralizados num cartão (10/11/2026,
 * escolha "B · Três passos no cartão" do Kauan, o caminho do Novo processo):
 * 1. a empresa ou pessoa, o assunto em blocos (cada bloco é um modelo, que já
 *    marca os setores e escreve as instruções) e a prioridade;
 * 2. os setores que recebem, a instrução e os responsáveis de cada um (em
 *    blocos que começam fechados, com o resumo na linha) e a descrição;
 * 3. a revisão do que cada setor vai receber, com o aviso do setor sem
 *    instrução ou sem responsável, e o "Enviar".
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
  companies = [],
  people = [],
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
  const [prioridade, setPrioridade] = useState<HandoffPriority>("MEDIUM");
  const [fromSector, setFromSector] = useState(
    fromSectorInicial && fromSectorOptions.some((s) => s.value === fromSectorInicial)
      ? fromSectorInicial
      : fromSectorOptions.length === 1
        ? fromSectorOptions[0].value
        : ""
  );
  const [selectedSectors, setSelectedSectors] = useState<string[]>(inicial?.toSectors ?? []);
  const [instructions, setInstructions] = useState<Record<string, string>>({});
  const [assignees, setAssignees] = useState<Record<string, string[]>>({});
  const [description, setDescription] = useState(inicial?.description ?? "");
  // O que o modelo escreveu (descrição e instruções): trocar de modelo só
  // substitui sem perguntar o que a pessoa não mexeu.
  const [descricaoDoModelo, setDescricaoDoModelo] = useState<string | null>(null);
  const [instrucoesDoModelo, setInstrucoesDoModelo] = useState<Record<string, string>>({});
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

  const entityOptions = entityType === "COMPANY" ? companies : people;
  // As opções do seletor com busca: empresa com logo, CNPJ, filial e recentes;
  // pessoa com a foto.
  const opcoesDoSeletor = useMemo(
    () =>
      entityType === "COMPANY"
        ? opcoesDeEmpresa(companies.map((c) => ({ ...c, nome: nomeExibicao(c) })))
        : people.map((p) => ({ value: p.id, label: p.name, imagem: p.photoUrl ?? null })),
    [entityType, companies, people]
  );

  const modelos = useMemo(
    () => ordemDosModelos.map((k) => getHandoffTemplate(k)).filter((t): t is HandoffTemplate => Boolean(t)),
    [ordemDosModelos]
  );
  // Os seis primeiros, e o escolhido junto quando ele está mais para baixo.
  const modelosVisiveis = verTodos
    ? modelos
    : [...modelos.slice(0, MODELOS_A_VISTA), ...modelos.slice(MODELOS_A_VISTA).filter((t) => t.key === modelo)];
  const setoresDoModelo = useMemo(
    () => Object.fromEntries(modelos.map((t) => [t.key, matchSectorsForTemplate(t.key, toSectorOptions)])),
    [modelos, toSectorOptions]
  );
  const rotuloDoSetor = (code: string) => toSectorOptions.find((s) => s.value === code)?.label ?? code;
  const corDoSetor = (code: string) => toSectorOptions.find((s) => s.value === code)?.color ?? "#586577";

  const destinationOptions = toSectorOptions.filter((s) => s.value !== fromSector);
  const selectedInOrder = destinationOptions.filter((s) => selectedSectors.includes(s.value));
  const origemFixa = fromSectorOptions.length === 1;

  function limparErro(campo: CampoDaTransferencia) {
    if (erroDoServidor?.campo === campo) setErroDispensado(true);
    setErros((e) => {
      if (!e[campo]) return e;
      const resto = { ...e };
      delete resto[campo];
      return resto;
    });
  }

  // [EMPRESA]/[CNPJ] são substituídos pela empresa já escolhida — os demais
  // placeholders do modelo ficam por conta de quem preenche.
  function entidadeAtual(id = entityId): { name?: string; cnpj?: string | null } {
    if (fixedEntity) return { name: fixedEntity.entityName, cnpj: fixedEntity.entityCnpj ? formatCnpj(fixedEntity.entityCnpj) : null };
    const found = entityOptions.find((e) => e.id === id);
    return { name: found ? (entityType === "COMPANY" ? nomeExibicao(found) : found.name) : undefined, cnpj: found?.cnpj ? formatCnpj(found.cnpj) : null };
  }

  // O modelo escreve a Descrição (o resumo e o que vale para todos) e a
  // instrução de cada setor ("Demanda X:" e afins), e marca os setores que ele
  // indica. A instrução que o modelo anterior escreveu e a pessoa não mexeu
  // sai junto com ele. Ao reescrever por causa da troca de empresa, os setores
  // ficam como a pessoa deixou.
  function aplicarModelo(key: string, entidade = entidadeAtual(), marcarSetores = true) {
    const rendered = renderHandoffTemplate(key, entidade);
    const { general, bySector } = splitDescriptionBySector(rendered.description, toSectorOptions);
    const novaDescricao = [rendered.message.trim(), general.trim()].filter(Boolean).join("\n\n");
    const marcados = matchSectorsForTemplate(key, toSectorOptions);
    if (marcarSetores && marcados.length > 0) setSelectedSectors(marcados);
    setDescription(novaDescricao);
    setDescricaoDoModelo(novaDescricao);
    setInstructions((atuais) => {
      const proximas = { ...atuais };
      for (const [code, texto] of Object.entries(instrucoesDoModelo)) if (proximas[code] === texto) delete proximas[code];
      return { ...proximas, ...bySector };
    });
    setInstrucoesDoModelo(bySector);
  }

  function escolherModelo(key: string) {
    limparErro("assunto");
    if (key === modelo) return;
    const mexeuNaDescricao = description.trim() !== "" && description !== descricaoDoModelo;
    const trocar = () => {
      setOutroAssunto(false);
      setModelo(key);
      aplicarModelo(key);
    };
    if (mexeuNaDescricao) {
      requestTemplateConfirm(
        {
          title: "Trocar o texto pelo do modelo?",
          description: "A Descrição já tem texto seu. O modelo escreve a descrição e as instruções dos setores no lugar dele.",
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

  // Trocou a empresa depois de escolher o modelo: o texto que o modelo
  // escreveu (e ninguém mexeu) é escrito de novo com a empresa nova.
  function trocarEntidade(id: string) {
    limparErro("entidade");
    setEntityId(id);
    if (modelo && description === descricaoDoModelo) {
      aplicarModelo(modelo, entidadeAtual(id), false);
    }
  }

  function alternarSetor(code: string) {
    limparErro("setores");
    setSelectedSectors((atuais) => (atuais.includes(code) ? atuais.filter((c) => c !== code) : [...atuais, code]));
  }

  const assuntoEscolhido = modelo ? getHandoffTemplate(modelo)?.label ?? "" : outroAssunto ? assuntoLivre.replace(/\s+/g, " ").trim() : "";

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

  const nomeDaEntidade = fixedEntity ? fixedEntity.entityName : entidadeAtual().name;
  const cnpjDaEntidade = fixedEntity ? (fixedEntity.entityCnpj ? formatCnpj(fixedEntity.entityCnpj) : null) : entidadeAtual().cnpj;
  const nomeDoResponsavel = (code: string, id: string) => assigneeOptionsBySector[code]?.find((u) => u.id === id)?.name ?? null;

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
          <p className="text-ui text-fg-secondary">Peça a outro setor para acompanhar uma empresa ou pessoa.</p>
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
                    helper={
                      entityOptions.length === 0
                        ? `Nenhuma ${entityType === "COMPANY" ? "empresa" : "pessoa"} disponível no seu escopo.`
                        : undefined
                    }
                  >
                    {/* A chave remonta o campo ao trocar de tipo, que zera a escolha. */}
                    <SearchableSelect
                      key={entityType}
                      id="entityId-busca"
                      name="entityId-busca"
                      options={opcoesDoSeletor}
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
              <fieldset className="flex min-w-0 flex-col gap-2" aria-describedby={erroDe("assunto") ? "assunto-erro" : "assunto-ajuda"}>
                <legend className="mb-1.5 text-label font-medium leading-5 text-fg">
                  Assunto<span className="text-danger"> *</span>
                </legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {modelosVisiveis.map((t) => {
                    const ativo = modelo === t.key;
                    const setores = setoresDoModelo[t.key] ?? [];
                    return (
                      <button
                        key={t.key}
                        type="button"
                        aria-pressed={ativo}
                        onClick={() => escolherModelo(t.key)}
                        className={`flex min-h-11 flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                          ativo ? "border-brand bg-brand-subtle shadow-[inset_0_0_0_1px_var(--c41-brand)]" : "border-border bg-surface hover:border-border-strong hover:bg-surface-hover"
                        }`}
                      >
                        <span className="flex w-full items-start justify-between gap-2 text-ui font-semibold text-fg">
                          {t.label}
                          {ativo && <Check size={14} aria-hidden className="mt-0.5 flex-shrink-0 text-brand" />}
                        </span>
                        <span className="text-helper text-fg-muted">
                          {setores.length > 0 ? setores.map(rotuloDoSetor).join(", ") : "Você escolhe os setores"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {modelos.length > MODELOS_A_VISTA && (
                    <Button variant="link" onClick={() => setVerTodos((v) => !v)} aria-expanded={verTodos} className="min-h-11 sm:min-h-0">
                      {verTodos ? "Ver menos modelos" : `Ver os ${modelos.length} modelos`}
                    </Button>
                  )}
                  <Button variant="link" onClick={escolherOutroAssunto} aria-pressed={outroAssunto} className="min-h-11 sm:min-h-0">
                    Outro assunto
                  </Button>
                </div>
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
                {erroDe("assunto") ? (
                  <p id="assunto-erro" className="text-helper font-medium text-danger">
                    {erroDe("assunto")}
                  </p>
                ) : (
                  <p id="assunto-ajuda" className="text-helper text-fg-muted">
                    O modelo já marca os setores e escreve as instruções, e você ajusta no passo 2.
                  </p>
                )}
              </fieldset>

              <div className="flex flex-col gap-1.5">
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
                  className="self-start"
                  // Cada prioridade acesa na cor do selo dela (Baixa cinza, Média azul,
                  // Alta âmbar, Urgente vermelho), a mesma da lista.
                  items={HANDOFF_PRIORITY_OPTIONS.map((p) => ({
                    key: p.value,
                    label: p.label,
                    tone: ({ neutro: "neutral", marca: "brand", atencao: "warning", perigo: "danger" } as const)[HANDOFF_PRIORITY_TOM[p.value]],
                  }))}
                />
                {erroDe("prioridade") && <p className="text-helper font-medium text-danger">{erroDe("prioridade")}</p>}
              </div>
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
                    <span className="text-helper text-fg-muted">o seu setor</span>
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

              <fieldset className="flex min-w-0 flex-col gap-2" aria-describedby={erroDe("setores") ? "setores-erro" : undefined}>
                <legend className="mb-1.5 text-label font-medium leading-5 text-fg">
                  Setores que recebem<span className="text-danger"> *</span>
                </legend>
                <div className="flex flex-wrap gap-2">
                  {destinationOptions.map((s) => {
                    const ativo = selectedSectors.includes(s.value);
                    return (
                      <button
                        key={s.value}
                        type="button"
                        aria-pressed={ativo}
                        onClick={() => alternarSetor(s.value)}
                        className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-ui font-medium transition-colors sm:min-h-8 ${
                          ativo ? "border-brand bg-brand-subtle text-fg" : "border-border bg-surface text-fg-secondary hover:border-border-strong hover:text-fg"
                        }`}
                      >
                        <span aria-hidden className="size-[7px] flex-shrink-0 rounded-full" style={{ background: s.color }} />
                        {s.label}
                        {ativo && <Check size={13} aria-hidden className="text-brand" />}
                      </button>
                    );
                  })}
                  {destinationOptions.length === 0 && <p className="text-helper text-fg-muted">Nenhum setor disponível.</p>}
                </div>
                {erroDe("setores") ? (
                  <p id="setores-erro" className="text-helper font-medium text-danger">
                    {erroDe("setores")}
                  </p>
                ) : (
                  modelo && <p className="text-helper text-fg-muted">Os setores do modelo já vêm marcados. Toque num setor para tirar ou pôr.</p>
                )}
              </fieldset>

              {selectedInOrder.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-label font-medium leading-5 text-fg">Instrução e responsáveis de cada setor</span>
                  {/* Cada setor num bloco que começa fechado, com o resumo na linha (regra do Kauan, 08/10). */}
                  {selectedInOrder.map((s) => {
                    const instrucao = instructions[s.value] ?? "";
                    const nomes = (assignees[s.value] ?? []).map((id) => nomeDoResponsavel(s.value, id)).filter((n): n is string => Boolean(n));
                    const resumo = [
                      instrucao.trim() ? resumoDoTexto(instrucao) : "Sem instrução",
                      nomes.length === 0 ? "sem responsável" : nomes.length === 1 ? nomes[0] : `${nomes.length} responsáveis`,
                    ].join(" · ");
                    return (
                      <BlocoRecolhivel key={s.value} titulo={s.label} cor={s.color} resumo={<span className="truncate">{resumo}</span>} classeDoConteudo="flex flex-col gap-3 px-4 pb-4">
                        <CampoForm label={`Instrução para ${s.label}`} htmlFor={`instrucao-${s.value}`}>
                          <Textarea
                            id={`instrucao-${s.value}`}
                            rows={4}
                            value={instrucao}
                            onChange={(e) => setInstructions((atuais) => ({ ...atuais, [s.value]: e.target.value }))}
                            placeholder={`O que o setor ${s.label} precisa fazer nesta transferência…`}
                          />
                        </CampoForm>
                        <div className="flex flex-col gap-1.5">
                          <span className="text-label font-medium leading-5 text-fg">Responsáveis</span>
                          <SectorAssigneePicker
                            options={assigneeOptionsBySector[s.value] ?? []}
                            value={assignees[s.value] ?? []}
                            onChange={(ids) => setAssignees((atuais) => ({ ...atuais, [s.value]: ids }))}
                            rotulo={`Responsáveis do ${s.label}`}
                          />
                        </div>
                      </BlocoRecolhivel>
                    );
                  })}
                </div>
              )}

              <CampoForm
                label="Descrição"
                htmlFor="descricao"
                helper='O que vale para todos os setores. Digite "@" para chamar um colega — ele recebe uma notificação quando a transferência for enviada.'
              >
                <MentionTextarea
                  id="descricao"
                  rows={6}
                  crescer
                  placeholder="O que motivou a transferência, o contexto, o que já foi feito…"
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
                  <dt className="text-fg-muted">{entityType === "COMPANY" ? "Empresa" : "Pessoa"}</dt>
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
                  const instrucao = (instructions[s.value] ?? "").trim();
                  const nomes = (assignees[s.value] ?? []).map((id) => nomeDoResponsavel(s.value, id)).filter((n): n is string => Boolean(n));
                  return (
                    <article key={s.value} className="flex flex-col gap-2.5 rounded-lg border border-border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <SectorChip label={s.label} color={s.color} />
                        <Button variant="link" onClick={() => setPasso(1)} className="min-h-11 sm:min-h-0">
                          Editar<span className="sr-only"> o que vai para {s.label}</span>
                        </Button>
                      </div>
                      {instrucao ? (
                        <p className="whitespace-pre-line break-words text-ui text-fg-secondary">{instrucao}</p>
                      ) : (
                        <p className="flex items-start gap-1.5 text-ui font-medium text-warning-fg">
                          <TriangleAlert size={14} aria-hidden className="mt-0.5 flex-shrink-0" />
                          Sem instrução: o {s.label} vai receber só a descrição.
                        </p>
                      )}
                      {nomes.length > 0 ? (
                        <p className="text-ui text-fg-secondary">
                          <span className="text-fg-muted">{nomes.length === 1 ? "Responsável: " : "Responsáveis: "}</span>
                          {nomes.join(", ")}
                        </p>
                      ) : (
                        <p className="flex items-start gap-1.5 text-ui font-medium text-warning-fg">
                          <TriangleAlert size={14} aria-hidden className="mt-0.5 flex-shrink-0" />
                          Sem responsável: a coordenação do {s.label} escolhe quem cuida.
                        </p>
                      )}
                    </article>
                  );
                })}
              </section>

              {erroDoServidor?.campo === "geral" && <Aviso>{erroDoServidor.texto}</Aviso>}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-4 sm:px-8">
          {passo === 0 ? (
            <Button key="cancelar" href={cancelHref} variant="ghost">
              Cancelar
            </Button>
          ) : (
            <Button key="voltar" type="button" variant="ghost" onClick={() => setPasso((p) => Math.max(0, p - 1))} disabled={isPending}>
              <ArrowLeft size={14} aria-hidden /> Voltar
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
      </Card>

      {/* O que vai para o servidor, do estado — os passos aparecem um de cada vez. */}
      <input type="hidden" name="entityType" value={fixedEntity?.entityType ?? entityType} />
      <input type="hidden" name="entityId" value={fixedEntity?.entityId ?? entityId} />
      <input type="hidden" name="templateKey" value={modelo} />
      <input type="hidden" name="subject" value={modelo ? "" : outroAssunto ? assuntoLivre : ""} />
      <input type="hidden" name="priority" value={prioridade} />
      <input type="hidden" name="fromSector" value={fromSector} />
      <input type="hidden" name="description" value={description} />
      {selectedInOrder.map((s) => (
        <span key={s.value} hidden>
          <input type="hidden" name="toSectors" value={s.value} />
          <input type="hidden" name={`instruction_${s.value}`} value={instructions[s.value] ?? ""} />
          {(assignees[s.value] ?? []).map((id) => (
            <input key={id} type="hidden" name={`assignee_${s.value}`} value={id} />
          ))}
        </span>
      ))}
      {templateConfirmDialog}
    </form>
  );
}
