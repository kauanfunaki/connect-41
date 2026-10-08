"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { CampoForm } from "@/components/ui/CampoForm";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { opcoesDeEmpresa, type EmpresaParaEscolher } from "@/lib/empresas/opcoesDoSeletor";
import { CampoDeAnexos } from "@/components/pendencias/CampoDeAnexos";
import type { ResultadoDaAbertura } from "@/app/(portal)/portal/(area)/solicitacoes/actions";

type Assunto = { id: string; label: string; description: string | null; responseDays: number };

/**
 * A abertura de uma solicitação pelo cliente.
 *
 * O assunto é a escolha que importa — ele diz quem atende e em quanto tempo —,
 * então vem em cartões com a explicação e o prazo à vista, e não num select
 * fechado onde o cliente só leria o nome.
 */
export function NovaSolicitacaoForm({
  empresas,
  assuntos,
  acao,
}: {
  empresas: (EmpresaParaEscolher & { nome: string })[];
  assuntos: Assunto[];
  acao: (formData: FormData) => Promise<ResultadoDaAbertura>;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [assuntoId, setAssuntoId] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const umaEmpresa = empresas.length === 1 ? empresas[0] : null;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        setErro(null);
        startTransition(async () => {
          const r = await acao(dados);
          if ("error" in r) {
            setErro(r.error);
            return;
          }
          router.push(`/portal/solicitacoes/${r.id}?nova=1`);
        });
      }}
    >
      {umaEmpresa ? (
        <input type="hidden" name="companyId" value={umaEmpresa.id} />
      ) : (
        <CampoForm label="Empresa" htmlFor="solicitacao-empresa" required>
          <SearchableSelect
            id="solicitacao-empresa"
            name="companyId"
            options={opcoesDeEmpresa(empresas)}
            avatar
            lembrarRecentes="empresas"
            placeholder="Buscar empresa…"
            aria-label="Empresa"
          />
        </CampoForm>
      )}

      <RadioGroup
        name="subjectId"
        legenda="Assunto"
        required
        colunas="sm:grid-cols-2"
        valor={assuntoId}
        onChange={setAssuntoId}
        opcoes={assuntos.map((a) => ({
          valor: a.id,
          rotulo: a.label,
          descricao: (
            <>
              {a.description && <span className="block">{a.description}</span>}
              <span className="block mt-1.5 font-medium text-fg-secondary">
                Resposta em até {a.responseDays} {a.responseDays === 1 ? "dia útil" : "dias úteis"}
              </span>
            </>
          ),
        }))}
      />

      <CampoForm
        label="O que você precisa?"
        htmlFor="solicitacao-descricao"
        required
        helper="Quanto mais detalhes, mais rápido a equipe resolve: período, nome do funcionário, número da nota…"
      >
        <Textarea id="solicitacao-descricao" name="description" rows={5} maxLength={5000} required />
      </CampoForm>

      <CampoForm label="Anexos" htmlFor="solicitacao-anexo-0" helper="PDF, PNG, JPG ou XML de até 10 MB cada.">
        <CampoDeAnexos idBase="solicitacao-anexo" />
      </CampoForm>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {erro && <span className="mr-auto text-fs-2 text-danger">{erro}</span>}
        <Button type="submit" disabled={pendente}>
          <Send size={14} /> {pendente ? "Enviando…" : "Enviar solicitação"}
        </Button>
      </div>
    </form>
  );
}
