"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Plus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SlideOver } from "@/components/ui/SlideOver";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Aviso } from "@/components/ui/Aviso";
import { FileDropzoneField } from "@/components/ui/FileDropzoneField";
import { useToast } from "@/components/ui/Toast";
import {
  buscarNoBancoDeTalentos,
  cadastrarEVincularCandidato,
  vincularCandidatoAVaga,
  type CandidatoNaBusca,
  type ResultadoDoVinculo,
} from "@/app/(app)/vagas/[id]/actions";
import { MAX_ORIGEM, ORIGENS, origemParaGravar, type ChaveDaOrigem } from "@/lib/recrutamento/origem";
import { MAX_MB_DO_CURRICULO } from "@/lib/curriculo";

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1]![0] : "")).toUpperCase();
}

/** O nome que a busca sugere para o cadastro: o que foi digitado, se não for e-mail nem número. */
function nomeDaBusca(termo: string): string {
  const t = termo.trim();
  return t.includes("@") || /\d/.test(t) ? "" : t;
}

const ESPERA_DA_BUSCA = 300;

/**
 * "Adicionar candidato" — escolha "Vaga · 5 A" do Kauan (14/10/2026). Um botão
 * no topo do funil abre o painel lateral do Connect: a busca no banco de
 * talentos (nome, CPF ou e-mail), a origem em opções prontas e, para quem é
 * novo, o cadastro com vínculo na hora, sem sair da vaga. Era o formulário
 * "Nova candidatura" no pé do cartão do funil, com um seletor de todos os
 * candidatos e o "Novo candidato" levando para outra tela.
 */
export function AdicionarCandidato({ vagaId, podeCadastrar }: { vagaId: string; podeCadastrar: boolean }) {
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState<"buscar" | "novo">("buscar");
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<CandidatoNaBusca[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [origem, setOrigem] = useState<ChaveDaOrigem | null>(null);
  const [outra, setOutra] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [vinculando, setVinculando] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimaBusca = useRef(0);
  const idDaOrigem = useId();

  function abrir() {
    setModo("buscar");
    setTermo("");
    setResultados(null);
    setBuscando(false);
    setOrigem(null);
    setOutra("");
    setErro(null);
    setAberto(true);
  }

  function voltarABusca() {
    setErro(null);
    setModo("buscar");
  }

  function fechar() {
    if (espera.current) clearTimeout(espera.current);
    setAberto(false);
  }

  async function buscar(texto: string) {
    const n = ++ultimaBusca.current;
    const r = await buscarNoBancoDeTalentos(vagaId, texto);
    // Uma busca mais nova já saiu: esta resposta chegou atrasada.
    if (n !== ultimaBusca.current) return;
    setBuscando(false);
    if ("error" in r) {
      setErro(r.error);
      setResultados(null);
    } else setResultados(r.candidatos);
  }

  function aoDigitar(texto: string) {
    setTermo(texto);
    if (espera.current) clearTimeout(espera.current);
    if (texto.trim().length < 2) {
      ultimaBusca.current++;
      setResultados(null);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    espera.current = setTimeout(() => void buscar(texto), ESPERA_DA_BUSCA);
  }

  function concluir(r: ResultadoDoVinculo) {
    if ("ok" in r) {
      toast.success(`${r.nome} entrou no funil desta vaga.`);
      fechar();
      return;
    }
    setErro(r.error);
    // O e-mail já é de um candidato do banco: volta para a busca, com ele na lista.
    if (r.buscar) {
      setModo("buscar");
      aoDigitar(r.buscar);
    }
  }

  function vincular(c: CandidatoNaBusca) {
    setErro(null);
    setVinculando(c.id);
    startTransition(async () => {
      const r = await vincularCandidatoAVaga(vagaId, { personId: c.id, origem: origemParaGravar(origem, outra) });
      setVinculando(null);
      concluir(r);
    });
  }

  function cadastrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    const form = new FormData(e.currentTarget);
    const o = origemParaGravar(origem, outra);
    if (o) form.set("origem", o);
    startTransition(async () => concluir(await cadastrarEVincularCandidato(vagaId, form)));
  }

  const escolhaDaOrigem = (
    <div className="space-y-2">
      <p id={idDaOrigem} className="c41-rotulo">
        Origem
      </p>
      <div role="group" aria-labelledby={idDaOrigem} className="flex flex-wrap gap-1.5">
        {ORIGENS.map((o) => {
          const ligado = origem === o.chave;
          return (
            <button
              key={o.chave}
              type="button"
              aria-pressed={ligado}
              // Clicar na escolhida desmarca: a origem é opcional.
              onClick={() => setOrigem(ligado ? null : o.chave)}
              className={`rounded-full border px-3 py-1 text-fs-2 transition-colors ${
                ligado ? "border-brand/40 bg-brand-subtle font-semibold text-brand" : "border-border-strong bg-surface text-fg-secondary hover:bg-surface-hover"
              }`}
            >
              {o.rotulo}
            </button>
          );
        })}
      </div>
      {origem === "OUTRA" && (
        <Input
          compact
          value={outra}
          maxLength={MAX_ORIGEM}
          onChange={(e) => setOutra(e.target.value)}
          placeholder="Qual? Ex.: feira de empregos, Indeed"
          aria-label="Outra origem"
        />
      )}
    </div>
  );

  return (
    <>
      <Button size="sm" onClick={abrir} aria-haspopup="dialog">
        <UserPlus size={14} /> Adicionar candidato
      </Button>

      <SlideOver
        open={aberto}
        onClose={fechar}
        title="Adicionar candidato"
        onBack={modo === "novo" ? voltarABusca : undefined}
      >
        {modo === "buscar" ? (
          <div className="flex min-h-full flex-col gap-5">
            <div className="space-y-2">
              <CampoDeBusca
                autoFocus
                value={termo}
                onChange={(e) => aoDigitar(e.target.value)}
                placeholder="Nome, CPF ou e-mail"
                aria-label="Buscar no banco de talentos"
              />
              {erro && <Aviso>{erro}</Aviso>}
            </div>

            <div className="space-y-1.5">
              <p className="c41-rotulo">No banco de talentos</p>
              {termo.trim().length < 2 ? (
                <p className="text-fs-2 text-fg-muted">Digite ao menos duas letras do nome, ou o CPF ou o e-mail.</p>
              ) : buscando && !resultados ? (
                <p className="text-fs-2 text-fg-muted">Procurando…</p>
              ) : resultados && resultados.length === 0 ? (
                <p className="text-fs-2 text-fg-muted">Ninguém no banco com “{termo.trim()}”.</p>
              ) : (
                <ul className={`space-y-0.5 ${buscando ? "opacity-60" : ""}`} aria-busy={buscando || undefined}>
                  {resultados?.map((c) => (
                    <li
                      key={c.id}
                      className={`flex items-center gap-2.5 rounded-md px-2 py-2 ${c.jaNaVaga ? "opacity-60" : "hover:bg-surface-hover"}`}
                    >
                      <span
                        aria-hidden
                        className="flex size-8 flex-shrink-0 items-center justify-center rounded-full bg-brand/10 text-micro font-semibold text-brand"
                      >
                        {iniciais(c.nome)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-ui font-semibold text-fg">{c.nome}</p>
                        <p className="truncate text-micro text-fg-muted">
                          {c.jaNaVaga ? "já está nesta vaga" : c.email ? `${c.desde} · ${c.email}` : c.desde}
                        </p>
                      </div>
                      {!c.jaNaVaga && (
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() => vincular(c)}
                          loading={vinculando === c.id}
                          loadingLabel="Vinculando…"
                          disabled={pendente}
                          aria-label={`Vincular ${c.nome} à vaga`}
                        >
                          Vincular
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {escolhaDaOrigem}

            {podeCadastrar && (
              <div className="mt-auto border-t border-border pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setErro(null);
                    setModo("novo");
                  }}
                >
                  <Plus size={14} /> Não achou? Cadastrar novo candidato
                </Button>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={cadastrar} className="flex min-h-full flex-col gap-4">
            <h3 className="text-label font-semibold text-fg">Cadastrar novo candidato</h3>
            <CampoForm label="Nome" htmlFor="novo-nome" required>
              <Input id="novo-nome" name="name" required maxLength={180} defaultValue={nomeDaBusca(termo)} autoFocus />
            </CampoForm>
            <CampoForm label="E-mail" htmlFor="novo-email">
              <Input id="novo-email" name="email" type="email" maxLength={120} placeholder="nome@email.com" />
            </CampoForm>
            <CampoForm label="Telefone" htmlFor="novo-telefone">
              <Input
                id="novo-telefone"
                name="phone"
                type="tel"
                maxLength={20}
                placeholder="(41) 99999-9999"
                pattern="[\d\s()\-+]{8,20}"
                title="Informe um número de telefone válido"
              />
            </CampoForm>
            <CampoForm label="Currículo em PDF" htmlFor="novo-curriculo" helper="Opcional.">
              <FileDropzoneField id="novo-curriculo" name="curriculo" accept=".pdf,application/pdf" maxSizeMb={MAX_MB_DO_CURRICULO} compacto />
            </CampoForm>
            {escolhaDaOrigem}
            <p className="text-helper text-fg-muted">O resto do cadastro (CPF, endereço, documentos) fica na ficha do candidato.</p>
            {erro && <Aviso>{erro}</Aviso>}
            <div className="mt-auto flex flex-wrap justify-end gap-2 border-t border-border pt-3">
              <Button variant="secondary" onClick={voltarABusca}>
                Voltar à busca
              </Button>
              <Button type="submit" loading={pendente} loadingLabel="Cadastrando…">
                Cadastrar e vincular
              </Button>
            </div>
          </form>
        )}
      </SlideOver>
    </>
  );
}
