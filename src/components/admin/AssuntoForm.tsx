"use client";

import { useActionState, useState } from "react";
import type { AssuntoState } from "@/app/(app)/admin/assuntos/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { Select } from "@/components/ui/Select";
import { FormFooter } from "@/components/ui/FormFooter";
import { PRAZO_MAXIMO, PRAZO_MINIMO } from "@/lib/solicitacoes/regras";
import { listasDoSetorPorEspaco, type ListaParaOAssunto } from "@/lib/solicitacoes/cartao";
import { Aviso } from "@/components/ui/Aviso";
import { Switch } from "@/components/ui/Switch";
import { LinkPublicoDoAssunto } from "@/components/admin/LinkPublicoDoAssunto";

export type AssuntoValores = {
  id?: string;
  label?: string;
  description?: string | null;
  sectorCode?: string;
  responseDays?: number;
  cardPipelineId?: string | null;
  publicLink?: boolean;
};

export function AssuntoForm({
  action,
  cancelHref,
  setores,
  listas,
  valores,
  linkPublico = null,
}: {
  action: (prev: AssuntoState, form: FormData) => Promise<AssuntoState>;
  cancelHref: string;
  setores: { value: string; label: string }[];
  /** As listas ativas dos Quadros, de todos os setores — o campo mostra as do setor escolhido. */
  listas: ListaParaOAssunto[];
  valores?: AssuntoValores;
  /**
   * O link público de pedido deste assunto e o aviso de quando ele não recebe
   * pedido (09/11/2026). Nulo no assunto novo: o link é do id, que só existe
   * depois de criar.
   */
  linkPublico?: { endereco: string; aviso: string | null } | null;
}) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [aceitaLink, setAceitaLink] = useState(valores?.publicLink ?? false);
  const linkAindaNaoSalvo = aceitaLink && !valores?.publicLink;
  // O setor manda nas listas que o "Cartão no quadro" oferece (09/11/2026):
  // trocar o setor troca as opções, e a lista do setor anterior sai da escolha.
  const [setor, setSetor] = useState(valores?.sectorCode ?? "");
  const [lista, setLista] = useState(valores?.cardPipelineId ?? "");
  const grupos = listasDoSetorPorEspaco(listas, setor);
  const listaEscolhida = grupos.some((g) => g.listas.some((l) => l.id === lista)) ? lista : "";
  const semListas = setor !== "" && grupos.length === 0;

  return (
    <form action={formAction} className="space-y-6">
      {valores?.id && <input type="hidden" name="id" value={valores.id} />}

      {state?.error && (
        <Aviso>{state.error}</Aviso>
      )}

      <CampoForm label="Assunto" htmlFor="label" required helper="Como o cliente vê na lista. Ex.: Pedir um documento.">
        <Input id="label" name="label" required maxLength={120} defaultValue={valores?.label ?? ""} />
      </CampoForm>

      <CampoForm
        label="Explicação"
        htmlFor="description"
        helper="Uma linha que ajuda o cliente a escolher; no link público, é a ajuda da mensagem. Ex.: Contrato social, certidão, guia, balancete…"
      >
        <Input id="description" name="description" maxLength={255} defaultValue={valores?.description ?? ""} />
      </CampoForm>

      <FieldGrid>
        <CampoForm label="Setor que atende" htmlFor="sectorCode" required helper="Mudar o setor vale para as próximas solicitações.">
          <Select id="sectorCode" name="sectorCode" required value={setor} onChange={(e) => setSetor(e.target.value)}>
            <option value="">Selecionar…</option>
            {setores.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </CampoForm>
        <CampoForm
          label="Prazo de resposta (dias úteis)"
          htmlFor="responseDays"
          required
          helper="O cliente vê este prazo ao escolher o assunto."
        >
          <CampoNumero
            id="responseDays"
            name="responseDays"
            required
            min={PRAZO_MINIMO}
            max={PRAZO_MAXIMO}
            defaultValue={valores?.responseDays ?? 2}
          />
        </CampoForm>
      </FieldGrid>

      {/* Aparece sempre, desligado por padrão (09/11/2026): sem setor ou sem
          lista no setor, fica desabilitado e diz o caminho — campo escondido é
          campo que o setor não acha. O link abre em outra aba para não perder
          o que já foi digitado aqui. */}
      <CampoForm
        label="Cartão no quadro"
        htmlFor="cardPipelineId"
        helper={
          !setor
            ? "Escolha o setor que atende para ver as listas dos Quadros dele."
            : semListas
              ? "O setor ainda não tem lista nos Quadros. Crie um espaço com o modelo Solicitações de clientes."
              : listaEscolhida
                ? "Cada solicitação nova vira um cartão na coluna Nova desta lista, e o cartão anda com a situação dela."
                : "Escolha uma lista para cada solicitação nova virar um cartão no quadro do setor."
        }
        acao={
          semListas ? (
            <a href={`/setor/${setor}`} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
              Abrir os Quadros do setor
            </a>
          ) : undefined
        }
      >
        <Select
          id="cardPipelineId"
          name="cardPipelineId"
          value={listaEscolhida}
          onChange={(e) => setLista(e.target.value)}
          disabled={!setor || semListas}
        >
          <option value="">Não vira cartão</option>
          {grupos.map((g) => (
            <optgroup key={g.espaco} label={g.espaco}>
              {g.listas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </CampoForm>

      {/* Pedido por link público (09/11/2026): aparece sempre, desligado por
          padrão. Ligado, o link aparece aqui e na linha do assunto, com Copiar
          — no assunto novo, só depois de criar, porque o link é do id. */}
      <div className="flex flex-col gap-1.5">
        <Switch
          id="publicLink"
          name="publicLink"
          value="1"
          checked={aceitaLink}
          onCheckedChange={setAceitaLink}
          rotulo="Aceita pedido por link público"
          aria-describedby="publicLink-ajuda"
        />
        <p id="publicLink-ajuda" className="text-helper text-fg-muted">
          Quem ainda não é cliente preenche um formulário pelo link, sem login, e o pedido chega ao setor como solicitação deste assunto,
          numa empresa prospecto com o nome que a pessoa der. A equipe responde por telefone ou e-mail: a conversa da solicitação não chega
          a quem não tem portal.
        </p>
        {aceitaLink &&
          (linkPublico ? (
            <LinkPublicoDoAssunto
              endereco={linkPublico.endereco}
              aviso={linkAindaNaoSalvo ? "O link passa a receber pedidos quando você salvar." : linkPublico.aviso}
            />
          ) : (
            <p className="text-helper text-fg-secondary">O link aparece aqui e na lista depois de criar o assunto.</p>
          ))}
      </div>

      <FormFooter cancelHref={cancelHref} submitLabel={valores?.id ? "Salvar" : "Criar assunto"} pending={isPending} />
    </form>
  );
}
