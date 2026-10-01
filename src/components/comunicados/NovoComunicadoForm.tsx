"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { useConfirm } from "@/components/ui/useConfirm";
import { CampoDeAnexos } from "@/components/pendencias/CampoDeAnexos";
import { normalizar } from "@/lib/buscaDeTelas";
import { PUBLICOS, LIMITE_DO_TITULO, type Publico } from "@/lib/comunicados/regras";
import type { ResultadoDoEnvio } from "@/app/(app)/solicitacoes/comunicados/actions";

const MOSTRAR_ATE = 200;

/**
 * O comunicado novo. A confirmação diz para quantos clientes vai antes de
 * sair: é e-mail para todos eles, e não há como editar depois.
 */
export function NovoComunicadoForm({
  setores,
  totalDeClientes,
  clientes,
  acao,
}: {
  /** Os setores em nome dos quais a pessoa comunica, com quantos clientes cada um atende. */
  setores: { code: string; label: string; clientes: number }[];
  totalDeClientes: number;
  clientes: { id: string; nome: string }[];
  acao: (formData: FormData) => Promise<ResultadoDoEnvio>;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const { dialog, requestConfirm } = useConfirm();
  const [setor, setSetor] = useState(setores.length === 1 ? setores[0]!.code : "");
  const [publico, setPublico] = useState<Publico>("SETOR");
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const filtrados = useMemo(() => {
    const termo = normalizar(busca);
    return termo ? clientes.filter((c) => normalizar(c.nome).includes(termo)) : clientes;
  }, [busca, clientes]);

  const quantos =
    publico === "TODOS" ? totalDeClientes : publico === "ESCOLHIDOS" ? escolhidos.size : (setores.find((s) => s.code === setor)?.clientes ?? 0);

  function alternar(id: string) {
    setEscolhidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        if (!e.currentTarget.reportValidity()) return;
        if (quantos === 0) {
          setErro("Nenhum cliente recebe com essa escolha.");
          return;
        }
        requestConfirm(
          {
            title: `Enviar para ${quantos} ${quantos === 1 ? "cliente" : "clientes"}?`,
            description: "O comunicado aparece no portal na hora e cada usuário do portal recebe um e-mail. Não dá para editar depois.",
            confirmLabel: "Enviar comunicado",
          },
          async () => {
            const r = await acao(new FormData(formRef.current!));
            if ("error" in r) throw new Error(r.error);
            router.push(`/solicitacoes/comunicados/${r.id}`);
          }
        );
      }}
    >
      <CampoForm label="Setor que comunica" htmlFor="comunicado-setor" required helper="O cliente vê de qual setor veio.">
        <Select id="comunicado-setor" name="setor" required value={setor} onChange={(e) => setSetor(e.target.value)}>
          <option value="" disabled>
            Escolha o setor
          </option>
          {setores.map((s) => (
            <option key={s.code} value={s.code}>
              {s.label}
            </option>
          ))}
        </Select>
      </CampoForm>

      <CampoForm label="Título" htmlFor="comunicado-titulo" required helper="Vai no assunto do e-mail.">
        <Input id="comunicado-titulo" name="titulo" required maxLength={LIMITE_DO_TITULO} placeholder="Ex.: Recesso de fim de ano" />
      </CampoForm>

      <CampoForm label="Texto" htmlFor="comunicado-texto" required helper="O texto completo fica no portal.">
        <Textarea id="comunicado-texto" name="texto" rows={8} maxLength={10_000} required />
      </CampoForm>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[length:var(--fs-label)] font-medium text-fg">
          Para quem <span className="text-danger">*</span>
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {PUBLICOS.map((p) => (
            <label
              key={p.valor}
              className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors ${
                publico === p.valor ? "border-brand bg-brand-subtle shadow-[inset_0_0_0_1px_var(--c41-brand)]" : "border-border bg-surface hover:border-border-strong"
              }`}
            >
              <input
                type="radio"
                name="publico"
                value={p.valor}
                checked={publico === p.valor}
                onChange={() => setPublico(p.valor)}
                className="mt-1 accent-[var(--c41-brand)]"
              />
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold text-fg">{p.rotulo}</span>
                <span className="block text-[12px] text-fg-muted leading-snug">{p.dica}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="text-[12.5px] text-fg-secondary tabular-nums">
          {quantos} {quantos === 1 ? "cliente recebe" : "clientes recebem"}
          {publico === "SETOR" && !setor && " — escolha o setor"}
        </p>
      </fieldset>

      {publico === "ESCOLHIDOS" && (
        <div className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border p-2.5">
            <Input
              icon={<Search />}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente…"
              aria-label="Buscar cliente"
              compact
            />
          </div>
          <ul className="scroll-y max-h-72 overflow-y-auto p-1.5">
            {filtrados.slice(0, MOSTRAR_ATE).map((c) => (
              <li key={c.id}>
                <div className="rounded-md px-2.5 py-1.5 hover:bg-surface-hover">
                  <Checkbox
                    id={`comunicado-cliente-${c.id}`}
                    name="grupos"
                    value={c.id}
                    checked={escolhidos.has(c.id)}
                    onChange={() => alternar(c.id)}
                    label={c.nome}
                  />
                </div>
              </li>
            ))}
            {filtrados.length > MOSTRAR_ATE && (
              <li className="px-2.5 py-1.5 text-[12px] text-fg-muted">Mostrando {MOSTRAR_ATE}. Busque pelo nome para achar o resto.</li>
            )}
            {filtrados.length === 0 && <li className="px-2.5 py-1.5 text-[12px] text-fg-muted">Nenhum cliente com esse nome.</li>}
          </ul>
          {/* Os marcados que a busca escondeu continuam indo: o checkbox some da tela, não do envio. */}
          {Array.from(escolhidos)
            .filter((id) => !filtrados.slice(0, MOSTRAR_ATE).some((c) => c.id === id))
            .map((id) => (
              <input key={id} type="hidden" name="grupos" value={id} />
            ))}
        </div>
      )}

      <CampoForm label="Anexos" htmlFor="comunicado-anexo-0" helper="PDF, PNG, JPG ou XML de até 10 MB cada.">
        <CampoDeAnexos idBase="comunicado-anexo" />
      </CampoForm>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {erro && <span className="mr-auto text-[12.5px] text-danger">{erro}</span>}
        <Button type="submit">
          <Send size={14} /> Enviar comunicado
        </Button>
      </div>
      {dialog}
    </form>
  );
}
