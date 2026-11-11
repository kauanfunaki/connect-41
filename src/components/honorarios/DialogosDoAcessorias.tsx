"use client";

import { useId, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { Checkbox } from "@/components/ui/Checkbox";
import { useToast } from "@/components/ui/Toast";
import { ALERTAS_INFORMATIVOS } from "@/lib/honorarios/regras/honorariosRegras";
import { moeda, ROTULO_ALERTA } from "@/lib/honorarios/rotulos";
import type { EmpresaHonorario } from "@/lib/honorarios/servidor/honorariosService";
import { enviarAoAcessorias, enviarLoteAoAcessorias } from "@/app/(app)/honorarios/actions";

const graves = (e: EmpresaHonorario) => e.alertas.filter((a) => !ALERTAS_INFORMATIVOS.has(a));

/** Atualizar o honorário de UMA empresa no Acessórias. Mostra o resultado na própria janela. */
export function DialogoDeEnvio({ empresa: e, aoFechar }: { empresa: EmpresaHonorario; aoFechar: () => void }) {
  const [enviando, iniciar] = useTransition();
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const alerta = graves(e);
  const fonte = e.manual ? `informado por ${e.manual.informadoPor}` : (e.documento?.caminhoRelativo ?? "—");

  function enviar() {
    iniciar(async () => {
      const r = await enviarAoAcessorias({ companyId: e.empresa.id, valorEsperado: e.valor });
      if (!r.ok) setResultado({ ok: false, texto: r.erro });
      else setResultado({ ok: r.resultado === "ok", texto: r.mensagem ?? "" });
    });
  }

  return (
    <Modal open onClose={aoFechar} title="Atualizar honorário no Acessórias" maxWidth="max-w-lg">
      <div className="space-y-4">
        <p className="font-semibold text-fg">{e.empresa.razaoSocial}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-label">
          <dt className="text-fg-muted">No Acessórias</dt>
          <dd className="tabular-nums">{e.acessorias.comparacao === "NAO_CONFERIDO" ? "não conferido (o Connect lê antes de enviar)" : moeda(e.acessorias.valor)}</dd>
          <dt className="text-fg-muted">Vai ficar</dt>
          <dd className="font-semibold tabular-nums">{moeda(e.valor)}</dd>
          <dt className="text-fg-muted">Fonte</dt>
          <dd className="break-words">{fonte}</dd>
        </dl>
        {alerta.length > 0 && (
          <Aviso tom="atencao">Este valor tem alerta: {alerta.map((a) => ROTULO_ALERTA[a].toLowerCase()).join("; ")}.</Aviso>
        )}
        <p className="text-label text-fg-muted">
          O Connect lê a ficha da empresa no Acessórias antes e depois do envio. Se algum outro campo mudar, os envios travam até alguém conferir.
        </p>
        {resultado && (
          <Aviso tom={resultado.ok ? "sucesso" : "perigo"} className="text-label">
            {resultado.texto}
          </Aviso>
        )}
        <div className="flex justify-end gap-2">
          {resultado ? (
            <Button onClick={aoFechar}>Fechar</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={aoFechar}>
                Cancelar
              </Button>
              <Button onClick={enviar} disabled={enviando}>
                {enviando ? "Enviando…" : "Atualizar"}
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Atualizar várias empresas de uma vez. As com alerta ficam de fora, a não ser que a pessoa inclua. */
export function DialogoDeLote({ empresas, aoFechar, aoEnviar }: { empresas: EmpresaHonorario[]; aoFechar: () => void; aoEnviar: () => void }) {
  const toast = useToast();
  const id = useId();
  const [incluirComAlerta, setIncluirComAlerta] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const comAlerta = empresas.filter((e) => graves(e).length > 0);
  const vao = empresas.filter((e) => incluirComAlerta || graves(e).length === 0);

  function enviar() {
    setErro(null);
    iniciar(async () => {
      const r = await enviarLoteAoAcessorias({ itens: vao.map((e) => ({ companyId: e.empresa.id, valorEsperado: e.valor })) });
      if (!r.ok) return setErro(r.erro);
      toast.show(r.mensagem ?? "Envio começou.", "info");
      aoEnviar();
    });
  }

  return (
    <Modal open onClose={aoFechar} title={`Atualizar ${empresas.length} honorário(s) no Acessórias`} maxWidth="max-w-2xl">
      <div className="space-y-4">
        {comAlerta.length > 0 && (
          <div className="space-y-2">
            <p className="text-label text-fg-secondary">
              {comAlerta.length} empresa(s) da seleção têm alerta (valor condicional, de outra empresa do grupo, minuta…) e{" "}
              {incluirComAlerta ? "vão junto" : "ficam de fora"} deste envio.
            </p>
            <Checkbox
              id={`${id}-alerta`}
              checked={incluirComAlerta}
              onChange={(ev) => setIncluirComAlerta(ev.target.checked)}
              label={`Já conferi: incluir as ${comAlerta.length} com alerta`}
            />
          </div>
        )}
        <div className="max-h-72 overflow-y-auto rounded border border-border">
          <table className="w-full text-label">
            <thead className="sticky top-0 bg-surface">
              <tr className="text-micro uppercase tracking-wide text-fg-muted text-left">
                <th className="px-3 py-2 font-medium">Empresa</th>
                <th className="px-3 py-2 font-medium text-right">Acessórias</th>
                <th className="px-3 py-2 font-medium text-right">Vai ficar</th>
              </tr>
            </thead>
            <tbody>
              {empresas.map((e) => {
                const fora = !incluirComAlerta && graves(e).length > 0;
                return (
                  <tr key={e.empresa.id} className={`border-t border-border-soft ${fora ? "text-fg-muted line-through" : ""}`}>
                    <td className="px-3 py-1.5">
                      {e.empresa.razaoSocial}
                      {fora && <span className="no-underline"> · alerta (fica de fora)</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{moeda(e.acessorias.valor)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{moeda(e.valor)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-label text-fg-muted">
          São cerca de 2 segundos por empresa (limite da API do Acessórias). O envio para sozinho se alguma atualização mexer em outro campo.
        </p>
        {erro && <Aviso tom="perigo">{erro}</Aviso>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={enviando || vao.length === 0}>
            {enviando ? "Começando…" : `Atualizar ${vao.length}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
