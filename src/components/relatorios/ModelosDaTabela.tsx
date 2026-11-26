"use client";

import { useId, useState, useTransition } from "react";
import { Bookmark, BookmarkPlus, Check, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormFooter } from "@/components/ui/FormFooter";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ItemDoMenu, Popover } from "@/components/ui/Popover";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { useToast } from "@/components/ui/Toast";
import {
  excluirModeloDaTabelaAction,
  renomearModeloDaTabelaAction,
  salvarModeloDaTabelaAction,
} from "@/app/(app)/tabela-dinamica/actions";
import {
  MESES_DO_PERIODO_RELATIVO,
  TAMANHO_DO_NOME_DO_MODELO,
  modeloAplicado,
  periodoSugerido,
  resumoDoModelo,
  textoDoPeriodo,
  type ModeloDaTabela,
  type ModelosDaTela,
  type PeriodoDoModelo,
  type QuemVe,
} from "@/lib/relatorios/modelosDaTabela";
import { VISOES_PRONTAS, lerConfiguracao, paramsDaConfiguracao, type Configuracao, type VisaoPronta } from "@/lib/relatorios/tabelaDinamica";

/**
 * O menu de modelos da Tabela dinâmica (25/11/2026, funcionalidade-816 —
 * alternativa C do Kauan, "meu ou do setor, escolhido ao salvar"), no lugar do
 * botão "Visões prontas": três grupos — Meus modelos, Do setor e Visões
 * prontas — e, no pé, "Salvar como modelo".
 *
 * Aplicar é trocar o endereço pelos parâmetros do modelo (quem navega é a
 * `ConfiguracaoDaTabela`). O botão mostra o nome do modelo que dá a tabela da
 * tela, como os Filtros salvos do Controle interno; com uma visão pronta
 * aberta, o nome dela. Renomear e excluir são aqui mesmo, na linha do modelo,
 * para quem pode (ver `podeRenomearModelo` e `podeExcluirModelo`).
 */
export function ModelosDaTabela({
  modelos,
  config,
  hoje,
  visaoAberta,
  aoAbrirVisao,
  aoAplicarModelo,
}: {
  modelos: ModelosDaTela;
  /** A tabela da tela (a adiantada, enquanto a nova não chega). */
  config: Configuracao;
  hoje: string;
  visaoAberta?: VisaoPronta;
  aoAbrirVisao: (v: VisaoPronta) => void;
  aoAplicarModelo: (m: ModeloDaTabela) => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const aplicado = visaoAberta ? undefined : modeloAplicado([...modelos.meus, ...modelos.doSetor], config, hoje);
  const nome = aplicado?.nome ?? visaoAberta?.rotulo;

  return (
    <>
      <Popover
        align="right"
        width={340}
        aria-label="Modelos da tabela"
        trigger={({ open, toggle }) => (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={toggle}
            aria-expanded={open}
            aria-label={nome ? `Modelos: ${nome}` : "Modelos"}
            title={aplicado ? `Modelo aplicado: ${aplicado.nome}` : undefined}
            className="min-w-0 max-w-full"
          >
            <Bookmark size={14} aria-hidden className="flex-shrink-0" fill={aplicado ? "currentColor" : "none"} />
            <span className="truncate">{nome ?? "Modelos"}</span>
            <ChevronDown size={14} aria-hidden className="flex-shrink-0" />
          </Button>
        )}
      >
        {({ close }) => (
          <Painel
            modelos={modelos}
            hoje={hoje}
            aplicado={aplicado}
            visaoAberta={visaoAberta}
            fechar={close}
            aoAbrirVisao={aoAbrirVisao}
            aoAplicarModelo={aoAplicarModelo}
            aoSalvar={() => {
              close();
              setSalvando(true);
            }}
          />
        )}
      </Popover>
      <Modal open={salvando} onClose={() => setSalvando(false)} title="Salvar como modelo" maxWidth="max-w-lg">
        {salvando && <DialogoDeSalvar config={config} hoje={hoje} modelos={modelos} aoFechar={() => setSalvando(false)} />}
      </Modal>
    </>
  );
}

/** O conteúdo do menu: montado a cada abertura, então a renomeação e a confirmação recomeçam. */
function Painel({
  modelos,
  hoje,
  aplicado,
  visaoAberta,
  fechar,
  aoAbrirVisao,
  aoAplicarModelo,
  aoSalvar,
}: {
  modelos: ModelosDaTela;
  hoje: string;
  aplicado?: ModeloDaTabela;
  visaoAberta?: VisaoPronta;
  fechar: () => void;
  aoAbrirVisao: (v: VisaoPronta) => void;
  aoAplicarModelo: (m: ModeloDaTabela) => void;
  aoSalvar: () => void;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const linhas = (lista: ModeloDaTabela[], doSetor: boolean) =>
    lista.map((m) => (
      <LinhaDoModelo
        key={m.id}
        modelo={m}
        hoje={hoje}
        doSetor={doSetor}
        escolhido={m.id === aplicado?.id}
        editando={editando === m.id}
        confirmando={confirmando === m.id}
        aoAplicar={() => {
          fechar();
          if (m.id !== aplicado?.id) aoAplicarModelo(m);
        }}
        aoEditar={(sim) => {
          setConfirmando(null);
          setEditando(sim ? m.id : null);
        }}
        aoConfirmar={(sim) => {
          setEditando(null);
          setConfirmando(sim ? m.id : null);
        }}
      />
    ));

  return (
    <div className="-m-1 flex flex-col gap-3">
      <div className="scroll-y flex max-h-[min(60vh,440px)] flex-col gap-3 overflow-y-auto overscroll-contain">
        <section className="flex flex-col gap-1">
          <p className="c41-rotulo px-1">Meus modelos</p>
          {modelos.meus.length === 0 ? (
            <p className="px-2.5 py-1.5 text-fs-2 text-fg-muted">Nenhum modelo seu ainda.</p>
          ) : (
            <ul className="flex flex-col gap-0.5" aria-label="Meus modelos">
              {linhas(modelos.meus, false)}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-1">
          <p className="c41-rotulo px-1">Do setor {modelos.setor.rotulo}</p>
          {modelos.doSetor.length === 0 ? (
            <p className="px-2.5 py-1.5 text-fs-2 text-fg-muted">Nenhum modelo do setor ainda.</p>
          ) : (
            <ul className="flex flex-col gap-0.5" aria-label={`Do setor ${modelos.setor.rotulo}`}>
              {linhas(modelos.doSetor, true)}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-1">
          <p className="c41-rotulo px-1">Visões prontas</p>
          {VISOES_PRONTAS.map((v) => (
            <ItemDoMenu
              key={v.id}
              descricao={v.descricao}
              onClick={() => {
                fechar();
                if (v.id !== visaoAberta?.id) aoAbrirVisao(v);
              }}
            >
              {v.rotulo}
            </ItemDoMenu>
          ))}
        </section>
      </div>

      <div className="border-t border-border pt-2">
        <ItemDoMenu icone={<BookmarkPlus />} onClick={aoSalvar}>
          Salvar como modelo
        </ItemDoMenu>
      </div>
    </div>
  );
}

function LinhaDoModelo({
  modelo: m,
  hoje,
  doSetor,
  escolhido,
  editando,
  confirmando,
  aoAplicar,
  aoEditar,
  aoConfirmar,
}: {
  modelo: ModeloDaTabela;
  hoje: string;
  doSetor: boolean;
  escolhido: boolean;
  editando: boolean;
  confirmando: boolean;
  aoAplicar: () => void;
  aoEditar: (sim: boolean) => void;
  aoConfirmar: (sim: boolean) => void;
}) {
  const toast = useToast();
  const idDoCampo = useId();
  const [nome, setNome] = useState(m.nome);
  const [renomeando, iniciarRenomear] = useTransition();
  const [excluindo, iniciarExcluir] = useTransition();

  function renomear(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    iniciarRenomear(async () => {
      const r = await renomearModeloDaTabelaAction(m.id, nome);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      aoEditar(false);
      toast.success(`Modelo renomeado para “${r.nome}”.`);
    });
  }
  function excluir() {
    iniciarExcluir(async () => {
      const r = await excluirModeloDaTabelaAction(m.id);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      aoConfirmar(false);
      toast.success(`Modelo “${m.nome}” excluído.`);
    });
  }

  if (confirmando) {
    return (
      <li className="flex items-center gap-1.5 rounded-md bg-danger-bg py-1 pl-2.5 pr-1">
        <span className="min-w-0 flex-1 truncate text-ui text-fg" title={m.nome}>
          Excluir “{m.nome}”{doSetor ? " para todo o setor" : ""}?
        </span>
        <Button size="xs" variant="ghost" onClick={() => aoConfirmar(false)} disabled={excluindo}>
          Cancelar
        </Button>
        <Button size="xs" variant="dangerSolid" onClick={excluir} loading={excluindo} loadingLabel="Excluindo…" autoFocus>
          Excluir
        </Button>
      </li>
    );
  }

  if (editando) {
    return (
      <li>
        <form onSubmit={renomear} className="flex items-center gap-1.5 py-0.5 pl-1">
          <label htmlFor={idDoCampo} className="sr-only">
            Novo nome de {m.nome}
          </label>
          <div className="min-w-0 flex-1">
            <Input
              id={idDoCampo}
              compact
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={TAMANHO_DO_NOME_DO_MODELO}
              disabled={renomeando}
              autoComplete="off"
              autoFocus
              onKeyDown={(e) => {
                // O Esc cancela a renomeação, sem fechar o menu inteiro.
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  aoEditar(false);
                }
              }}
            />
          </div>
          <Button size="xs" variant="ghost" type="button" onClick={() => aoEditar(false)} disabled={renomeando}>
            Cancelar
          </Button>
          <Button size="xs" type="submit" disabled={!nome.trim()} loading={renomeando} loadingLabel="Salvando…">
            Salvar
          </Button>
        </form>
      </li>
    );
  }

  const resumo = resumoDoModelo(m, hoje);
  const apoio = doSetor && m.criadoPorNome ? `${resumo} · ${m.criadoPorNome}` : resumo;
  return (
    <li className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={aoAplicar}
        aria-current={escolhido || undefined}
        className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors ${
          escolhido ? "bg-brand-subtle text-brand" : "text-fg-secondary hover:bg-surface-hover hover:text-fg"
        }`}
      >
        <span className="flex min-w-0 flex-col">
          <span className={`truncate text-ui ${escolhido ? "font-semibold" : "font-medium text-fg"}`} title={m.nome}>
            {m.nome}
          </span>
          <span className="truncate text-fs-2 text-fg-muted" title={apoio}>
            {apoio}
          </span>
        </span>
        {escolhido && <Check size={13} className="flex-shrink-0" aria-label="Aplicado" />}
      </button>
      {m.podeRenomear && (
        <button
          type="button"
          onClick={() => aoEditar(true)}
          aria-label={`Renomear o modelo ${m.nome}`}
          title="Renomear"
          className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
        >
          <Pencil size={14} />
        </button>
      )}
      {m.podeExcluir && (
        <button
          type="button"
          onClick={() => aoConfirmar(true)}
          aria-label={`Excluir o modelo ${m.nome}`}
          title="Excluir"
          className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-danger-bg hover:text-danger"
        >
          <Trash2 size={14} />
        </button>
      )}
    </li>
  );
}

/**
 * O diálogo de salvar: nome, quem vê ("Só eu" por padrão), o período (os
 * últimos 6 meses, sempre, ou o de agora, fixo) e se os filtros vão junto.
 */
function DialogoDeSalvar({
  config,
  hoje,
  modelos,
  aoFechar,
}: {
  config: Configuracao;
  hoje: string;
  modelos: ModelosDaTela;
  aoFechar: () => void;
}) {
  const toast = useToast();
  const id = useId();
  const [nome, setNome] = useState("");
  const [quemVe, setQuemVe] = useState<QuemVe>("eu");
  const [periodo, setPeriodo] = useState<PeriodoDoModelo>(() => periodoSugerido(config, hoje));
  const [comFiltros, setComFiltros] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const relativoHoje = textoDoPeriodo(lerConfiguracao({}, hoje).filtros);
  const setor = modelos.setor.rotulo;

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    setErro(null);
    iniciar(async () => {
      const r = await salvarModeloDaTabelaAction({ nome, quemVe, periodo, comFiltros, query: paramsDaConfiguracao(config).toString() });
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      aoFechar();
      toast.success(quemVe === "setor" ? `Modelo “${r.nome}” salvo para o setor ${setor}.` : `Modelo “${r.nome}” salvo.`);
    });
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-4">
      <CampoForm label="Nome" htmlFor={`${id}-nome`} required>
        <Input
          id={`${id}-nome`}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={TAMANHO_DO_NOME_DO_MODELO}
          placeholder="Ex.: Despesas do trimestre"
          autoComplete="off"
          autoFocus
          required
        />
      </CampoForm>

      <RadioGroup<QuemVe>
        legenda="Quem vê"
        valor={quemVe}
        onChange={setQuemVe}
        colunas="sm:grid-cols-2"
        opcoes={[
          { valor: "eu", rotulo: "Só eu", descricao: "Fica em Meus modelos." },
          {
            valor: "setor",
            rotulo: "Todo o setor",
            descricao: modelos.podeCompartilhar ? `Todos do setor ${setor} veem e aplicam.` : "Só quem trabalha no setor salva para todos.",
            disabled: !modelos.podeCompartilhar,
          },
        ]}
      />

      <RadioGroup<PeriodoDoModelo>
        legenda="Período"
        valor={periodo}
        onChange={setPeriodo}
        opcoes={[
          {
            valor: "relativo",
            rotulo: `Os últimos ${MESES_DO_PERIODO_RELATIVO} meses, sempre`,
            descricao: `Anda com o calendário — hoje, ${relativoHoje}.`,
          },
          { valor: "fixo", rotulo: `Fixo: ${textoDoPeriodo(config.filtros)}`, descricao: "O período que está na tela agora." },
        ]}
      />

      <Checkbox
        id={`${id}-filtros`}
        label="Guardar também os filtros"
        helper="Tipo, situação e período pela. Sem marcar, o modelo usa os filtros que estiverem na tela."
        checked={comFiltros}
        onChange={(e) => setComFiltros(e.target.checked)}
      />

      <FormFooter
        pending={pendente}
        submitLabel="Salvar modelo"
        onCancel={aoFechar}
        erro={erro}
        submitDisabled={!nome.trim()}
      />
    </form>
  );
}
