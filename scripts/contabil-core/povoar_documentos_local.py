"""Documentos INVENTADOS no Contábil Core local, para ensaiar a carga do Bloco C (Fase C4, 25/11/2026).

Roda depois de `povoar_core_local.py` e `povoar_conciliacao_local.py`, no mesmo banco. Acrescenta às
duas empresas inventadas o extrato de maio na conta do banco cooperativo e, pelos SERVIÇOS do próprio
original (`NotaService`, `ComprovanteService`, `CartaoService`, `DistribuicaoService` e o NEO), a forma
que a produção tem:

- notas: duas NF-e com XML assinado (ligadas pelo NEO: uma com a contraparte pela nota, outra pela
  regra, com a nota na sombra), NF-e alterada depois de assinada (`xml_nao_verificado`, ligada à mão),
  NFS-e da empresa (pendente), NF-e lida "pela IA" (`ocr`; a leitura é simulada, a gravação é a do
  serviço) e uma cadastrada à mão e cancelada;
- decisões do NEO com `origem_evidencia` "nota_fiscal" e "comprovante" (a sombra da regra);
- comprovantes: dois PDFs ligados pelo NEO (contraparte e sombra pelo comprovante), imagem com o base64 quebrado em
  linhas e ligada à mão, um sem arquivo, um excluído, um com o `arquivo_sha256` apagado (como as linhas
  de antes da migration 0037), um com base64 inválido (sem hash, como o serviço grava) e um ligado a uma
  transação cuja importação foi desfeita;
- cartões: um com a fatura de abril fechada (gastos à mão, por CSV e um removido, distribuição salva e
  não aplicada) e a de maio paga, com a composição em PDF lida e confirmada, um PDF que a leitura não
  conseguiu ler e a distribuição aplicada no pagamento; e um cartão removido;
- linhas que as travas do Connect recusariam, inseridas direto por SQL (o serviço do original não deixa):
  comprovante com valor pago zero, comprovante com juros negativo, cartão com bandeira e dia de
  fechamento fora da lista (com uma fatura e um gasto, que caem junto) e gasto negativo.

Recusa rodar fora de 127.0.0.1/localhost. Nenhum dado real: pessoas, CNPJs (os novos começam com 9),
estabelecimentos e arquivos inventados; a IA não é chamada.

Uso, a partir da raiz do contabil-core, com as dependências dele e as migrations aplicadas:
    DATABASE_URL=postgresql+asyncpg://contabil:contabil@127.0.0.1:5435/contabil_dev \\
    SECRET_KEY=... python -I <connect>/scripts/contabil-core/povoar_documentos_local.py
"""
import asyncio
import base64
import os
import sys
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime
from decimal import Decimal
from urllib.parse import urlparse

url = os.environ.get("DATABASE_URL", "")
if urlparse(url.replace("+asyncpg", "")).hostname not in ("127.0.0.1", "localhost"):
    raise SystemExit("Só banco local.")
os.environ.setdefault("ENVIRONMENT", "development")
# A IA fica desligada: o PDF sem texto vira "falhou", como na produção sem a chave.
os.environ["OPENAI_API_KEY"] = ""
os.environ["ALLOW_FINANCIAL_DATA_TO_OPENAI"] = "false"
sys.path.insert(0, os.getcwd())
sys.path.insert(1, os.path.dirname(os.path.abspath(__file__)))

import pymupdf  # noqa: E402
from lxml import etree  # noqa: E402
from sqlalchemy import func, select, text  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from ensaio_notas_xml import ABRASF, NFE, assinar, certificado, chave  # noqa: E402
from src.db.models import AgenciaBancaria, CartaoCredito, Contraparte, Empresa, NotaFiscal, PlanoConta, Tenant, Transacao, Usuario  # noqa: E402
from src.domain.cartoes import distribuicao as distribuicao_mod  # noqa: E402
from src.domain.cartoes.distribuicao import DistribuicaoService  # noqa: E402
from src.domain.cartoes.service import CartaoService  # noqa: E402
from src.domain.comprovantes.service import ComprovanteService  # noqa: E402
from src.domain.extrato.importacoes import abrir_importacao, cancelar_importacao, registrar_resultado  # noqa: E402
from src.domain.extrato.service import ExtratoService  # noqa: E402
from src.domain.jobs import JobRuntime  # noqa: E402
from src.domain.neo.engine import NeoEngine  # noqa: E402
from src.domain.notas import visual_parser  # noqa: E402
from src.domain.notas.service import NotaService  # noqa: E402
from src.domain.notas.xml_parser import NotaParseada  # noqa: E402
from src.schemas.cartoes import (  # noqa: E402
    AssociarTransacaoFaturaRequest, CartaoCreate, FaturaCreate, FaturaDocumentoConfirmar, FaturaUpdate, ItemFaturaRevisado, LancamentoCreate,
)
from src.schemas.comprovantes import AssociarTransacaoRequest as AssociarComprovante, ComprovanteCreate  # noqa: E402
from src.schemas.notas import AssociarTransacaoRequest as AssociarNota, NotaFiscalCreate  # noqa: E402
from src.schemas.neo import NeoComponenteInput  # noqa: E402


def cnpj(base12: str) -> str:
    """CNPJ válido a partir de 12 dígitos inventados (os desta fase começam com 9)."""
    d = [int(c) for c in base12]
    for pesos in ([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]):
        r = sum(x * p for x, p in zip(d, pesos)) % 11
        d.append(0 if r < 2 else 11 - r)
    s = "".join(map(str, d))
    return f"{s[:2]}.{s[2:5]}.{s[5:8]}/{s[8:12]}-{s[12:]}"


def digitos(v: str) -> str:
    return "".join(c for c in v if c.isdigit())


ALFA = cnpj("990000010001")     # fornecedora da NF-e assinada, com contraparte
BETA = cnpj("980000020001")     # emitente da NF-e lida "pela IA"
GAMA = cnpj("970000030001")     # tomadora da NFS-e
DELTA = cnpj("960000040001")    # favorecida do comprovante ligado pelo NEO, com contraparte
EPSILON = cnpj("950000050001")  # emitente da nota cadastrada à mão


def nfe_xml(numero: int, emitente: str, destinatario: str, valor: str, emissao: str, chave_pem, cert_pem, alterar=False) -> bytes:
    """NF-e autorizada (nfeProc com protNFe), assinada de verdade; `alterar` muda o conteúdo depois."""
    emitente, destinatario = digitos(emitente), digitos(destinatario)
    ch = chave(emitente, numero)
    e = etree.SubElement
    nfe_ = etree.Element(f"{{{NFE}}}NFe", nsmap={None: NFE})
    inf = e(nfe_, f"{{{NFE}}}infNFe", Id=f"NFe{ch}", versao="4.00")
    ide = e(inf, f"{{{NFE}}}ide")
    e(ide, f"{{{NFE}}}serie").text = "1"
    e(ide, f"{{{NFE}}}nNF").text = str(numero)
    e(ide, f"{{{NFE}}}dhEmi").text = emissao
    emit = e(inf, f"{{{NFE}}}emit")
    e(emit, f"{{{NFE}}}CNPJ").text = emitente
    e(emit, f"{{{NFE}}}xNome").text = "DISTRIBUIDORA ALFA INVENTADA LTDA"
    dest = e(inf, f"{{{NFE}}}dest")
    e(dest, f"{{{NFE}}}CNPJ").text = destinatario
    e(dest, f"{{{NFE}}}xNome").text = "EMPRESA DO ENSAIO DA CARGA"
    tot = e(e(inf, f"{{{NFE}}}total"), f"{{{NFE}}}ICMSTot")
    e(tot, f"{{{NFE}}}vNF").text = valor
    assinada = assinar(nfe_, f"NFe{ch}", chave_pem, cert_pem)
    if alterar:
        assinada.find(f".//{{{NFE}}}dest/{{{NFE}}}xNome").text = "E*****A D* E*****O"
    proc = etree.Element(f"{{{NFE}}}nfeProc", nsmap={None: NFE}, versao="4.00")
    proc.append(assinada)
    inf_prot = e(e(proc, f"{{{NFE}}}protNFe", versao="4.00"), f"{{{NFE}}}infProt")
    e(inf_prot, f"{{{NFE}}}chNFe").text = ch
    e(inf_prot, f"{{{NFE}}}dhRecbto").text = emissao
    e(inf_prot, f"{{{NFE}}}nProt").text = f"1352600000{numero:05d}"
    e(inf_prot, f"{{{NFE}}}cStat").text = "100"
    return etree.tostring(proc, xml_declaration=True, encoding="UTF-8")


def nfse_xml(numero: int, prestador: str, tomador: str, valor: str, emissao: str, chave_pem, cert_pem) -> bytes:
    """NFS-e ABRASF assinada, a empresa como prestadora."""
    e = etree.SubElement
    comp = etree.Element(f"{{{ABRASF}}}CompNfse", nsmap={None: ABRASF})
    nf = e(comp, f"{{{ABRASF}}}Nfse", versao="2.04")
    inf = e(nf, f"{{{ABRASF}}}InfNfse", Id=f"nfse{numero}")
    e(inf, f"{{{ABRASF}}}Numero").text = str(numero)
    e(inf, f"{{{ABRASF}}}CodigoVerificacao").text = "INV12345"
    e(inf, f"{{{ABRASF}}}DataEmissao").text = emissao
    val = e(e(inf, f"{{{ABRASF}}}Servico"), f"{{{ABRASF}}}Valores")
    e(val, f"{{{ABRASF}}}ValorServicos").text = valor
    e(val, f"{{{ABRASF}}}ValorIss").text = "17.50"
    prest = e(inf, f"{{{ABRASF}}}PrestadorServico")
    e(e(prest, f"{{{ABRASF}}}IdentificacaoPrestador"), f"{{{ABRASF}}}Cnpj").text = digitos(prestador)
    e(prest, f"{{{ABRASF}}}RazaoSocial").text = "EMPRESA DO ENSAIO DA CARGA"
    tom = e(inf, f"{{{ABRASF}}}TomadorServico")
    e(e(e(tom, f"{{{ABRASF}}}IdentificacaoTomador"), f"{{{ABRASF}}}CpfCnpj"), f"{{{ABRASF}}}Cnpj").text = digitos(tomador)
    assinada = assinar(nf, f"nfse{numero}", chave_pem, cert_pem)
    comp.remove(nf)
    comp.append(assinada)
    return etree.tostring(comp, xml_declaration=True, encoding="UTF-8")


def pdf(*linhas: str) -> bytes:
    """PDF de uma página com as linhas de texto (Helvetica)."""
    doc = pymupdf.open()
    pagina = doc.new_page()
    for n, linha in enumerate(linhas):
        pagina.insert_text((60, 80 + 18 * n), linha, fontsize=11)
    return doc.tobytes()


def png() -> bytes:
    pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 6, 4), False)
    pix.clear_with(200)
    return pix.tobytes("png")


def ofx(conta: str, linhas, saldo: str, data_saldo: str) -> str:
    corpo = "".join(
        f"<STMTTRN><TRNTYPE>{'DEBIT' if v.startswith('-') else 'CREDIT'}<DTPOSTED>{d}<TRNAMT>{v}<FITID>{f}<MEMO>{m}</STMTTRN>\n"
        for d, v, f, m in linhas
    )
    return (
        "OFXHEADER:100\nDATA:OFXSGML\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>\n"
        f"<BANKACCTFROM><BANKID>0756<BRANCHID>1234<ACCTID>{conta}</BANKACCTFROM>\n<BANKTRANLIST>\n{corpo}</BANKTRANLIST>\n"
        f"<LEDGERBAL><BALAMT>{saldo}<DTASOF>{data_saldo}</LEDGERBAL>\n</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>"
    )


def utc(ano, mes, dia, hora=0) -> datetime:
    return datetime(ano, mes, dia, hora, tzinfo=UTC)


async def main():
    engine = create_async_engine(url, echo=False)
    fabrica = async_sessionmaker(engine, expire_on_commit=False)

    @asynccontextmanager
    async def escopo():
        async with fabrica() as s:
            yield s

    runtime = JobRuntime(session_scope=escopo)
    chave_pem, cert_pem = certificado()

    async with fabrica() as db:
        tenant = (await db.execute(select(Tenant).where(Tenant.nome == "Escritório Fictício da Carga"))).scalar_one_or_none()
        if tenant is None:
            raise SystemExit("Rode antes o povoar_core_local.py e o povoar_conciliacao_local.py.")
        ja = (await db.execute(
            select(func.count()).select_from(CartaoCredito).join(Empresa, Empresa.id == CartaoCredito.empresa_id).where(Empresa.tenant_id == tenant.id)
        )).scalar_one()
        if ja:
            raise SystemExit("Documentos já povoados. Recrie o banco para começar de novo.")
        quem = (await db.execute(select(Usuario).where(Usuario.tenant_id == tenant.id, Usuario.email == "adm6@41bpo.com.br"))).scalar_one()
        empresas = (await db.execute(select(Empresa).where(Empresa.tenant_id == tenant.id).order_by(Empresa.created_at))).scalars().all()

        for n, empresa in enumerate(empresas):
            conta = lambda codigo: db.execute(select(PlanoConta).where(PlanoConta.empresa_id == empresa.id, PlanoConta.codigo == codigo, PlanoConta.deleted_at.is_(None)))  # noqa: E731
            fornecedores = (await conta("2.1.1.01")).scalar_one()
            tarifas = (await conta("3.4.2.05")).scalar_one()
            juros = (await conta("3.4.2.10")).scalar_one()
            agencia = (await db.execute(select(AgenciaBancaria).where(AgenciaBancaria.empresa_id == empresa.id, AgenciaBancaria.banco_sigla == "756"))).scalar_one()
            # As contrapartes que o NEO acha pelo documento da nota e do comprovante.
            db.add_all([
                Contraparte(empresa_id=empresa.id, tipo="fornecedor", documento=digitos(ALFA), razao_social="Distribuidora Alfa Inventada Ltda", conta_contabil_id=fornecedores.id, origem="manual"),
                Contraparte(empresa_id=empresa.id, tipo="fornecedor", documento=digitos(DELTA), razao_social="Servicos Delta Ficticios Ltda", conta_contabil_id=fornecedores.id, origem="manual"),
            ])
            await db.commit()

            # O extrato de maio, e um arquivo de maio importado e desfeito depois.
            async def importar(nome, linhas, saldo):
                texto = ofx(f"9876{n}-4", linhas, saldo, "20260531")
                lote = await abrir_importacao(db, empresa_id=empresa.id, agencia_id=agencia.id, nome_arquivo=nome, conteudo=texto.encode(), criado_por=quem.id)
                await registrar_resultado(db, lote, await ExtratoService(db=db, empresa_id=empresa.id).importar_ofx(texto, agencia.id, importacao_id=lote.id))
                await db.commit()
                return lote

            await importar("extrato-05.ofx", [
                ("20260504", "-800.00", f"M{n}1", "PIX EMITIDO PAGAMENTO 0504"),
                ("20260506", "-250.00", f"M{n}2", "PAGTO BOLETO 0506"),
                ("20260508", "-1500.50", f"M{n}3", "TED EMITIDA 0508"),
                ("20260512", "-3200.00", f"M{n}4", "PAGTO FATURA CARTAO"),
                ("20260515", "-99.00", f"M{n}5", "PIX EMITIDO 0515"),
                # Pela regra "TARIFA PACOTE": a contraparte só medida (sombra), pela nota e pelo comprovante.
                ("20260520", "-55.00", f"M{n}6", "TARIFA PACOTE SERVICOS"),
                ("20260522", "-410.00", f"M{n}7", "TARIFA PACOTE ANUAL"),
            ], "-6314.50")
            errado = await importar("extrato-05-outra-conta.ofx", [("20260528", "-33.00", f"N{n}1", "PAGTO AVULSO 0528")], "-33.00")
            transacao = {
                t.historico: t for t in (await db.execute(select(Transacao).where(Transacao.empresa_id == empresa.id, Transacao.data >= date(2026, 5, 1)))).scalars()
            }

            # ── Notas ──
            notas = NotaService(db, empresa.id)
            r = await notas.importar_xml(nfe_xml(5101, ALFA, empresa.cnpj, "800.00", "2026-05-02T10:00:00-03:00", chave_pem, cert_pem), "nfe-alfa.xml")
            assert r.importadas == 1, r.erros
            r = await notas.importar_xml(nfe_xml(5102, ALFA, empresa.cnpj, "1500.50", "2026-05-07T09:00:00-03:00", chave_pem, cert_pem, alterar=True), "nfe-alterada.xml")
            assert r.importadas == 1, r.erros
            r = await notas.importar_xml(nfe_xml(5103, ALFA, empresa.cnpj, "410.00", "2026-05-21T08:00:00-03:00", chave_pem, cert_pem), "nfe-alfa-anual.xml")
            assert r.importadas == 1, r.erros
            r = await notas.importar_xml(nfse_xml(77, empresa.cnpj, GAMA, "350.00", "2026-05-10T14:30:00", chave_pem, cert_pem), "nfse.xml")
            assert r.importadas == 1, r.erros
            # "Pela IA": a leitura é simulada (o leitor visual devolve a nota); o resto é o serviço.
            lida = NotaParseada(
                tipo="nfe", numero="88001", serie="2", cnpj_emitente=BETA, nome_emitente="COMERCIO BETA INVENTADO", cnpj_destinatario=empresa.cnpj,
                valor=Decimal("640.00"), data_emissao=utc(2026, 5, 3, 13), chave_acesso=None, observacao="Lida de um DANFE inventado",
            )
            original_pdf = visual_parser.parse_pdf
            visual_parser.parse_pdf = lambda conteudo: lida
            try:
                r = await notas.importar_visual(pdf("DANFE INVENTADO"), "danfe-beta.pdf", ".pdf")
            finally:
                visual_parser.parse_pdf = original_pdf
            assert r.importadas == 1, r.erros
            await notas.criar(NotaFiscalCreate(
                tipo="nfe", numero="12", serie="1", cnpj_emitente=EPSILON, nome_emitente="Papelaria Epsilon Inventada", cnpj_destinatario=empresa.cnpj,
                valor=Decimal("120.00"), data_emissao=utc(2026, 5, 11), observacao="Cadastrada à mão",
            ))
            await db.commit()
            por_numero = {x.numero: x for x in (await db.execute(select(NotaFiscal).where(NotaFiscal.empresa_id == empresa.id))).scalars()}
            await notas.associar_transacao(por_numero["5102"].id, AssociarNota(transacao_id=transacao["TED EMITIDA 0508"].id))
            await notas.cancelar(por_numero["12"].id)
            await db.commit()

            # ── Comprovantes ──
            comp = ComprovanteService(db, empresa.id)

            async def comprovante(**campos):
                c = await comp.criar(ComprovanteCreate(**campos))
                await db.commit()
                return c

            await comprovante(  # ligado pelo NEO, com a contraparte pelo documento
                favorecido="SERVICOS DELTA FICTICIOS", cpf_cnpj=DELTA, data_pagamento=utc(2026, 5, 6), valor_pago=Decimal("250.00"),
                valor_documento=Decimal("245.00"), juros=Decimal("3.00"), multa=Decimal("2.00"), agencia_id=agencia.id,
                arquivo_nome="boleto-delta.pdf", arquivo_base64=base64.b64encode(pdf("COMPROVANTE DE PAGAMENTO INVENTADO", "VALOR R$ 250,00")).decode(),
            )
            await comprovante(  # candidato da transação com regra (sombra pelo comprovante)
                favorecido="SERVICOS DELTA FICTICIOS", cpf_cnpj=DELTA, data_pagamento=utc(2026, 5, 20), valor_pago=Decimal("55.00"),
                arquivo_nome="tarifa-delta.pdf", arquivo_base64=base64.b64encode(pdf("COMPROVANTE DE TARIFA INVENTADO")).decode(),
            )
            imagem = await comprovante(  # imagem com o base64 quebrado em linhas, ligada à mão
                favorecido="LOJA GAMA INVENTADA", data_pagamento=utc(2026, 5, 15), valor_pago=Decimal("99.00"), desconto=Decimal("1.00"),
                arquivo_nome="pix-gama.png", arquivo_base64=base64.encodebytes(png()).decode(),
            )
            await comp.associar_transacao(imagem.id, AssociarComprovante(transacao_id=transacao["PIX EMITIDO 0515"].id))
            await db.commit()
            await comprovante(favorecido="SEM ARQUIVO INVENTADO", data_pagamento=utc(2026, 5, 25), valor_pago=Decimal("70.00"), observacao="Cadastro sem arquivo")
            excluido = await comprovante(
                favorecido="EXCLUIDO INVENTADO", data_pagamento=utc(2026, 5, 26), valor_pago=Decimal("61.00"),
                arquivo_nome="excluido.pdf", arquivo_base64=base64.b64encode(pdf("COMPROVANTE QUE FOI EXCLUIDO")).decode(),
            )
            await comp.deletar(excluido.id)
            await db.commit()
            antigo = await comprovante(
                favorecido="ANTES DO HASH INVENTADO", data_pagamento=utc(2026, 6, 1), valor_pago=Decimal("45.00"),
                arquivo_nome="antigo.pdf", arquivo_base64=base64.b64encode(pdf("COMPROVANTE DE ANTES DA MIGRATION 0037")).decode(),
            )
            # Como as linhas de antes da 0037: o arquivo sem o hash.
            await db.execute(text("UPDATE comprovantes SET arquivo_sha256 = NULL WHERE id = :id"), {"id": antigo.id})
            await comprovante(favorecido="BASE64 INVALIDO", data_pagamento=utc(2026, 6, 2), valor_pago=Decimal("15.00"), arquivo_nome="quebrado.pdf", arquivo_base64="isto-nao-e-base64!")
            avulso = await comprovante(favorecido="AVULSO INVENTADO", data_pagamento=utc(2026, 5, 28), valor_pago=Decimal("33.00"))
            await comp.associar_transacao(avulso.id, AssociarComprovante(transacao_id=transacao["PAGTO AVULSO 0528"].id))
            await db.commit()
            # A importação desfeita: a transação sai com o comprovante ainda ligado, como no original.
            await cancelar_importacao(db, empresa_id=empresa.id, importacao_id=errado.id, motivo="Arquivo de outra conta", usuario_id=quem.id)
            await db.commit()

            # O NEO de maio: sem regra, a contraparte pela nota (800,00) e pelo comprovante (250,00); com a
            # regra da tarifa, a sombra pelo comprovante (55,00) e pela nota (410,00), gravada na decisão.
            resultado = await NeoEngine(db, empresa.id).processar(mes="2026-05")
            await db.commit()
            assert resultado.notas_associadas == 2 and resultado.comprovantes_associados == 2, resultado
            sombras = (await db.execute(text(
                "SELECT count(*) FROM neo_decisoes WHERE empresa_id = :e AND origem_evidencia IN ('nota_fiscal', 'comprovante')"
            ), {"e": empresa.id})).scalar_one()
            assert sombras == 2, sombras

            # ── Cartões ──
            cartoes = CartaoService(db, empresa.id)
            corporativo = await cartoes.criar_cartao(CartaoCreate(nome="Cartao Corporativo Inventado", bandeira="visa", ultimos_digitos="1234", dia_fechamento=5, dia_vencimento=15, limite=Decimal("20000")))
            reserva = await cartoes.criar_cartao(CartaoCreate(nome="Cartao Reserva Inventado", bandeira="mastercard", dia_fechamento=10, dia_vencimento=20))
            await db.commit()
            await cartoes.remover_cartao(reserva.id)
            await db.commit()

            # Abril: gastos à mão (um parcelado, com conta), por CSV e um removido; fechada; distribuição salva.
            abril = await cartoes.criar_fatura(corporativo.id, FaturaCreate(competencia="2026-04", data_fechamento=utc(2026, 4, 5), data_vencimento=utc(2026, 4, 15)))
            await db.commit()
            g1 = await cartoes.adicionar_lancamento(corporativo.id, abril.id, LancamentoCreate(data_compra=utc(2026, 3, 20), descricao="MERCADO INVENTADO", valor=Decimal("180.40"), conta_id=tarifas.id, parcela_atual=1, parcela_total=3))
            removido = await cartoes.adicionar_lancamento(corporativo.id, abril.id, LancamentoCreate(data_compra=utc(2026, 3, 21), descricao="COMPRA LANCADA ERRADO", valor=Decimal("10.00")))
            await db.commit()
            await cartoes.remover_lancamento(corporativo.id, abril.id, removido.id)
            await cartoes.importar_csv(corporativo.id, abril.id, "data,descricao,valor\n22/03/2026,FARMACIA INVENTADA,\"45,90\"\n25/03/2026,ESTACIONAMENTO FICTICIO,12.00\n".encode())
            await db.commit()
            await cartoes.atualizar_fatura(corporativo.id, abril.id, FaturaUpdate(status="fechada", observacao="Conferida"))
            await db.commit()
            dist = DistribuicaoService(db, empresa.id, tenant.id, quem.id)
            vista = await dist.obter(corporativo.id, abril.id)
            componente = NeoComponenteInput(conta_id=tarifas.id, historico="MERCADO DO ESCRITORIO", valor=Decimal("180.40"))
            await dist.salvar(corporativo.id, abril.id, vista["versao"], {str(g1.id): [componente.model_dump(mode="json")]})
            await db.commit()

            # Maio: a composição em PDF lida e confirmada, um PDF ilegível, o pagamento e a distribuição aplicada.
            maio = await cartoes.criar_fatura(corporativo.id, FaturaCreate(competencia="2026-05", data_vencimento=utc(2026, 5, 12)))
            await db.commit()
            composicao = await dist.adicionar_documento(corporativo.id, maio.id, pdf(
                "COMPOSICAO DA FATURA INVENTADA",
                "02-mai Fisico RESTAURANTE INVENTADO 1.200,00",
                "05-mai Virtual LOJA FICTICIA ONLINE 1.500,00",
                "09-mai Fisico POSTO INVENTADO 500,00",
                "TOTAL FATURA 3.200,00",
            ), "composicao-maio.pdf")
            ilegivel = await dist.adicionar_documento(corporativo.id, maio.id, pdf("FATURA"), "digitalizada.pdf")
            await db.commit()
            await distribuicao_mod.processar_documento(composicao.id, runtime)
            await distribuicao_mod.processar_documento(ilegivel.id, runtime)
            await db.refresh(composicao)
            await db.refresh(ilegivel)
            assert composicao.status == "revisar" and ilegivel.status == "falhou", (composicao.status, composicao.erro, ilegivel.status)
            vista = await dist.obter(corporativo.id, maio.id)
            await dist.confirmar_documento(corporativo.id, maio.id, composicao.id, FaturaDocumentoConfirmar(
                versao=vista["versao"], principal=True, pendencias_resolvidas=True, total=composicao.resultado["total"],
                itens=[ItemFaturaRevisado(**i) for i in composicao.resultado["itens"]],
            ))
            await db.commit()
            await cartoes.associar_transacao(corporativo.id, maio.id, AssociarTransacaoFaturaRequest(transacao_id=transacao["PAGTO FATURA CARTAO"].id))
            await db.commit()
            vista = await dist.obter(corporativo.id, maio.id)
            partes = {
                i["id"]: [NeoComponenteInput(conta_id=juros.id if k == 2 else tarifas.id, historico=f"GASTO {k + 1} DA FATURA", valor=Decimal(i["valor"])).model_dump(mode="json")]
                for k, i in enumerate(vista["itens"])
            }
            vista = await dist.salvar(corporativo.id, maio.id, vista["versao"], partes)
            await db.commit()
            vista = await dist.aplicar(corporativo.id, maio.id, vista["versao"], vista["classificacao_hash"], "Fatura de maio distribuída")
            await db.commit()
            assert vista["aplicacao"] == "APLICADA", vista["aplicacao"]

            # ── O que as travas do Connect recusariam, direto por SQL (o serviço do original não deixa) ──
            p = {"e": empresa.id}
            await db.execute(text(
                "INSERT INTO comprovantes (id, empresa_id, favorecido, data_pagamento, valor_pago, juros, multa, desconto, created_at, updated_at) "
                "VALUES (gen_random_uuid(), :e, 'VALOR PAGO ZERO INVENTADO', '2026-06-03', 0.00, 0.00, 0.00, 0.00, now(), now())"
            ), p)
            await db.execute(text(
                "INSERT INTO comprovantes (id, empresa_id, favorecido, data_pagamento, valor_pago, juros, multa, desconto, created_at, updated_at) "
                "VALUES (gen_random_uuid(), :e, 'JUROS NEGATIVO INVENTADO', '2026-06-04', 12.34, -1.00, 0.00, 0.00, now(), now())"
            ), p)
            antigo_cartao = (await db.execute(text(
                "INSERT INTO cartoes_credito (id, empresa_id, nome, bandeira, dia_fechamento, dia_vencimento, ativo, created_at, updated_at) "
                "VALUES (gen_random_uuid(), :e, 'Cartao Bandeira Antiga Inventado', 'master', 30, 10, true, now(), now()) RETURNING id"
            ), p)).scalar_one()
            fatura_antiga = (await db.execute(text(
                "INSERT INTO faturas_cartao (id, empresa_id, cartao_id, competencia, valor_total, status, created_at, updated_at) "
                "VALUES (gen_random_uuid(), :e, :c, '2026-05', 0.00, 'aberta', now(), now()) RETURNING id"
            ), {**p, "c": antigo_cartao})).scalar_one()
            for fatura_id, valor in ((fatura_antiga, "10.00"), (abril.id, "-10.00")):
                await db.execute(text(
                    "INSERT INTO lancamentos_cartao (id, empresa_id, fatura_id, data_compra, descricao, valor, created_at, updated_at) "
                    "VALUES (gen_random_uuid(), :e, :f, '2026-03-28', 'ESTORNO GRAVADO COMO GASTO', CAST(:v AS numeric), now(), now())"
                ), {**p, "f": fatura_id, "v": valor})
            await db.commit()
            print(f"{empresa.razao_social}: 6 notas, 10 comprovantes (2 fora das travas), 3 cartões (1 removido, 1 fora das travas), 3 faturas, 2 documentos e a distribuição aplicada")
    await engine.dispose()


asyncio.run(main())
