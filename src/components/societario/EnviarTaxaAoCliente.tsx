"use client";

import { useState } from "react";
import { Send, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { enviarTaxaAoCliente, type EnvioDaTaxaState } from "@/app/(app)/processos/actions";
import { validarGuia } from "@/lib/societario/arquivamento";
import type { EnvioDaTaxa } from "@/lib/societario/licencas-data";

type Props = { taxaId: string; descricao: string; envio: EnvioDaTaxa };

/**
 * Enviar a guia do Bombeiros ao cliente.
 *
 * O botão não envia: abre a revisão. É e-mail para fora, com a guia de um
 * cliente anexada, e o que a pessoa precisa ver antes é **para quem vai, quem
 * ficou de fora e com que nome o arquivo sai** — os três calculados no servidor
 * pelas mesmas funções que o envio usa.
 */
export function EnviarTaxaAoCliente({ taxaId, descricao, envio }: Props) {
  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState<EnvioDaTaxaState>(null);
  const [enviando, setEnviando] = useState(false);

  const enviado = estado !== null && "ok" in estado;
  const semDestinatario = envio.para.length === 0;

  function fechar() {
    if (enviando) return;
    setAberto(false);
    setEstado(null);
  }

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando) return;
    const form = new FormData(e.currentTarget);

    // Conferido aqui também: acima do corpo máximo da Server Action a recusa
    // acontece antes da action, e chegaria sem dizer que a causa é o tamanho.
    const guia = form.get("guia");
    if (guia instanceof File && guia.size > 0) {
      const v = validarGuia(guia);
      if (!v.ok) {
        setEstado({ error: v.motivo });
        return;
      }
    }

    setEnviando(true);
    setEstado(null);
    try {
      setEstado(await enviarTaxaAoCliente(form));
    } catch {
      setEstado({ error: "Falha ao enviar. Tente novamente." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Button type="button" size="xs" variant="secondary" onClick={() => setAberto(true)} className="mt-1.5">
        <Send size={12} /> Enviar ao cliente
      </Button>

      <Modal open={aberto} onClose={fechar} title="Enviar guia ao cliente" maxWidth="max-w-lg">
        <form onSubmit={enviar} className="px-5 pb-5 flex flex-col gap-3 text-[13px]">
          <input type="hidden" name="taxaId" value={taxaId} />

          <p className="text-fg-secondary">{descricao}</p>

          <div>
            <p className="text-[11px] uppercase tracking-wide text-fg-muted mb-1">Vai para</p>
            {semDestinatario ? (
              <p className="text-danger">Nenhum contato desta empresa tem e-mail válido. Corrija o cadastro antes.</p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {envio.para.map((email) => (
                  <li key={email} className="text-fg break-all">
                    {email}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Contato sem e-mail e e-mail digitado errado dão no mesmo — a pessoa
              não recebe — e só aparecem aqui. */}
          {envio.descartados.length > 0 && (
            <div className="text-[12px] text-warning bg-warning-bg border border-warning/30 rounded-md px-3 py-2">
              <p className="font-medium mb-0.5">Ficam de fora</p>
              <ul className="flex flex-col gap-0.5">
                {envio.descartados.map((x, i) => (
                  <li key={`${x.rotulo}-${i}`} className="break-words">
                    {x.rotulo} — {x.motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="text-[11px] uppercase tracking-wide text-fg-muted mb-1">Arquivado como</p>
            <p className="text-fg break-words">{envio.caminho}</p>
          </div>

          {!enviado && (
            <label className="flex flex-col gap-1">
              <span className="text-[12px] text-fg-secondary">
                {envio.temGuia ? "Substituir a guia guardada (opcional)" : "Guia em PDF, até 5 MB"}
              </span>
              <input
                type="file"
                name="guia"
                accept="application/pdf"
                required={!envio.temGuia}
                className="text-[12px] text-fg-secondary file:mr-3 file:h-8 file:px-3 file:rounded-md file:border file:border-border file:bg-surface file:text-fg file:text-[12px] file:cursor-pointer"
              />
            </label>
          )}

          {estado && "error" in estado && (
            <p className="text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">{estado.error}</p>
          )}

          {estado && "ok" in estado && (
            <div className="text-success bg-success/8 border border-success/20 rounded-md px-3 py-2 flex flex-col gap-1">
              <span className="flex items-center gap-1.5 font-medium">
                <Check size={14} /> Enviado para {estado.enviados}{" "}
                {estado.enviados === 1 ? "contato" : "contatos"}
              </span>
              {estado.recusados.length > 0 && (
                <span className="text-warning break-all">
                  Recusado pelo servidor de e-mail: {estado.recusados.join(", ")}
                </span>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 mt-1">
            <Button type="button" variant="secondary" onClick={fechar} disabled={enviando}>
              {enviado ? "Fechar" : "Cancelar"}
            </Button>
            {!enviado && (
              <Button type="submit" disabled={enviando || semDestinatario}>
                {enviando ? "Enviando…" : "Enviar"}
              </Button>
            )}
          </div>
        </form>
      </Modal>
    </>
  );
}
