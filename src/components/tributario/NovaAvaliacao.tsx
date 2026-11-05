"use client";

// "Nova avaliação": escolher o modo (rápida, pelos totais, ou analítica, em
// etapas), para quem é (uma empresa do cadastro ou um prospecto sem cadastro)
// e o ano dos dados. A avaliação já nasce salva, com os dados da empresa, e
// abre na área de trabalho.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Layers3, Plus, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { criarAvaliacaoTributaria } from "@/app/(app)/planejamento-tributario/actions";
import { formatCnpj } from "@/lib/format";
import { ROTA_DO_PLANEJAMENTO, type ModoDaAvaliacao } from "@/lib/tributario/regras";

export type EmpresaParaEscolher = { id: string; nome: string; cnpj?: string | null };

const MODOS: { modo: ModoDaAvaliacao; titulo: string; texto: string; icone: React.ReactNode }[] = [
  { modo: "rapida", titulo: "Avaliação rápida", texto: "Informe os totais, explore os cenários e aprofunde quando precisar.", icone: <Zap size={20} /> },
  { modo: "guiada", titulo: "Avaliação analítica", texto: "Um caminho guiado em oito etapas: preencha apenas o que faltar.", icone: <Layers3 size={20} /> },
];

export function NovaAvaliacao({ empresas, anoAtual }: { empresas: EmpresaParaEscolher[]; anoAtual: number }) {
  const router = useRouter();
  const [aberta, setAberta] = useState(false);
  const [modo, setModo] = useState<ModoDaAvaliacao>("rapida");
  const [origem, setOrigem] = useState<"empresa" | "prospecto">("empresa");
  const [empresaId, setEmpresaId] = useState("");
  const [prospecto, setProspecto] = useState("");
  const [ano, setAno] = useState(anoAtual);
  const [erro, setErro] = useState("");
  const [enviando, iniciar] = useTransition();

  const anos = Array.from({ length: 5 }, (_, i) => anoAtual - 3 + i).filter((a) => a >= 2020 && a <= 2033);

  function criar() {
    setErro("");
    iniciar(async () => {
      const r = await criarAvaliacaoTributaria({
        modo,
        ano,
        companyId: origem === "empresa" ? empresaId : null,
        prospecto: origem === "prospecto" ? prospecto : null,
      });
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      setAberta(false);
      router.push(`${ROTA_DO_PLANEJAMENTO}/${r.id}`);
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setAberta(true)}>
        <Plus size={14} /> Nova avaliação
      </Button>
      <Modal open={aberta} onClose={() => setAberta(false)} title="Nova avaliação" maxWidth="max-w-xl">
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Modo da avaliação">
            {MODOS.map((m) => (
              <button
                key={m.modo}
                type="button"
                role="radio"
                aria-checked={modo === m.modo}
                onClick={() => setModo(m.modo)}
                className={`flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors ${
                  modo === m.modo ? "border-brand-solid bg-surface-2" : "border-border bg-surface hover:bg-surface-2"
                }`}
              >
                <span className="flex items-center gap-2 text-card-title font-semibold text-fg">
                  {m.icone} {m.titulo}
                </span>
                <span className="text-helper text-fg-secondary">{m.texto}</span>
              </button>
            ))}
          </div>

          <SegmentedControl
            label="Para quem é a avaliação"
            active={origem}
            onChange={(k) => setOrigem(k as "empresa" | "prospecto")}
            items={[
              { key: "empresa", label: "Empresa do cadastro" },
              { key: "prospecto", label: "Prospecto sem cadastro" },
            ]}
          />

          {origem === "empresa" ? (
            <CampoForm label="Empresa" htmlFor="nova-avaliacao-empresa" helper="Nome, CNPJ, regime e UF vêm do cadastro.">
              <SearchableSelect
                id="nova-avaliacao-empresa"
                name="empresa"
                placeholder="Busque pelo nome ou CNPJ"
                options={empresas.map((e) => ({
                  value: e.id,
                  label: e.nome,
                  descricao: e.cnpj ? formatCnpj(e.cnpj) : undefined,
                  busca: e.cnpj ? `${e.nome} ${e.cnpj} ${e.cnpj.replace(/\D/g, "")}` : e.nome,
                }))}
                onChange={setEmpresaId}
              />
            </CampoForm>
          ) : (
            <CampoForm label="Nome do prospecto" htmlFor="nova-avaliacao-prospecto" helper="O CNPJ e os demais dados podem ser preenchidos depois.">
              <Input id="nova-avaliacao-prospecto" value={prospecto} maxLength={160} onChange={(e) => setProspecto(e.target.value)} />
            </CampoForm>
          )}

          <CampoForm label="Ano dos dados" htmlFor="nova-avaliacao-ano" helper="O período começa em 1º de janeiro e termina em 31 de dezembro; dá para ajustar depois.">
            <Select id="nova-avaliacao-ano" value={ano} onChange={(e) => setAno(Number(e.target.value))}>
              {anos.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </CampoForm>

          {erro && <p className="text-fs-2 text-danger">{erro}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAberta(false)}>
              Cancelar
            </Button>
            <Button
              onClick={criar}
              loading={enviando}
              loadingLabel="Criando…"
              disabled={origem === "empresa" ? !empresaId : !prospecto.trim()}
            >
              Criar avaliação
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
