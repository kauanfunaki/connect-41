"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { AcaoDoDp2 } from "@/components/dp2/Formulario";

/**
 * Um cadastro do DP 2 num modal (13/11/2026): o contrato do colaborador, a
 * convenção, a rubrica. Antes eram painéis de 420 px ao lado da lista, com os
 * campos espremidos. O que está aberto continua na URL (`?pessoa=`,
 * `?convencao=`, `?nova=1`), então o link no nome e o botão Editar abrem o
 * mesmo modal; fechar volta para `fecharHref`. Salvo com sucesso, fecha.
 */
export function ModalDoDp2({
  titulo,
  apoio,
  acao,
  rotulo,
  fecharHref,
  children,
}: {
  titulo: string;
  apoio?: React.ReactNode;
  acao?: AcaoDoDp2;
  rotulo?: string;
  fecharHref: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const fechar = () => router.push(fecharHref, { scroll: false });
  const [estado, enviar, enviando] = useActionState<Awaited<ReturnType<AcaoDoDp2>>, FormData>(acao ?? (async () => null), null);

  useEffect(() => {
    if (estado?.ok) router.push(fecharHref, { scroll: false });
  }, [estado, fecharHref, router]);

  return (
    <Modal open onClose={fechar} title={titulo} maxWidth="max-w-3xl">
      {apoio && <p className="text-fs-2 text-fg-muted -mt-1 mb-2">{apoio}</p>}
      {acao ? (
        <form action={enviar} onInput={pularAoCompletar}>
          {children}
          <div className="sticky bottom-0 -mx-5 -mb-5 mt-2 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-surface-elevated px-5 py-4">
            {estado && !estado.ok && (
              <span role="status" className="mr-auto text-fs-2 text-danger">
                {estado.texto}
              </span>
            )}
            <Button type="button" variant="secondary" onClick={fechar}>
              Cancelar
            </Button>
            <Button type="submit" loading={enviando} loadingLabel="Salvando…">
              {rotulo}
            </Button>
          </div>
        </form>
      ) : (
        children
      )}
    </Modal>
  );
}

/**
 * Nos campos marcados com `data-pular`, ao digitar o último caractere que o
 * `maxLength` permite, o cursor vai para o próximo campo do formulário — banco
 * (3), agência (4), dígitos (1). Só ao digitar: apagar não move o cursor.
 */
function pularAoCompletar(e: React.FormEvent<HTMLFormElement>) {
  const campo = e.target;
  if (!(campo instanceof HTMLInputElement) || !campo.hasAttribute("data-pular")) return;
  const tipo = (e.nativeEvent as InputEvent).inputType ?? "";
  if (!tipo.startsWith("insert") || campo.maxLength <= 0 || campo.value.length < campo.maxLength) return;
  const campos = Array.from(e.currentTarget.elements).filter(
    (el): el is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
      (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) && el.type !== "hidden" && !el.disabled,
  );
  const proximo = campos[campos.indexOf(campo) + 1];
  if (!proximo) return;
  proximo.focus();
  if (proximo instanceof HTMLInputElement) proximo.select();
}
