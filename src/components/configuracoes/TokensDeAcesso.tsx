"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Copy, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CampoForm } from "@/components/ui/CampoForm";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { Badge, type VarianteDoBadge } from "@/components/ui/Badge";
import { Aviso } from "@/components/ui/Aviso";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { useConfirm } from "@/components/ui/useConfirm";
import { useToast } from "@/components/ui/Toast";
import { VALIDADES, VALIDADE_PADRAO, comandoDoClaudeCode, type Escopo } from "@/lib/tokens-pessoais/regras";
import type { TokenListado } from "@/lib/tokens-pessoais/servidor";
import { criarTokenAction, revogarTokenAction } from "@/app/(app)/configuracoes/tokens-actions";

// Tokens de acesso (05/11/2026, decisão D2): a pessoa cria o token para a IA
// dela (Claude Code, Codex, Cursor) ou um script registrar e atualizar itens
// do Controle interno em nome dela. O token aparece uma vez, com o comando do
// Claude Code já pronto; a lista mostra o que existe e revoga na hora.

type Acesso = "escrever" | "ler";
const ESCOPOS_DO_ACESSO: Record<Acesso, Escopo[]> = {
  escrever: ["controle-interno:ler", "controle-interno:escrever"],
  ler: ["controle-interno:ler"],
};
const ROTULO_DO_ACESSO = (t: TokenListado) => t.scopes.includes("controle-interno:escrever") ? "Consulta e registra" : "Só consulta";
const AJUDA = "/ajuda/geral:tokens-de-acesso";
const DIA = 864e5;

const data = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
function haQuanto(iso: string | null, agora: number) {
  if (!iso) return "nunca usado";
  const dias = Math.floor((agora - new Date(iso).getTime()) / DIA);
  if (dias < 1) return "usado hoje";
  if (dias === 1) return "usado ontem";
  return `usado há ${dias} dias`;
}
function selo(t: TokenListado, agora: number): { variante: VarianteDoBadge; texto: string } {
  if (t.situacao === "revogado") return { variante: "neutral", texto: "Revogado" };
  if (t.situacao === "vencido") return { variante: "neutral", texto: "Vencido" };
  const faltam = (new Date(t.expiresAt).getTime() - agora) / DIA;
  return faltam <= 7 ? { variante: "warning", texto: "Vence em breve" } : { variante: "success", texto: "Ativo" };
}

export function TokensDeAcesso({ meus: iniciais, doEscritorio: escritorioInicial, podeEscrever, origem, agora: agoraIso }: {
  meus: TokenListado[];
  /** Só para o administrador: os ativos de todo o escritório. */
  doEscritorio: TokenListado[] | null;
  podeEscrever: boolean;
  /** O endereço do Connect, para o comando do Claude Code. */
  origem: string;
  /** A hora do servidor: o "usado há" e o "vence em breve" saem iguais no servidor e no navegador. */
  agora: string;
}) {
  const agora = new Date(agoraIso).getTime();
  const [meus, setMeus] = useState(iniciais);
  const [doEscritorio, setDoEscritorio] = useState(escritorioInicial);
  const [nome, setNome] = useState("");
  const [acesso, setAcesso] = useState<Acesso>(podeEscrever ? "escrever" : "ler");
  const [dias, setDias] = useState<number>(VALIDADE_PADRAO);
  const [erro, setErro] = useState("");
  const [criado, setCriado] = useState<{ nome: string; token: string } | null>(null);
  const [criando, iniciar] = useTransition();
  const [revogando, setRevogando] = useState<string | null>(null);
  const toast = useToast();
  const { dialog, requestConfirm } = useConfirm();

  function criar(e: React.FormEvent) {
    e.preventDefault(); setErro(""); setCriado(null);
    iniciar(async () => {
      const r = await criarTokenAction({ name: nome, scopes: ESCOPOS_DO_ACESSO[acesso], days: dias });
      if ("error" in r) { setErro(r.error); return; }
      setMeus(lista => [r.registro, ...lista]);
      setCriado({ nome: r.registro.name, token: r.token });
      setNome("");
    });
  }

  function revogar(t: TokenListado) {
    const deOutraPessoa = !t.proprio;
    requestConfirm({
      title: `Revogar o token "${t.name}"${deOutraPessoa ? ` de ${t.userName}` : ""}?`,
      description: "A IA ou o script que usa este token para de funcionar na hora. Não dá para desfazer: para voltar, é preciso criar outro token.",
      confirmLabel: "Revogar token", destructive: true,
    }, async () => {
      setRevogando(t.id);
      try {
        const r = await revogarTokenAction(t.id);
        if ("error" in r) { toast.error(r.error); return; }
        setMeus(lista => lista.map(x => x.id === t.id ? r.registro : x));
        setDoEscritorio(lista => lista?.filter(x => x.id !== t.id) ?? null);
        toast.success("Token revogado.");
      } finally { setRevogando(null); }
    });
  }

  const copiar = (texto: string, oQue: string) => void navigator.clipboard.writeText(texto)
    .then(() => toast.success(`${oQue} copiado.`), () => toast.error("Não foi possível copiar. Selecione o texto e copie manualmente."));

  const ativos = meus.filter(t => t.situacao === "ativo");
  const inativos = meus.filter(t => t.situacao !== "ativo");
  const comando = criado ? comandoDoClaudeCode(origem, criado.token) : "";

  const linha = (t: TokenListado, comDono = false) => {
    const s = selo(t, agora);
    return (
      <li key={t.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="min-w-0 truncate text-ui font-medium text-fg" title={t.name}>{t.name}</span>
            <Badge variant={s.variante}>{s.texto}</Badge>
          </div>
          <p className="mt-0.5 text-helper text-fg-muted">
            {comDono && <><span className="text-fg-secondary">{t.userName}</span> · </>}
            <span className="font-mono">{t.hint}</span> · {ROTULO_DO_ACESSO(t)} · {t.situacao === "revogado" && t.revokedAt
              ? `revogado em ${data(t.revokedAt)}`
              : `${t.situacao === "vencido" ? "venceu" : "vence"} em ${data(t.expiresAt)}`} · {haQuanto(t.lastUsedAt, agora)}
          </p>
        </div>
        {t.situacao === "ativo" && (
          <Button type="button" size="sm" variant="danger" disabled={revogando === t.id} onClick={() => revogar(t)}
            aria-label={`Revogar o token ${t.name}${comDono ? ` de ${t.userName}` : ""}`}>
            {revogando === t.id ? "Revogando…" : "Revogar"}
          </Button>
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={criar} className="flex flex-col gap-4" aria-label="Criar token de acesso">
        <CampoForm label="Nome do token" htmlFor="token-nome" required helper="Onde ele vai ser usado, para você reconhecer depois. Ex.: Claude Code no notebook.">
          <Input id="token-nome" value={nome} maxLength={120} required autoComplete="off" onChange={e => setNome(e.target.value)} />
        </CampoForm>
        <RadioGroup<Acesso>
          legenda="O que o token pode fazer"
          valor={acesso}
          onChange={setAcesso}
          colunas="sm:grid-cols-2"
          opcoes={[
            {
              valor: "escrever", rotulo: "Consultar e registrar",
              descricao: podeEscrever ? "Lista e abre itens; cria, atualiza, muda a situação, comenta e anexa." : "Seu acesso ao Controle interno é só de consulta.",
              disabled: !podeEscrever,
            },
            { valor: "ler", rotulo: "Só consultar", descricao: "Lista e abre itens, sem alterar nada." },
          ]}
        />
        <div className="flex flex-wrap items-end gap-3">
          <CampoForm label="Validade" htmlFor="token-validade" className="w-full sm:w-48">
            <Select id="token-validade" value={String(dias)} onChange={e => setDias(Number(e.target.value))}>
              {VALIDADES.map(d => <option key={d} value={d}>{d === 365 ? "1 ano" : `${d} dias`}</option>)}
            </Select>
          </CampoForm>
          <Button type="submit" disabled={criando || !nome.trim()}>
            <Plus size={14} /> {criando ? "Criando…" : "Criar token"}
          </Button>
        </div>
        {erro && <Aviso>{erro}</Aviso>}
      </form>

      {criado && (
        <section aria-labelledby="token-criado-titulo" className="flex flex-col gap-3 rounded-lg border border-success/40 bg-success-bg p-4">
          <div>
            <h3 id="token-criado-titulo" className="text-ui font-semibold text-fg">Token “{criado.nome}” criado</h3>
            <p className="mt-0.5 text-helper text-fg-secondary">Copie agora: depois que você sair desta tela, ele não aparece de novo.</p>
          </div>
          <CampoForm label="Token" htmlFor="token-criado">
            <div className="flex gap-2">
              {/* O foco vai para o token assim que ele aparece: quem usa teclado ou leitor de tela cai nele, já selecionado. */}
              <Input id="token-criado" value={criado.token} readOnly autoFocus className="min-w-0 font-mono" onFocus={e => e.target.select()} />
              <Button type="button" variant="secondary" aria-label="Copiar o token" onClick={() => copiar(criado.token, "Token")}><Copy size={14} /> Copiar</Button>
            </div>
          </CampoForm>
          <CampoForm label="Para o Claude Code, rode no terminal" htmlFor="token-comando" helper="Vale para todas as pastas. Depois, abra uma sessão nova do Claude Code: o servidor só carrega quando a sessão começa.">
            <div className="flex gap-2">
              <Input id="token-comando" value={comando} readOnly className="min-w-0 font-mono" onFocus={e => e.target.select()} />
              <Button type="button" variant="secondary" aria-label="Copiar o comando do Claude Code" onClick={() => copiar(comando, "Comando")}><Copy size={14} /> Copiar</Button>
            </div>
          </CampoForm>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link href={AJUDA} className="text-helper text-brand underline-offset-2 hover:underline focus-visible:underline">Como configurar no Codex, no Cursor e em scripts</Link>
            <Button type="button" variant="ghost" size="sm" onClick={() => setCriado(null)}>Já copiei</Button>
          </div>
        </section>
      )}

      <section aria-labelledby="tokens-meus-titulo" className="flex flex-col gap-1">
        <h3 id="tokens-meus-titulo" className="text-ui font-semibold text-fg">Seus tokens</h3>
        {ativos.length ? <ul className="divide-y divide-border">{ativos.map(t => linha(t))}</ul>
          : <p className="py-2 text-helper text-fg-muted">Nenhum token ativo. Crie um acima para conectar sua IA ao Controle interno.</p>}
        {inativos.length > 0 && (
          <BlocoRecolhivel titulo="Vencidos e revogados" resumo={`${inativos.length}`}>
            <ul className="divide-y divide-border">{inativos.map(t => linha(t))}</ul>
          </BlocoRecolhivel>
        )}
      </section>

      {doEscritorio && (
        <BlocoRecolhivel titulo="Tokens ativos do escritório" resumo={`${doEscritorio.length} ${doEscritorio.length === 1 ? "ativo" : "ativos"}`}>
          {doEscritorio.length
            ? <ul className="divide-y divide-border">{doEscritorio.map(t => linha(t, true))}</ul>
            : <p className="py-2 text-helper text-fg-muted">Ninguém do escritório tem token ativo.</p>}
        </BlocoRecolhivel>
      )}
      {dialog}
    </div>
  );
}
