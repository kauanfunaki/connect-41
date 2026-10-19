"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/Input";
import { CampoForm } from "@/components/ui/CampoForm";
import { useBuscaDoCnpj, ajudaDaBusca, AvisoDaSituacao } from "./BuscaDoCnpj";
import { fichaDaReceitaNosCampos, type FichaDaReceita } from "@/lib/financeiro/fichaDaContraparte";

/**
 * Os campos da contraparte cadastrada no meio do trabalho — o "+ Cadastrar nova
 * contraparte" do lançamento manual e da criação de conta na conciliação.
 *
 * O CNPJ vem primeiro (19/10, pedido 2 do BPO): com ele a Receita preenche o
 * nome e o resto da ficha (fantasia, telefone, endereço), que vai junto em
 * campos ocultos — a tela do lançamento não é lugar para o cadastro inteiro, e
 * a ficha completa se edita depois em Fornecedores e sacados.
 *
 * Devolve os blocos soltos para cada tela encaixar na sua grade.
 */
export function CamposDaContraparteNova({
  idBase,
  companyId,
  nomePadrao = "",
  documentoPadrao = "",
  classeDoDocumento,
  classeDoNome,
  classeDoAviso,
  ajudaDoDocumento,
}: {
  idBase: string;
  companyId: string;
  /** O nome que a tela já sugere — o favorecido da linha do extrato. A Receita o substitui. */
  nomePadrao?: string;
  /** O CPF/CNPJ que a tela já sugere — o beneficiário lido do boleto (lote H2). Com CNPJ, a busca na Receita roda sozinha. */
  documentoPadrao?: string;
  classeDoDocumento?: string;
  classeDoNome?: string;
  classeDoAviso?: string;
  /** Texto de apoio do documento enquanto a busca está parada — "confira no boleto", na leitura pela IA. */
  ajudaDoDocumento?: string;
}) {
  const [documento, setDocumento] = useState(documentoPadrao);
  const [nome, setNome] = useState(nomePadrao);
  const [ficha, setFicha] = useState<FichaDaReceita | null>(null);
  // Nomes que não foram digitados: o sugerido pela tela e os que a Receita
  // escreveu. Só esses a próxima resposta da Receita pode trocar.
  const automaticos = useRef(new Set(nomePadrao ? [nomePadrao] : []));

  const busca = useBuscaDoCnpj(companyId, (achado) => {
    // Já cadastrado: quem grava reaproveita a ficha pelo documento, e o nome
    // digitado aqui nem é usado.
    if (achado.existente) return;
    const f = achado.ficha;
    setNome((atual) => (atual.trim() === "" || automaticos.current.has(atual) ? f.nome : atual));
    automaticos.current.add(f.nome);
    setFicha(f);
  });

  // O CNPJ que veio pronto busca a ficha uma vez, como se tivesse sido digitado.
  const buscouOPadrao = useRef(false);
  useEffect(() => {
    if (buscouOPadrao.current || !documentoPadrao) return;
    buscouOPadrao.current = true;
    busca.buscarAgora(documentoPadrao);
  }, [documentoPadrao, busca]);

  const ocultos = ficha ? { ...fichaDaReceitaNosCampos(ficha), ...(ficha.email ? { email: ficha.email } : {}) } : {};

  return (
    <>
      <CampoForm
        label="CPF ou CNPJ"
        htmlFor={`${idBase}-doc`}
        className={classeDoDocumento}
        {...ajudaDaBusca(busca.estado, { padrao: ajudaDoDocumento ?? "Opcional. Com CNPJ, a Receita preenche o nome e a ficha.", escolheExistente: true })}
      >
        <Input
          id={`${idBase}-doc`}
          name="contraparteDocumento"
          inputMode="numeric"
          value={documento}
          onChange={(e) => {
            setDocumento(e.target.value);
            // A ficha é do CNPJ que estava no campo; outro CNPJ, outra ficha.
            setFicha(null);
            busca.aoDigitar(e.target.value);
          }}
        />
      </CampoForm>
      <CampoForm label="Nome da nova contraparte" htmlFor={`${idBase}-nome`} required className={classeDoNome}>
        <Input id={`${idBase}-nome`} name="contraparteNome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={180} required />
      </CampoForm>
      {Object.entries(ocultos).map(([campo, valor]) => (
        <input key={campo} type="hidden" name={`ficha_${campo}`} value={valor} />
      ))}
      {busca.estado.tipo === "achou" && !busca.estado.achado.ficha.ativa && (
        <div className={classeDoAviso}>
          <AvisoDaSituacao estado={busca.estado} />
        </div>
      )}
    </>
  );
}
