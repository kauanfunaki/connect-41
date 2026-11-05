"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CampoForm } from "@/components/ui/CampoForm";
import { CampoData } from "@/components/ui/CampoData";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { FormFooter } from "@/components/ui/FormFooter";
import { FileDropzone, type ArquivoNaFila } from "@/components/ui/FileDropzone";
import { PilulasDeEscolha } from "@/components/tech-interno/PilulasDeEscolha";
import { uploadComProgresso } from "@/lib/uploadComProgresso";
import { ACCEPT_DO_DRIVE } from "@/lib/drive/tipoDoArquivo";
import { salvarItemTech, comentarItemTech } from "@/app/(app)/controle-interno/actions";
import { TIPOS, PRIORIDADES, SITUACOES, TAMANHOS, ROTA_TECH_INTERNO, ORIGENS_DO_SISTEMA, comVolta, type SistemaTech, type OrigemDoSistema } from "@/lib/tech-interno/regras";

type Pessoa = { id: string; name: string };
export type ItemDoFormulario = {
  id: string; version: number; title: string; description: string | null;
  type: keyof typeof TIPOS; priority: number; status: keyof typeof SITUACOES;
  systemMode: "NONE" | "NEW" | "EXISTING"; systemKey: string | null; assigneeId: string | null; dueDate: string | null;
  assigneeName: string | null;
  size: keyof typeof TAMANHOS | null; originItemId: string | null;
};

const OPCOES_DE_TIPO = Object.entries(TIPOS).map(([valor, rotulo]) => ({ valor, rotulo }));
const OPCOES_DE_PRIORIDADE = PRIORIDADES.map((rotulo, i) => ({ valor: String(i), rotulo }));

/**
 * O formulário do item do Controle interno.
 *
 * `pagina` (05/11/2026, opção A do Kauan — a tela de item novo): a largura toda
 * em duas colunas. À esquerda o que se escreve (título grande, descrição alta e
 * as evidências); à direita o cartão "Detalhes", com Tipo e Prioridade em
 * pílulas de um clique. Abaixo de ~900px de largura do formulário (celular,
 * tablet), uma coluna só, com os detalhes embaixo. O rodapé fica preso no pé
 * da tela enquanto se escreve.
 *
 * `compacta` (a tela do item, que já divide a largura com o histórico): uma
 * coluna, com os detalhes logo abaixo do título — é o que mais se muda ali —
 * e a descrição depois. Mesmas peças, sem cartão dentro de cartão.
 */
export function FormularioItem({ item, sistemas, users, entregas = [], podeEditar, podeDefinirTamanho = false, voltar = ROTA_TECH_INTERNO, disposicao = "pagina" }: {
  item?: ItemDoFormulario; sistemas: SistemaTech[]; users: Pessoa[];
  /** As entregas concluídas, para o "Veio de" (04/11/2026). */
  entregas?: { id: string; title: string }[];
  podeEditar: boolean;
  /** Quem coordena a Tech define o tamanho (04/11/2026). */
  podeDefinirTamanho?: boolean;
  voltar?: string;
  disposicao?: "pagina" | "compacta";
}) {
  // O tamanho trava quando o item sai de Pendente (04/11/2026, lote D).
  const tamanhoTravado = !podeDefinirTamanho || (item ? item.status !== "PENDING" : false);
  const router = useRouter();
  const [sistema, setSistema] = useState(item?.systemMode === "EXISTING" ? item.systemKey ?? "NONE" : item?.systemMode ?? "NONE");
  const [erro, setErro] = useState("");
  const { show } = useToast();
  const [pendente, iniciar] = useTransition();
  // Na criação, os anexos esperam o item existir e sobem um por vez logo depois.
  const [fila, setFila] = useState<ArquivoNaFila[]>([]);
  // As miniaturas são endereços locais do navegador: saem junto com o arquivo
  // da fila e, no fim, ao sair da tela.
  const filaAtual = useRef<ArquivoNaFila[]>([]);
  useEffect(() => { filaAtual.current = fila; }, [fila]);
  useEffect(() => () => { for (const a of filaAtual.current) if (a.miniatura) URL.revokeObjectURL(a.miniatura); }, []);
  const adicionar = (files: File[]) => {
    const novos = files.map(file => ({ id: crypto.randomUUID(), file, progresso: 0, estado: "pendente" as const, miniatura: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined }));
    setFila(f => [...f, ...novos]);
  };
  const remover = (id: string) => {
    const saindo = fila.find(a => a.id === id);
    if (saindo?.miniatura) URL.revokeObjectURL(saindo.miniatura);
    setFila(f => f.filter(a => a.id !== id));
  };
  const modo = sistema === "NONE" || sistema === "NEW" ? sistema : "EXISTING";
  const responsaveis = item?.assigneeId && !users.some(u => u.id === item.assigneeId)
    ? [...users, { id: item.assigneeId, name: `${item.assigneeName ?? "Responsável anterior"} (indisponível)` }] : users;
  const pagina = disposicao === "pagina";

  const titulo = <CampoForm label="Título" htmlFor="tech-title" required>
    <Input id="tech-title" name="title" required maxLength={200} defaultValue={item?.title} grande={pagina}
      placeholder={pagina ? "Em uma frase: o que precisa ser feito ou o que está errado" : undefined} />
  </CampoForm>;
  const descricao = <CampoForm label="Descrição" htmlFor="tech-description" helper={pagina ? "Onde acontece, o que se esperava e os passos para ver de novo." : undefined}>
    <Textarea id="tech-description" name="description" rows={pagina ? 12 : 6} maxLength={10000} defaultValue={item?.description ?? ""} />
  </CampoForm>;
  const evidencias = !item && podeEditar && <div role="group" aria-labelledby="tech-anexos-rotulo" aria-describedby="tech-anexos-ajuda" className="flex flex-col gap-1.5 min-w-0">
    <span id="tech-anexos-rotulo" className="text-label font-medium leading-5 text-fg">Evidências <span className="font-normal text-fg-muted">(opcional)</span></span>
    <p id="tech-anexos-ajuda" className="text-helper text-fg-muted">Prints de tela, PDFs e planilhas. Sobem junto com o item.</p>
    <FileDropzone accept={ACCEPT_DO_DRIVE} maxSizeMb={10} multiple colarNaPagina arquivos={fila} desabilitado={pendente} onAdicionar={adicionar} onRemover={remover} />
  </div>;

  const detalhes = <>
    <PilulasDeEscolha legenda="Tipo" name="type" opcoes={OPCOES_DE_TIPO} valorInicial={item?.type} required />
    <PilulasDeEscolha legenda="Prioridade" name="priority" opcoes={OPCOES_DE_PRIORIDADE} valorInicial={String(item?.priority ?? 1)} required />
    {/* Sistema e Situação ocupam a linha toda no cartão estreito; Responsável
        e Prazo dividem uma. Com espaço (a tela do item, o tablet), dois a dois. */}
    <div className="@container">
      <div className="grid grid-cols-1 gap-4 @xs:grid-cols-2">
        {/* Os robôs, sites e apps do Ops Center, com busca: a lista cresce com o
            cadastro de lá (29/10/2026). Inativo só aparece no item que já o usa. */}
        <CampoForm label="Sistema" htmlFor="tech-system" helper="Do cadastro do Ops Center." className="@xs:col-span-2 @lg:col-span-1"><Select id="tech-system" busca value={sistema} onChange={e => setSistema(e.target.value)}>
          <option value="NONE">Sem sistema</option><option value="NEW">Novo sistema</option>
          {(Object.keys(ORIGENS_DO_SISTEMA) as OrigemDoSistema[]).map(origem => {
            const daOrigem = sistemas.filter(s => s.origem === origem && (s.ativo || s.chave === item?.systemKey));
            return daOrigem.length ? <optgroup key={origem} label={ORIGENS_DO_SISTEMA[origem]}>
              {daOrigem.map(s => <option key={s.chave} value={s.chave}>{s.nome}{!s.ativo ? " (inativo)" : ""}</option>)}
            </optgroup> : null;
          })}
        </Select></CampoForm>
        <CampoForm label="Situação" htmlFor="tech-status" required className="@xs:col-span-2 @lg:col-span-1"><Select id="tech-status" name="status" defaultValue={item?.status ?? "PENDING"}>{Object.entries(SITUACOES).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</Select></CampoForm>
        <CampoForm label="Responsável" htmlFor="tech-assignee"><Select id="tech-assignee" name="assigneeId" defaultValue={item?.assigneeId ?? ""}><option value="">Sem responsável</option>{responsaveis.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></CampoForm>
        <CampoForm label="Prazo" htmlFor="tech-due" helper="Opcional."><CampoData id="tech-due" name="dueDate" min="1900-01-01" max="9999-12-31" defaultValue={item?.dueDate ?? ""} /></CampoForm>
      </div>
    </div>
  </>;
  // Tamanho e "veio de": o que quase nunca se mexe ao abrir o item, em linhas
  // discretas no fim, separadas do resto.
  const linhasDiscretas = <div className="flex flex-col gap-3 border-t border-border pt-4">
      {tamanhoTravado
        ? <div className={GRADE_DISCRETA}>
          {/* Travado não vai no envio: o valor de antes segue num campo escondido. */}
          <input type="hidden" name="size" value={item?.size ?? ""} />
          <span className="text-ui font-medium text-fg-secondary">Tamanho</span>
          <span className="text-ui text-fg">{item?.size ? `${item.size} · ${TAMANHOS[item.size]}` : "Sem tamanho"}</span>
          <p className="col-start-2 flex items-center gap-1.5 text-helper text-fg-muted"><Lock size={12} aria-hidden className="shrink-0" />{!podeDefinirTamanho ? "Quem coordena a Tech define." : "Travado: o item já começou."}</p>
        </div>
        : <LinhaDiscreta rotulo="Tamanho" htmlFor="tech-size" ajuda="P, M ou G — trava quando o item começa.">
          <Select id="tech-size" name="size" defaultValue={item?.size ?? ""} compact aria-describedby="tech-size-ajuda">
            <option value="">Sem tamanho</option>
            {Object.entries(TAMANHOS).map(([v, label]) => <option key={v} value={v}>{v} · {label}</option>)}
          </Select>
        </LinhaDiscreta>}
      <LinhaDiscreta rotulo="Veio de" htmlFor="tech-origin" ajuda="A entrega que gerou este item — o retrabalho dela.">
        <Select id="tech-origin" name="originItemId" defaultValue={item?.originItemId ?? ""} compact aria-describedby="tech-origin-ajuda">
          <option value="">Não veio de uma entrega</option>
          {entregas.filter(e => e.id !== item?.id).map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
        </Select>
      </LinhaDiscreta>
    </div>;

  return <form className={pagina ? "@container flex flex-col gap-6" : "flex flex-col gap-5"} onSubmit={e => {
    e.preventDefault(); const form = new FormData(e.currentTarget); setErro("");
    iniciar(async () => {
      try {
        const r = await salvarItemTech(item?.id, form);
        if ("error" in r) { setErro(r.error); return; }
        let falhas = 0;
        if (!item) for (const a of fila) {
          setFila(f => f.map(x => x.id === a.id ? { ...x, estado: "enviando", progresso: 0 } : x));
          const envio = new FormData(); envio.set("itemId", r.id); envio.set("arquivo", a.file);
          const up = await uploadComProgresso("/api/tech-interno/anexos", envio, pct => setFila(f => f.map(x => x.id === a.id ? { ...x, progresso: pct } : x)));
          if (!up.ok) falhas++;
          setFila(f => f.map(x => x.id === a.id ? (up.ok ? { ...x, estado: "concluido", progresso: 100 } : { ...x, estado: "erro", erro: up.erro }) : x));
        }
        show(item ? "Alterações salvas." : falhas ? `Item criado, mas ${falhas === 1 ? "um anexo não foi enviado" : `${falhas} anexos não foram enviados`}. Anexe de novo na tela do item.` : "Item criado.", falhas ? "error" : "success");
        if (!item) router.replace(comVolta(`${ROTA_TECH_INTERNO}/${r.id}`, voltar));
        else router.refresh();
      } catch { setErro("Não foi possível confirmar o salvamento. Atualize a página antes de tentar novamente."); }
    });
  }}>
    <input type="hidden" name="version" value={item?.version ?? 0} />
    <input type="hidden" name="systemMode" value={modo} />
    <input type="hidden" name="systemKey" value={modo === "EXISTING" ? sistema : ""} />
    <fieldset disabled={!podeEditar || pendente} className="contents">
      {pagina
        ? <div className="grid grid-cols-1 items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_24rem]">
          <Card as="section" aria-label="O que é o item" className="min-w-0 p-5 flex flex-col gap-5">{titulo}{descricao}{evidencias}</Card>
          <Card as="section" aria-labelledby="tech-detalhes" className="min-w-0 p-5 flex flex-col gap-5">
            <h2 id="tech-detalhes" className="text-card-title font-semibold text-fg">Detalhes</h2>
            {detalhes}{linhasDiscretas}
          </Card>
        </div>
        : <>{titulo}{detalhes}{descricao}{linhasDiscretas}</>}
    </fieldset>
    {!podeEditar ? <p className="text-helper text-fg-muted text-right">Acesso somente para consulta.</p>
      : pagina
        // Preso no pé da tela: o "Criar item" fica à vista enquanto se escreve
        // uma descrição longa. Encosta nas bordas da moldura (o `p-6` do
        // PageContainer) para ler como barra, não como mais um cartão.
        ? <div className="sticky bottom-0 z-10 -mx-6 -mb-6 border-t border-border bg-surface px-6 py-3">
          <FormFooter semDivisoria pending={pendente} submitLabel={item ? "Salvar alterações" : "Criar item"} pendingLabel={item ? undefined : "Criando…"} cancelHref={voltar} erro={erro || undefined} />
        </div>
        : <FormFooter pending={pendente} submitLabel={item ? "Salvar alterações" : "Criar item"} pendingLabel={item ? undefined : "Criando…"} cancelHref={voltar} erro={erro || undefined} />}
  </form>;
}

const GRADE_DISCRETA = "grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 min-w-0";

/** Rótulo à esquerda e o campo à direita, na fonte de apoio: o campo existe, mas não pede atenção. */
function LinhaDiscreta({ rotulo, htmlFor, ajuda, children }: { rotulo: string; htmlFor: string; ajuda: string; children: React.ReactNode }) {
  return <div className={GRADE_DISCRETA}>
    <label htmlFor={htmlFor} className="text-ui font-medium text-fg-secondary">{rotulo}</label>
    {children}
    <p id={`${htmlFor}-ajuda`} className="col-start-2 text-helper text-fg-muted">{ajuda}</p>
  </div>;
}

export function FormularioComentario({ id }: { id: string }) {
  const router = useRouter(); const [texto, setTexto] = useState(""); const [erro, setErro] = useState(""); const [pendente, iniciar] = useTransition();
  return <form className="flex flex-col gap-3" onSubmit={e => {
    e.preventDefault(); const form = new FormData(e.currentTarget); setErro("");
    iniciar(async () => {
      try {
        const r = await comentarItemTech(id, form);
        if ("error" in r) { setErro(r.error); return; }
        setTexto(""); router.refresh();
      } catch { setErro("Não foi possível confirmar o comentário. Atualize a página para conferir antes de tentar novamente."); }
    });
  }}>
    <CampoForm label="Comentário" htmlFor="tech-comment"><Textarea id="tech-comment" name="body" value={texto} onChange={e => setTexto(e.target.value)} rows={3} maxLength={5000} required disabled={pendente} /></CampoForm>
    {erro && <p role="alert" className="text-helper text-danger">{erro}</p>}
    <Button className="self-end" type="submit" loading={pendente}><MessageSquarePlus size={14} aria-hidden />Adicionar comentário</Button>
  </form>;
}
