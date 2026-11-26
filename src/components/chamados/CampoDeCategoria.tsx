"use client";

import { Sparkles } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { gruposDeCategorias, type CategoriaNaArvore } from "@/lib/chamados/catalogo";

type Props = {
  id?: string;
  /** A árvore inteira: dá os grupos e os caminhos. */
  categorias: CategoriaNaArvore[];
  /** As que podem ser escolhidas (`categoriasDaEdicao` ou `categoriasClassificaveis`). */
  escolhiveis: CategoriaNaArvore[];
  value: string;
  onChange: (id: string) => void;
  /** Opção de valor vazio no topo ("Deixar para a equipe classificar"). Sem ela, o campo vazio pede a escolha. */
  vazia?: string;
  /** A categoria que a IA sugeriu: leva a marca na lista. */
  sugerida?: string | null;
  required?: boolean;
  disabled?: boolean;
  "aria-describedby"?: string;
};

/**
 * A categoria do chamado num campo de escolha (26/11/2026, melhoria-809,
 * alternativa A): no lugar da grade de 28 botões do "Editar dados" e do
 * "Trocar categoria" e do Select com o caminho inteiro do Novo chamado. É o
 * `Select` do Connect com os grupos da árvore: busca no topo (pelo tipo ou pelo
 * grupo), o grupo em caixa alta com quantos tipos tem, um tipo por linha, e ↑ ↓
 * Enter Esc no teclado. No campo, o grupo apagado antes do tipo:
 * "Desenvolvimento › Bug | Correção".
 */
export function CampoDeCategoria({ id, categorias, escolhiveis, value, onChange, vazia, sugerida, required, disabled, "aria-describedby": descricao }: Props) {
  const grupos = gruposDeCategorias(categorias, escolhiveis);
  return <Select id={id} busca grupoNoCampo contarNosGrupos required={required} disabled={disabled} aria-describedby={descricao}
    value={value} onChange={e => onChange(e.target.value)}
    marcaDaOpcao={sugerida ? valor => valor === sugerida ? <MarcaDaSugestao /> : null : undefined}>
    {vazia ? <option value="">{vazia}</option> : <option value="" disabled>Escolha a categoria</option>}
    {grupos.map(g => <optgroup key={g.id} label={g.nome}>{g.opcoes.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}</optgroup>)}
  </Select>;
}

function MarcaDaSugestao() {
  return <span className="inline-flex shrink-0 items-center gap-1 text-helper font-medium text-brand"><Sparkles size={12} aria-hidden />Sugestão da IA</span>;
}
