"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Plus, Settings2, Type } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Popover } from "@/components/ui/Popover";
import { SeletorDeCor, PALETA_DO_CONNECT } from "@/components/ui/SeletorDeCor";
import { FormFooter } from "@/components/ui/FormFooter";
import { QuadradoDoEspaco, DESENHO_DO_ICONE } from "@/components/kanban/QuadradoDoEspaco";
import type { PipelineState } from "@/app/(app)/kanban/actions";
import {
  DESCRICAO_DA_PERMISSAO,
  PERMISSAO_PADRAO,
  PERMISSOES_DO_ESPACO,
  REGRA_FIXA_DO_ESPACO,
  ROTULO_DA_PERMISSAO,
  lerPermissao,
  type PermissaoDoEspaco,
} from "@/lib/kanban/permissaoDoEspaco";
import { ICONES_DO_ESPACO, MODELOS_DE_ESPACO, lerIcone, type IconeDoEspaco } from "@/lib/kanban/modelosDeEspaco";

export type EspacoNaJanela = {
  name: string;
  description: string | null;
  color: string;
  icon: string | null;
  defaultPermission: PermissaoDoEspaco;
};

type Props = {
  action: (prev: PipelineState, form: FormData) => Promise<PipelineState>;
  /** `criar`: botão "Novo espaço" e o modelo; `editar`: "Editar espaço", sem modelo. */
  modo: "criar" | "editar";
  inicial?: EspacoNaJanela;
};

/**
 * A janela do espaço (05/11/2026, no modelo do "Criar espaço" do ClickUp):
 * o quadrado com a inicial — clicável, abre a cor e o ícone —, o nome, a
 * descrição opcional, a permissão padrão dos colaboradores e, ao criar, os
 * modelos (listas e colunas prontas). Sem "Tornar privado": os Quadros não têm
 * acesso de fora, e quem vê é quem é do setor.
 *
 * A mesma janela edita o espaço depois, sem o modelo.
 */
export function JanelaDoEspaco({ action, modo, inicial }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(action, null);
  const enviado = useRef(false);
  const titulo = modo === "criar" ? "Criar espaço" : "Editar espaço";

  // Editar devolve `null` e fica na página: fecha ao terminar sem erro. Criar
  // leva ao espaço novo (redirect), e a janela some com a página.
  useEffect(() => {
    if (enviado.current && !isPending && !state?.error) {
      enviado.current = false;
      setOpen(false);
    }
  }, [isPending, state]);

  return (
    <>
      {modo === "criar" ? (
        <Button type="button" variant="primary" onClick={() => setOpen(true)}>
          <Plus size={14} /> Novo espaço
        </Button>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
          <Settings2 size={14} /> Editar espaço
        </Button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={titulo} maxWidth="max-w-lg">
        {/* Remonta a cada abertura: o formulário volta ao que está salvo. */}
        {open && (
          <FormularioDoEspaco
            modo={modo}
            inicial={inicial}
            erro={state?.error}
            pendente={isPending}
            onCancelar={() => setOpen(false)}
            enviar={(form) => {
              enviado.current = true;
              formAction(form);
            }}
          />
        )}
      </Modal>
    </>
  );
}

function FormularioDoEspaco({
  modo,
  inicial,
  erro,
  pendente,
  onCancelar,
  enviar,
}: {
  modo: Props["modo"];
  inicial?: EspacoNaJanela;
  erro?: string;
  pendente: boolean;
  onCancelar: () => void;
  enviar: (form: FormData) => void;
}) {
  const id = useId();
  const [nome, setNome] = useState(inicial?.name ?? "");
  const [cor, setCor] = useState(inicial?.color ?? PALETA_DO_CONNECT[0]);
  const [icone, setIcone] = useState<IconeDoEspaco | null>(lerIcone(inicial?.icon));
  const [permissao, setPermissao] = useState<PermissaoDoEspaco>(inicial?.defaultPermission ?? PERMISSAO_PADRAO);
  const [modeloId, setModeloId] = useState("");
  const modelo = MODELOS_DE_ESPACO.find((m) => m.id === modeloId) ?? null;

  return (
    <form action={enviar} className="space-y-4">
      <input type="hidden" name="color" value={cor} />
      <input type="hidden" name="icon" value={icone ?? ""} />

      <p className="text-helper text-fg-muted -mt-1">
        Um espaço reúne as pastas e as listas de um trabalho do setor.
      </p>

      <div className="flex items-end gap-3">
        <Popover
          aria-label="Ícone e cor do espaço"
          width={264}
          trigger={({ open, toggle }) => (
            <button
              type="button"
              onClick={toggle}
              aria-label={`Ícone e cor do espaço${nome.trim() ? ` ${nome.trim()}` : ""}`}
              aria-haspopup="dialog"
              aria-expanded={open}
              className="mb-0.5 rounded-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface-elevated"
            >
              <QuadradoDoEspaco nome={nome || "?"} cor={cor} icone={icone} tamanho="lg" />
            </button>
          )}
        >
          <div className="p-3 space-y-3">
            <div>
              <p className="text-micro font-semibold uppercase tracking-wide text-fg-muted mb-2">Cor</p>
              <SeletorDeCor valor={cor} onChange={setCor} corLivre={false} aria-label="Cor do espaço" />
            </div>
            <div>
              <p className="text-micro font-semibold uppercase tracking-wide text-fg-muted mb-2">Ícone</p>
              <div className="grid grid-cols-6 gap-1.5" role="group" aria-label="Ícone do espaço">
                <BotaoDeIcone marcado={icone === null} nome="Inicial do nome" onClick={() => setIcone(null)}>
                  <Type size={15} />
                </BotaoDeIcone>
                {ICONES_DO_ESPACO.map((i) => {
                  const { Icone, nome: nomeDoIcone } = DESENHO_DO_ICONE[i];
                  return (
                    <BotaoDeIcone key={i} marcado={icone === i} nome={nomeDoIcone} onClick={() => setIcone(i)}>
                      <Icone size={15} />
                    </BotaoDeIcone>
                  );
                })}
              </div>
            </div>
          </div>
        </Popover>

        <CampoForm label="Nome" htmlFor={`${id}nome`} required className="flex-1 min-w-0">
          <Input
            id={`${id}nome`}
            name="name"
            required
            autoFocus
            maxLength={80}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="ex.: Fechamento, Clientes do Simples"
          />
        </CampoForm>
      </div>

      <CampoForm label="Descrição" htmlFor={`${id}descricao`} helper="Opcional.">
        <Textarea id={`${id}descricao`} name="description" rows={2} defaultValue={inicial?.description ?? ""} />
      </CampoForm>

      <CampoForm
        label="Permissão padrão"
        htmlFor={`${id}permissao`}
        helper={`${DESCRICAO_DA_PERMISSAO[permissao]} ${REGRA_FIXA_DO_ESPACO}`}
      >
        <Select
          id={`${id}permissao`}
          name="defaultPermission"
          value={permissao}
          onChange={(e) => setPermissao(lerPermissao(e.target.value) ?? PERMISSAO_PADRAO)}
        >
          {PERMISSOES_DO_ESPACO.map((p) => (
            <option key={p} value={p}>
              {ROTULO_DA_PERMISSAO[p]}
            </option>
          ))}
        </Select>
      </CampoForm>

      {modo === "criar" && (
        <CampoForm
          label="Usar modelo"
          htmlFor={`${id}modelo`}
          helper={
            modelo
              ? `Cria ${modelo.listas.length === 1 ? "a lista" : `${modelo.listas.length} listas`} — ${modelo.listas
                  .map((l) => l.nome)
                  .join(", ")} — com as colunas ${modelo.colunas.map((c) => c.nome).join(" → ")}.`
              : "Em branco: o espaço nasce vazio, e as listas você cria depois."
          }
        >
          <Select id={`${id}modelo`} name="modelo" value={modeloId} onChange={(e) => setModeloId(e.target.value)}>
            <option value="">Em branco</option>
            {MODELOS_DE_ESPACO.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome} — {m.resumo}
              </option>
            ))}
          </Select>
        </CampoForm>
      )}

      {erro && (
        <p role="alert" className="text-helper font-medium text-danger">
          {erro}
        </p>
      )}
      <FormFooter
        pending={pendente}
        pendingLabel={modo === "criar" ? "Criando…" : "Salvando…"}
        submitLabel={modo === "criar" ? "Criar espaço" : "Salvar"}
        onCancel={onCancelar}
      />
    </form>
  );
}

function BotaoDeIcone({
  marcado,
  nome,
  onClick,
  children,
}: {
  marcado: boolean;
  nome: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={marcado}
      aria-label={nome}
      title={nome}
      className={`inline-flex size-9 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        marcado
          ? "border-brand bg-brand-subtle text-brand"
          : "border-transparent text-fg-secondary hover:bg-surface-hover hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}
