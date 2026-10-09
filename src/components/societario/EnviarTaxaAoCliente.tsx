"use client";

import { useState } from "react";
import { Send, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { CampoForm } from "@/components/ui/CampoForm";
import { FileDropzoneField } from "@/components/ui/FileDropzoneField";
import { enviarTaxaAoCliente, type EnvioDaTaxaState } from "@/app/(app)/processos/actions";
import { validarGuia } from "@/lib/societario/arquivamento";
import type { EnvioDaTaxa } from "@/lib/societario/licencas-data";
import { Aviso } from "@/components/ui/Aviso";

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
      <Button type="button" size="xs" variant="secondary" onClick={() => setAberto(true)}>
        <Send size={12} /> Enviar ao cliente
      </Button>

      <Modal open={aberto} onClose={fechar} title="Enviar guia ao cliente" maxWidth="max-w-lg">
        <form onSubmit={enviar} className="flex flex-col gap-4 text-ui">
          <input type="hidden" name="taxaId" value={taxaId} />

          <p className="text-fg-secondary">{descricao}</p>

          {/* Ficha rótulo/valor no padrão das outras (rótulo em cima, no
              tamanho de helper) — eram títulos de 11px em caixa alta. */}
          <dl className="flex flex-col gap-3">
            <div className="flex flex-col gap-1 min-w-0">
              <dt className="text-helper text-fg-muted">Vai para</dt>
              <dd>
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
              </dd>
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <dt className="text-helper text-fg-muted">Arquivado como</dt>
              <dd className="text-fg break-words">{envio.caminho}</dd>
            </div>
          </dl>

          {/* Contato sem e-mail e e-mail digitado errado dão no mesmo — a pessoa
              não recebe — e só aparecem aqui. */}
          {envio.descartados.length > 0 && (
            <Aviso tom="atencao">
              <p className="font-medium mb-0.5">Ficam de fora</p>
              <ul className="flex flex-col gap-0.5">
                {envio.descartados.map((x, i) => (
                  <li key={`${x.rotulo}-${i}`} className="break-words">
                    {x.rotulo} — {x.motivo}
                  </li>
                ))}
              </ul>
            </Aviso>
          )}

          {/* O campo de arquivo do sistema, e não o input nativo estilizado à
              mão. `accept=".pdf"` (e não o MIME): é pela extensão que ele confere
              e escreve "PDF · até 5 MB"; o tipo real segue conferido no envio. */}
          {!enviado && (
            <CampoForm
              label={envio.temGuia ? "Substituir a guia guardada" : "Guia em PDF"}
              htmlFor={`guia-${taxaId}`}
              required={!envio.temGuia}
              helper={envio.temGuia ? "Opcional." : undefined}
            >
              <FileDropzoneField id={`guia-${taxaId}`} name="guia" accept=".pdf" maxSizeMb={5} required={!envio.temGuia} compacto />
            </CampoForm>
          )}

          {estado && "error" in estado && (
            <Aviso>{estado.error}</Aviso>
          )}

          {estado && "ok" in estado && (
            <Aviso tom="sucesso" className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 font-medium">
                <Check size={14} /> Enviado para {estado.enviados}{" "}
                {estado.enviados === 1 ? "contato" : "contatos"}
              </span>
              {estado.recusados.length > 0 && (
                <span className="text-warning-fg break-all">
                  Recusado pelo servidor de e-mail: {estado.recusados.join(", ")}
                </span>
              )}
            </Aviso>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
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
