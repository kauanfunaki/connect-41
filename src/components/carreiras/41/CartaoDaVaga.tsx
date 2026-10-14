import Link from "next/link";
import { ArrowRight, Clock, Hourglass } from "lucide-react";
import { CONTRATO_LABEL, MODALIDADE_LABEL } from "@/lib/carreiras/portal";
import { haQuantoTempo, localLegivel, seloDoPrazo } from "@/lib/carreiras/apresentacao";
import { caminhoDoLogoDaVaga } from "@/lib/carreiras/enderecoDeCarreiras";
import type { VagaAberta } from "@/lib/carreiras/vagasDoPortal";
import { LogoDaEmpresa } from "./LogoDaEmpresa";

type Props = {
  vaga: VagaAberta;
  slug: string;
  agora: Date;
  /** A página da vaga. */
  href: string;
  /**
   * Na lista com a vaga ao lado (tela larga), o clique abre a vaga no painel
   * — e no celular continua indo para a página dela.
   */
  hrefNoPainel?: string;
  /** A vaga aberta no painel ao lado. */
  escolhida?: boolean;
  compacto?: boolean;
  titulo?: "h2" | "h3";
};

/**
 * O cartão de uma vaga (15/10/2026): logo ou iniciais da empresa, o título,
 * a empresa e a cidade, as etiquetas (modelo, contrato, área), há quanto
 * tempo foi publicada e o selo de prazo quando faltam 7 dias ou menos. O
 * cartão inteiro é clicável (o link do título se estende sobre ele).
 */
export function CartaoDaVaga({ vaga, slug, agora, href, hrefNoPainel, escolhida = false, compacto = false, titulo: Titulo = "h3" }: Props) {
  const local = localLegivel(vaga.cidade, vaga.uf);
  const prazo = seloDoPrazo(vaga.applicationDeadline, agora);
  const etiquetas = [
    vaga.workMode ? MODALIDADE_LABEL[vaga.workMode] : null,
    vaga.contractType ? CONTRATO_LABEL[vaga.contractType] : null,
    vaga.area,
  ].filter((e): e is string => !!e);

  return (
    <article className={`t41-cartao${compacto ? " t41-cartao--compacto" : ""}`} aria-current={escolhida ? "true" : undefined}>
      <div className="t41-cartao__topo">
        <LogoDaEmpresa src={vaga.temLogo ? caminhoDoLogoDaVaga(slug, vaga.id) : null} nome={vaga.empresa} />
        {prazo && (
          <span className="t41-etiqueta t41-etiqueta--prazo t41-num">
            <Hourglass size={13} aria-hidden="true" />
            {prazo.texto}
          </span>
        )}
      </div>
      <div>
        <Titulo className="t41-cartao__titulo">
          {hrefNoPainel ? (
            <>
              <Link href={href} className="t41-cartao__link t41-so-estreito">
                {vaga.title}
              </Link>
              <Link href={hrefNoPainel} scroll={false} className="t41-cartao__link t41-so-largo" aria-current={escolhida ? "true" : undefined}>
                {vaga.title}
              </Link>
            </>
          ) : (
            <Link href={href} className="t41-cartao__link">
              {vaga.title}
            </Link>
          )}
        </Titulo>
        <p className="t41-cartao__empresa">
          <strong>{vaga.empresa}</strong>
          {local && ` · ${local}`}
          {vaga.quantity > 1 && <span className="t41-num"> · {vaga.quantity} vagas</span>}
        </p>
      </div>
      {etiquetas.length > 0 && (
        <ul className="t41-cartao__etiquetas" aria-label="Sobre a vaga" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {etiquetas.map((e) => (
            <li key={e} className="t41-etiqueta">
              {e}
            </li>
          ))}
        </ul>
      )}
      <div className="t41-cartao__pe">
        <span>
          <Clock size={14} aria-hidden="true" />
          Publicada {haQuantoTempo(vaga.openedAt, agora)}
        </span>
        {!compacto && (
          <span className="t41-cartao__ver" aria-hidden="true">
            Ver vaga <ArrowRight size={15} />
          </span>
        )}
      </div>
    </article>
  );
}
