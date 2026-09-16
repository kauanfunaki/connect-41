"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { CampoForm } from "@/components/ui/CampoForm";
import { Modal } from "@/components/ui/Modal";
import { criarPendencia } from "@/app/(app)/pendencias/actions";
import { ROTULO_DO_TIPO, TIPOS_DA_PENDENCIA, LIMITE_DO_TITULO } from "@/lib/financeiro/pendencias/regras";
import { CampoDeAnexos } from "./CampoDeAnexos";

export type LancamentoVinculado = { id: string; companyId: string; rotulo: string };

/**
 * Abrir pendência num modal.
 *
 * Chega aberto quando a tela veio de um lançamento (`/pagar` → "Abrir
 * pendência"): empresa travada na do lançamento e o vínculo já preenchido —
 * trocar a empresa ali faria a action recusar o vínculo de qualquer jeito.
 */
export function NovaPendencia({
  empresas,
  empresaPadrao,
  lancamento,
  abertoDeInicio = false,
}: {
  empresas: { id: string; nome: string }[];
  empresaPadrao?: string;
  lancamento?: LancamentoVinculado | null;
  abertoDeInicio?: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(abertoDeInicio);
  const [erro, setErro] = useState<string | null>(null);
  const [criada, setCriada] = useState<{ id: string; aviso: string } | null>(null);
  const [pendente, startTransition] = useTransition();

  function fechar() {
    setAberto(false);
    setErro(null);
    setCriada(null);
  }

  return (
    <>
      <Button size="sm" onClick={() => setAberto(true)}>
        <Plus size={13} /> Nova pendência
      </Button>
      <Modal open={aberto} onClose={fechar} title="Nova pendência ao cliente" maxWidth="max-w-xl">
        {criada ? (
          // Com aviso (e-mail que não saiu), a pessoa precisa ler antes de ir
          // para a pendência — navegar direto engoliria a mensagem.
          <div className="flex flex-col gap-3">
            <p className="text-[13px]">Pendência aberta.</p>
            <p className="text-[12px] text-warning">{criada.aviso}</p>
            <div className="flex gap-2">
              <Button size="sm" href={`/pendencias/${criada.id}`}>
                Abrir pendência
              </Button>
              <Button size="sm" variant="secondary" onClick={fechar}>
                Fechar
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const dados = new FormData(e.currentTarget);
              setErro(null);
              startTransition(async () => {
                const r = await criarPendencia(dados);
                if ("error" in r) setErro(r.error);
                else if (r.aviso) setCriada({ id: r.id, aviso: r.aviso });
                else router.push(`/pendencias/${r.id}`);
              });
            }}
          >
            {lancamento ? (
              <>
                <input type="hidden" name="companyId" value={lancamento.companyId} />
                <input type="hidden" name="financeEntryId" value={lancamento.id} />
                <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-[12px]">
                  <span className="text-fg-muted">Vinculada ao lançamento </span>
                  <span className="font-medium">{lancamento.rotulo}</span>
                  <span className="text-fg-muted"> · </span>
                  <Link href="/pendencias?nova=1" className="text-brand hover:underline">
                    sem vínculo
                  </Link>
                </div>
              </>
            ) : (
              <CampoForm label="Empresa" htmlFor="pendencia-empresa" required>
                <Select id="pendencia-empresa" name="companyId" defaultValue={empresaPadrao ?? ""} required>
                  <option value="" disabled>
                    Escolha a empresa
                  </option>
                  {empresas.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome}
                    </option>
                  ))}
                </Select>
              </CampoForm>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CampoForm label="Tipo" htmlFor="pendencia-tipo" required>
                <Select id="pendencia-tipo" name="kind" defaultValue="DOCUMENTO">
                  {TIPOS_DA_PENDENCIA.map((t) => (
                    <option key={t} value={t}>
                      {ROTULO_DO_TIPO[t]}
                    </option>
                  ))}
                </Select>
              </CampoForm>
              <CampoForm label="Prazo" htmlFor="pendencia-prazo" helper="Opcional.">
                <Input id="pendencia-prazo" type="date" name="dueDate" />
              </CampoForm>
            </div>

            <CampoForm
              label="Título"
              htmlFor="pendencia-titulo"
              required
              helper="É o que vai no e-mail ao cliente — sem valor nem dado sensível."
            >
              <Input id="pendencia-titulo" name="title" maxLength={LIMITE_DO_TITULO} required placeholder="Comprovante do aluguel de agosto" />
            </CampoForm>

            <CampoForm label="Descrição" htmlFor="pendencia-descricao" helper="Visível só dentro do portal.">
              <Textarea id="pendencia-descricao" name="description" rows={4} maxLength={5000} />
            </CampoForm>

            <CampoForm label="Anexos" htmlFor="pendencia-anexo-0" helper="PDF, PNG, JPG ou XML, até 10 MB cada.">
              <CampoDeAnexos idBase="pendencia-anexo" />
            </CampoForm>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" disabled={pendente}>
                {pendente ? "Abrindo…" : "Abrir pendência"}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={fechar}>
                Cancelar
              </Button>
              {erro && <span className="text-[12px] text-danger">{erro}</span>}
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
