"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { FormFooter } from "@/components/ui/FormFooter";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { useConfirm } from "@/components/ui/useConfirm";
import { CampoDeAnexos } from "@/components/pendencias/CampoDeAnexos";
import { normalizar } from "@/lib/buscaDeTelas";
import { PUBLICOS, LIMITE_DO_TITULO, marcarComFiliais, type Publico } from "@/lib/comunicados/regras";
import type { ResultadoDoEnvio } from "@/app/(app)/solicitacoes/comunicados/actions";

const MOSTRAR_ATE = 200;

type Empresa = { id: string; nome: string; matrizId: string | null };

/**
 * A lista na ordem da tela: cada matriz seguida das filiais dela (recuadas).
 * Filial cuja matriz não está na lista fica no lugar dela, como matriz.
 */
function emArvore(empresas: Empresa[]): (Empresa & { filial: boolean })[] {
  const presentes = new Set(empresas.map((e) => e.id));
  const filiais = new Map<string, Empresa[]>();
  for (const e of empresas) {
    if (e.matrizId && presentes.has(e.matrizId)) filiais.set(e.matrizId, [...(filiais.get(e.matrizId) ?? []), e]);
  }
  return empresas
    .filter((e) => !e.matrizId || !presentes.has(e.matrizId))
    .flatMap((m) => [{ ...m, filial: false }, ...(filiais.get(m.id) ?? []).map((f) => ({ ...f, filial: true }))]);
}

/**
 * O comunicado novo. A confirmação diz para quantas empresas vai antes de
 * sair: é e-mail para quem tem acesso a elas, e não há como editar depois.
 *
 * Desde 14/10/2026 vai para empresas (era Cliente). Em "Empresas escolhidas",
 * marcar uma matriz marca as filiais dela junto — a regra do portal, em que
 * filial entra por padrão —, e cada filial continua desmarcável.
 */
export function NovoComunicadoForm({
  setores,
  totalDeEmpresas,
  empresas,
  acao,
}: {
  /** Os setores em nome dos quais a pessoa comunica, com quantas empresas cada um atende. */
  setores: { code: string; label: string; empresas: number }[];
  totalDeEmpresas: number;
  empresas: Empresa[];
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

  const arvore = useMemo(() => emArvore(empresas), [empresas]);
  const filtrados = useMemo(() => {
    const termo = normalizar(busca);
    return termo ? arvore.filter((c) => normalizar(c.nome).includes(termo)) : arvore;
  }, [busca, arvore]);

  const quantos =
    publico === "TODOS" ? totalDeEmpresas : publico === "ESCOLHIDOS" ? escolhidos.size : (setores.find((s) => s.code === setor)?.empresas ?? 0);

  function alternar(id: string) {
    setEscolhidos((atual) => marcarComFiliais(atual, id, empresas));
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
          setErro("Nenhuma empresa recebe com essa escolha.");
          return;
        }
        requestConfirm(
          {
            title: `Enviar para ${quantos} ${quantos === 1 ? "empresa" : "empresas"}?`,
            description:
              "O comunicado aparece na hora no portal de quem tem acesso a essas empresas, e cada pessoa recebe um e-mail. Não dá para editar depois.",
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

      <div className="flex flex-col gap-2">
        <RadioGroup
          name="publico"
          legenda="Para quem"
          required
          colunas="sm:grid-cols-3"
          valor={publico}
          onChange={setPublico}
          opcoes={PUBLICOS.map((p) => ({ valor: p.valor, rotulo: p.rotulo, descricao: p.dica }))}
        />
        <p className="text-fs-2 text-fg-secondary tabular-nums">
          {quantos} {quantos === 1 ? "empresa recebe" : "empresas recebem"}
          {publico === "SETOR" && !setor && " — escolha o setor"}
        </p>
      </div>

      {publico === "ESCOLHIDOS" && (
        <div className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border p-2.5">
            <Input
              icon={<Search />}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar empresa…"
              aria-label="Buscar empresa"
              compact
            />
          </div>
          <ul className="scroll-y max-h-72 overflow-y-auto p-1.5">
            {filtrados.slice(0, MOSTRAR_ATE).map((c) => (
              <li key={c.id}>
                <div className={`rounded-md py-1.5 pr-2.5 hover:bg-surface-hover ${c.filial && !busca ? "pl-8" : "pl-2.5"}`}>
                  <Checkbox
                    id={`comunicado-empresa-${c.id}`}
                    name="empresas"
                    value={c.id}
                    checked={escolhidos.has(c.id)}
                    onChange={() => alternar(c.id)}
                    label={c.filial ? `${c.nome} (filial)` : c.nome}
                  />
                </div>
              </li>
            ))}
            {filtrados.length > MOSTRAR_ATE && (
              <li className="px-2.5 py-1.5 text-fs-2 text-fg-muted">Mostrando {MOSTRAR_ATE}. Busque pelo nome para achar o resto.</li>
            )}
            {filtrados.length === 0 && <li className="px-2.5 py-1.5 text-fs-2 text-fg-muted">Nenhuma empresa com esse nome.</li>}
          </ul>
          {/* Os marcados que a busca escondeu continuam indo: o checkbox some da tela, não do envio. */}
          {Array.from(escolhidos)
            .filter((id) => !filtrados.slice(0, MOSTRAR_ATE).some((c) => c.id === id))
            .map((id) => (
              <input key={id} type="hidden" name="empresas" value={id} />
            ))}
          <p className="border-t border-border px-3 py-2 text-helper text-fg-muted">
            Marcar uma matriz marca as filiais dela junto; desmarque a filial que não deve receber.
          </p>
        </div>
      )}

      <CampoForm label="Anexos" htmlFor="comunicado-anexo-0" helper="PDF, PNG, JPG ou XML de até 10 MB cada.">
        <CampoDeAnexos idBase="comunicado-anexo" />
      </CampoForm>

      {/* O rodapé padrão (08/10/2026). O envio espera na confirmação, que já
          mostra o "Enviando…"; aqui não há o que carregar. */}
      <FormFooter pending={false} submitLabel="Enviar comunicado" erro={erro} semDivisoria />
      {dialog}
    </form>
  );
}
