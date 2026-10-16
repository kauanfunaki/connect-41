"use client";

import { useActionState, useRef, useState } from "react";
import type { ClienteState, EmpresaParaVincular } from "@/app/(app)/clientes/actions";
import { FormSection } from "@/components/ui/FormSection";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormFooter } from "@/components/ui/FormFooter";
import { Aviso } from "@/components/ui/Aviso";
import { formatCnpj } from "@/lib/format";

export type ClienteDefaultValues = {
  id?: string;
  name?: string;
  cnpjRoot?: string;
  active?: boolean;
};

type Props = {
  action: (prev: ClienteState, form: FormData) => Promise<ClienteState>;
  cancelHref: string;
  defaultValues?: ClienteDefaultValues;
  /**
   * Só no "Novo cliente": as empresas cadastradas com a raiz digitada, para já
   * entrarem no cliente (13/10/2026). Na edição, o mesmo vínculo mora no
   * bloco "Empresas do cliente", embaixo do formulário.
   */
  buscarEmpresasDaRaiz?: (raiz: string) => Promise<EmpresaParaVincular[]>;
};

export function ClienteForm({ action, cancelHref, defaultValues, buscarEmpresasDaRaiz }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  // Raiz controlada: as empresas sugeridas dependem dela, e o React 19 limparia
  // o campo ao fim de um envio com erro, deixando a sugestão sem a raiz.
  const [raiz, setRaiz] = useState(defaultValues?.cnpjRoot ?? "");
  const [sugeridas, setSugeridas] = useState<{ raiz: string; empresas: EmpresaParaVincular[] } | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A busca sai na digitação, não num efeito: a action chega por prop e muda
  // de identidade a cada revalidação.
  function aoMudarRaiz(valor: string) {
    setRaiz(valor);
    if (!buscarEmpresasDaRaiz) return;
    if (espera.current) clearTimeout(espera.current);
    const digitos = valor.replace(/\D/g, "");
    if (digitos.length !== 8) {
      setSugeridas(null);
      return;
    }
    espera.current = setTimeout(async () => {
      try {
        const empresas = await buscarEmpresasDaRaiz(digitos);
        setSugeridas({ raiz: digitos, empresas });
        // Todas marcadas: é o caso comum (matriz e filiais do mesmo cliente).
        setMarcadas(new Set(empresas.map((e) => e.id)));
      } catch {
        // Sugestão é ajuda, não requisito: sem ela, o cliente é criado igual e
        // as empresas se vinculam depois, na edição.
        setSugeridas(null);
      }
    }, 300);
  }

  function alternar(id: string) {
    setMarcadas((atual) => {
      const nova = new Set(atual);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });
  }

  const empresas = sugeridas && sugeridas.raiz === raiz.replace(/\D/g, "") ? sugeridas.empresas : [];
  const saemDeOutro = empresas.filter((e) => marcadas.has(e.id) && e.clienteAtual).length;

  return (
    // Revisão de alinhamento (30/09): o rodapé era [Salvar] [Cancelar] à
    // esquerda — ao contrário de todos os outros formulários; agora é o
    // FormFooter. A raiz do CNPJ (8 dígitos) ganhou coluna do tamanho dela.
    <form action={formAction} className="space-y-6">
      {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}

      {state?.error && (
        <Aviso>
          {state.error}
        </Aviso>
      )}

      <FormSection title="Cliente">
        <FieldGrid columns="sm:grid-cols-[1fr_200px]">
          <CampoForm label="Nome" htmlFor="name" required>
            <Input
              id="name"
              name="name"
              type="text"
              required
              maxLength={180}
              defaultValue={defaultValues?.name ?? ""}
              placeholder="Ex: Grupo Aurora"
            />
          </CampoForm>
          <CampoForm
            label="Raiz do CNPJ"
            htmlFor="cnpjRoot"
            helper="Os 8 primeiros dígitos, quando o cliente é um CNPJ com vários estabelecimentos. Opcional."
          >
            <Input
              id="cnpjRoot"
              name="cnpjRoot"
              type="text"
              maxLength={10}
              value={raiz}
              onChange={(e) => aoMudarRaiz(e.target.value)}
              placeholder="17122471"
            />
          </CampoForm>
        </FieldGrid>

        {empresas.length > 0 && (
          <div className="rounded-md border border-border px-3 py-3 space-y-2">
            <p className="text-ui font-medium text-fg">
              {empresas.length === 1
                ? "Já existe uma empresa cadastrada com esta raiz. Vincular ao cliente?"
                : `Já existem ${empresas.length} empresas cadastradas com esta raiz. Vincular ao cliente?`}
            </p>
            <p className="text-helper text-fg-muted">
              Desmarque a que não for deste cliente. O portal não depende do cliente: o acesso se dá na ficha de cada empresa,
              em “Acesso ao portal”.
            </p>
            <div className="space-y-1.5">
              {empresas.map((e) => (
                <Checkbox
                  key={e.id}
                  id={`empresa-${e.id}`}
                  name="empresaIds"
                  value={e.id}
                  checked={marcadas.has(e.id)}
                  onChange={() => alternar(e.id)}
                  label={
                    <>
                      <span className="text-fg">{e.nome}</span>
                      {e.cnpj && <span className="text-fg-muted tnum"> · {formatCnpj(e.cnpj)}</span>}
                      {e.clienteAtual && <span className="text-fg-muted"> · hoje no cliente {e.clienteAtual}</span>}
                    </>
                  }
                />
              ))}
            </div>
            {saemDeOutro > 0 && (
              <Aviso tom="atencao">
                {saemDeOutro === 1
                  ? "Uma das empresas marcadas está em outro cliente e sai de lá."
                  : `${saemDeOutro} das empresas marcadas estão em outro cliente e saem de lá.`}
              </Aviso>
            )}
          </div>
        )}

        <Checkbox id="active" name="active" defaultChecked={defaultValues?.active ?? true} label="Ativo"
          helper={
            <>
              Cliente inativo não aparece no cadastro de empresas novas, mas continua
              respondendo pelas empresas que já tem.
            </>
          }
        />
      </FormSection>

      <FormFooter cancelHref={cancelHref} pending={isPending} />
    </form>
  );
}
