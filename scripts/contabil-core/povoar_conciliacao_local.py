"""Conciliação INVENTADA no Contábil Core local, para ensaiar a carga do Bloco B (Fase B5, 18/11/2026).

Roda depois de `povoar_core_local.py`, no mesmo banco: acrescenta às duas empresas inventadas uma
conta Itaú ligada à conta contábil, o extrato de abril e, pelos SERVIÇOS do próprio original
(`RevisaoService` e `FinanceiroService`), a forma que a produção tem:

- revisões Razão × extrato: uma com SISPAG e Razão de apoio, vínculos ativos, um desfeito e refeito
  e um confirmado pela pessoa que não está no Connect; uma renomeada; uma excluída e criada de novo
  (o mesmo `revisao_hash` vivo e apagado);
- análises do financeiro com os quatro tipos de documento (planilhas inventadas), um vínculo
  direto, um lote de sugestões, um vínculo pela pessoa ausente e um desfeito; e uma análise com
  documento, renomeada e excluída.

Recusa rodar fora de 127.0.0.1/localhost. Nenhum dado real: empresas, pessoas, CNPJs e planilhas
inventados.

Uso, a partir da raiz do contabil-core, com as dependências dele e as migrations aplicadas:
    DATABASE_URL=postgresql+asyncpg://contabil:contabil@127.0.0.1:5435/contabil_dev \\
    SECRET_KEY=... python <connect>/scripts/contabil-core/povoar_conciliacao_local.py
"""
import asyncio
import hashlib
import io
import os
import sys
from datetime import date, datetime
from decimal import Decimal
from urllib.parse import urlparse
from uuid import UUID

url = os.environ.get("DATABASE_URL", "")
if urlparse(url.replace("+asyncpg", "")).hostname not in ("127.0.0.1", "localhost"):
    raise SystemExit("Só banco local.")
os.environ.setdefault("ENVIRONMENT", "development")
sys.path.insert(0, os.getcwd())

import openpyxl  # noqa: E402
from sqlalchemy import func, select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from src.db.models import AgenciaBancaria, ConciliacaoRevisao, Empresa, PlanoConta, Tenant, Usuario  # noqa: E402
from src.domain.conciliacao_bancaria.apoio import ler_razao_apoio  # noqa: E402
from src.domain.conciliacao_bancaria.financeiro import FinanceiroService  # noqa: E402
from src.domain.conciliacao_bancaria.razao import ler_razao  # noqa: E402
from src.domain.conciliacao_bancaria.revisao import RevisaoService  # noqa: E402
from src.domain.conciliacao_bancaria.sispag import ler_sispag  # noqa: E402
from src.domain.extrato.importacoes import abrir_importacao, registrar_resultado  # noqa: E402
from src.domain.extrato.service import ExtratoService  # noqa: E402
from src.schemas.conciliacao_financeiro import (  # noqa: E402
    AnaliseCreate, FinanceiroDesfazer, FinanceiroSugestaoConfirmada, FinanceiroSugestoesLote, FinanceiroVinculoCreate,
)
from src.schemas.gestao_conciliacao import NomeConciliacao  # noqa: E402
from src.schemas.revisao_conciliacao import ItemVinculo, VinculoCreate, VinculoDesfazer  # noqa: E402


def planilha(linhas, titulo=None) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    if titulo:
        ws.title = titulo
    for linha in linhas:
        ws.append(linha)
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def razao_xlsx(empresa, cnpj, conta, lancamentos) -> bytes:
    """O Razão do Domínio em planilha (o layout de `_razao_xlsx` da suíte): (dia, lote, histórico, contra, débito, crédito)."""
    def linha(**cols):
        valores = [None] * 15
        for i, v in cols.items():
            valores[int(i[1:])] = v
        return valores

    codigo, classificacao, nome = conta
    linhas = [
        linha(c0="Empresa:", c2=empresa.upper(), c12="Folha:", c14=1),
        linha(c0="C.N.P.J.:", c2=cnpj),
        linha(c0="Período:", c2="01/04/2026 - 30/04/2026"),
        linha(c0="RAZÃO"),
        linha(c0="Data", c1="Lote", c2="Histórico", c8="Cta.C.Part.", c9="Débito", c10="Crédito", c13="Saldo-Exercício"),
        linha(c0="Conta:", c1=codigo, c2=classificacao, c5=nome),
        linha(c2="SALDO ANTERIOR", c13=0.0),
    ]
    saldo = deb = cred = Decimal("0")
    for dia, lote, hist, contra, d, c in lancamentos:
        saldo += Decimal(str(d or 0)) - Decimal(str(c or 0))
        deb += Decimal(str(d or 0))
        cred += Decimal(str(c or 0))
        linhas.append(linha(c0=datetime(2026, 4, dia), c1=lote, c2=hist, c8=contra, c9=d, c10=c, c13=float(saldo)))
    linhas.append(linha(c0="Total da conta:", c9=float(deb), c10=float(cred)))
    return planilha(linhas)


def sispag_xlsx(empresa, cnpj, conta) -> bytes:
    """A consulta de pagamentos do SISPAG (Itaú), com o lote de 06/04 (1.000,00 + 200,00)."""
    return planilha([
        ["Agência/conta", conta, "Nome da empresa:", empresa.upper()],
        ["CNPJ:", cnpj],
        ["favorecido / beneficiário", "CPF/CNPJ", "tipo de pagamento", "referência da empresa", "data do pagamento", "valor (R$)", "status"],
        ["FORNECEDOR ALFA INVENTADO", "***", "Conta Corrente", "-", "06/04/2026", 1000.00, "Efetuado"],
        ["FORNECEDOR BETA INVENTADO", "***", "Conta Corrente", "-", "06/04/2026", 200.00, "Efetuado"],
    ])


def financeiro_xlsx(movimentos) -> bytes:
    """O relatório de pagamentos do financeiro (o layout de `_financeiro_xlsx`), sem CNPJ do emissor."""
    return planilha([
        [None, None, sum(Decimal(str(m[1])) for m in movimentos)],
        ["Nota Fiscal", "Pagamento", "Valor Pago", "Categoria", "Fornecedor (Razão Social)", "Fornecedor (CNPJ/CPF)"],
        *[[None, datetime(2026, 4, dia), valor, "Fornecedores", nome, "98765432000110"] for dia, valor, nome in movimentos],
    ], "financas")


def detalhado_xlsx(empresa, conta) -> bytes:
    """O extrato detalhado do Itaú de abril, com o saldo do dia conferindo."""
    return planilha([
        [],
        ["Atualização:", "18/11/2026 10:00:00"],
        ["Nome:", empresa.upper()],
        ["Agência:", "7285"],
        ["Conta:", conta],
        [],
        ["Lançamentos"],
        ["Periodo:", "01/04/2026 até 30/04/2026"],
        [],
        ["Data", "Lançamento", "Razão Social", "CPF/CNPJ", "Valor (R$)", "Saldo (R$)"],
        ["31/03/2026", "SALDO ANTERIOR", "", "", None, 5000],
        ["06/04/2026", "PAGAMENTOS A FORNECEDORES", "FORNECEDOR ALFA INVENTADO", "11.111.111/0001-11", -1000, None],
        ["06/04/2026", "PAGAMENTOS A FORNECEDORES", "FORNECEDOR BETA INVENTADO", "22.222.222/0001-22", -200, None],
        ["06/04/2026", "SALDO TOTAL DISPONÍVEL DIA", "", "", None, 3800],
    ], "Lançamentos")


def ofx(conta: str, linhas, saldo: str, data_saldo: str) -> str:
    corpo = "".join(
        f"<STMTTRN><TRNTYPE>{'DEBIT' if v.startswith('-') else 'CREDIT'}<DTPOSTED>{d}<TRNAMT>{v}<FITID>{f}<MEMO>{m}</STMTTRN>\n"
        for d, v, f, m in linhas
    )
    return (
        "OFXHEADER:100\nDATA:OFXSGML\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>\n"
        f"<BANKACCTFROM><BANKID>0341<BRANCHID>7285<ACCTID>{conta}</BANKACCTFROM>\n<BANKTRANLIST>\n{corpo}</BANKTRANLIST>\n"
        f"<LEDGERBAL><BALAMT>{saldo}<DTASOF>{data_saldo}</LEDGERBAL>\n</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>"
    )


_RAZAO_BANCO = [
    (1, 4001, "RECEBIMENTO CLIENTE INVENTADO", 101, 1200.00, None),
    (6, 4002, "PAGTO FORNECEDOR ALFA INVENTADO", 2001, None, 1000.00),
    (6, 4003, "PAGTO FORNECEDOR BETA INVENTADO", 2001, None, 200.00),
    (10, 4004, "PAGTO FGTS DO MES", 354, None, 350.00),
    (15, 4005, "TARIFA BANCARIA", 1026, None, 15.90),
]
_RAZAO_APOIO = [
    (3, 5001, "PROVISAO FGTS GUIA 001", 13, None, 200.00),
    (7, 5002, "PROVISAO FGTS GUIA 002", 13, None, 150.00),
]


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def linhas_de(resposta, campo, tipo, *valores):
    procurados = {Decimal(str(v)) for v in valores}
    return [
        linha for linha in resposta[campo]
        if linha.get("tipo_fonte") == tipo and (not procurados or Decimal(linha.get("valor") or linha.get("valor_credito") or "0") in procurados)
    ]


async def main():
    engine = create_async_engine(url, echo=False)
    fabrica = async_sessionmaker(engine, expire_on_commit=False)
    async with fabrica() as db:
        tenant = (await db.execute(select(Tenant).where(Tenant.nome == "Escritório Fictício da Carga"))).scalar_one_or_none()
        if tenant is None:
            raise SystemExit("Rode antes o povoar_core_local.py.")
        if (await db.execute(select(func.count()).select_from(ConciliacaoRevisao).where(ConciliacaoRevisao.tenant_id == tenant.id))).scalar_one():
            raise SystemExit("Conciliação já povoada. Recrie o banco para começar de novo.")
        quem = (await db.execute(select(Usuario).where(Usuario.tenant_id == tenant.id, Usuario.email == "adm6@41bpo.com.br"))).scalar_one()
        outra = (await db.execute(select(Usuario).where(Usuario.tenant_id == tenant.id, Usuario.email == "fora.do.connect@exemplo.invalid"))).scalar_one()
        empresas = (await db.execute(select(Empresa).where(Empresa.tenant_id == tenant.id).order_by(Empresa.created_at))).scalars().all()

        for n, empresa in enumerate(empresas):
            numero = f"1228{7 + n}"
            # A conta Itaú, ligada à conta contábil do Razão (código reduzido 13).
            itau = PlanoConta(empresa_id=empresa.id, codigo="1.1.1.02", descricao="Banco Itaú c/c", tipo="ativo", conta_numero=13, tipo_sa="A")
            db.add(itau)
            await db.flush()
            agencia = AgenciaBancaria(empresa_id=empresa.id, banco_sigla="ITAU", agencia="7285", numero=numero, digito="0", conta_contabil_id=itau.id)
            db.add(agencia)
            await db.commit()

            texto = ofx(f"{numero}-0", [
                ("20260401", "1200.00", f"D{n}1", "PIX RECEBIDO CLIENTE INVENTADO"),
                ("20260406", "-1200.00", f"D{n}2", "SISPAG FORNECEDORES"),
                ("20260410", "-350.00", f"D{n}3", "PAGTO FGTS"),
                ("20260415", "-15.90", f"D{n}4", "TARIFA PACOTE SERVICOS"),
                ("20260420", "-42.00", f"D{n}5", "PAGTO DIVERSO SEM PAR"),
            ], "1592.10", "20260430")
            lote = await abrir_importacao(db, empresa_id=empresa.id, agencia_id=agencia.id, nome_arquivo="itau-04.ofx", conteudo=texto.encode(), criado_por=quem.id)
            await registrar_resultado(db, lote, await ExtratoService(db=db, empresa_id=empresa.id).importar_ofx(texto, agencia.id, importacao_id=lote.id))
            await db.commit()

            conta_razao = (13, "1.1.1.02", "BANCO ITAU C/C")
            razao = razao_xlsx(empresa.razao_social, empresa.cnpj, conta_razao, _RAZAO_BANCO)
            sispag = sispag_xlsx(empresa.razao_social, empresa.cnpj, f"7285 / {numero}-0")
            apoio = razao_xlsx(empresa.razao_social, empresa.cnpj, (354, "2.1.2.01.0003", "FGTS A RECOLHER"), _RAZAO_APOIO)

            # ── Revisões ──
            rev = RevisaoService(db, empresa_id=empresa.id, tenant_id=tenant.id, usuario_id=quem.id)
            rev_outra = RevisaoService(db, empresa_id=empresa.id, tenant_id=tenant.id, usuario_id=outra.id)

            async def criar(conteudo, nome, com_sispag):
                r = await rev.criar(
                    agencia_id=agencia.id, razao=ler_razao(conteudo, nome), nome_arquivo=nome, hash_arquivo=sha(conteudo),
                    sispag=ler_sispag(sispag) if com_sispag else None, hash_sispag=sha(sispag) if com_sispag else None,
                    confirmar_empresa=False,
                )
                await db.commit()
                return r.model_dump(mode="json")

            r1 = await criar(razao, "razao-itau-abril.xlsx", True)
            r1 = (await rev.adicionar_apoio(r1["id"], razao=ler_razao_apoio(apoio, "FGTS.xlsx"), nome_arquivo="FGTS.xlsx", versao=r1["versao"], confirmar_empresa=False)).model_dump(mode="json")
            await db.commit()
            extrato = {Decimal(linha["valor"]): linha["transacao_id"] for linha in r1["extrato"]}
            banco = {(Decimal(linha["valor_debito"]), Decimal(linha["valor_credito"])): linha["id"] for linha in r1["linhas_razao"] if linha["tipo_fonte"] == "RAZAO_BANCO"}
            fgts = [linha["id"] for linha in r1["linhas_razao"] if linha["tipo_fonte"] == "RAZAO_APOIO"]

            async def vincular(servico, revisao, ids_e, itens, observacao=""):
                r = await servico.criar_vinculo(revisao["id"], VinculoCreate(
                    versao=revisao["versao"], extrato_ids=ids_e, razao_itens=[ItemVinculo(linha_id=i, dc=dc) for i, dc in itens], observacao=observacao,
                ))
                await db.commit()
                return r.model_dump(mode="json")

            # FGTS pago (350,00) contra as duas guias do Razão de apoio.
            r1 = await vincular(rev, r1, [extrato[Decimal("-350.00")]], [(i, "C") for i in fgts], "Conferido com as guias do FGTS.")
            # O recebimento, desfeito e refeito.
            r1 = await vincular(rev, r1, [extrato[Decimal("1200.00")]], [(banco[(Decimal("1200.00"), Decimal("0.00"))], "D")])
            ativo = next(v for v in r1["vinculos"] if v["estado"] == "ATIVO" and Decimal(v["total_extrato"]) == Decimal("1200.00"))
            r1 = (await rev.desfazer(r1["id"], UUID(ativo["id"]), VinculoDesfazer(versao=r1["versao"], motivo="Conferido na conta errada."))).model_dump(mode="json")
            await db.commit()
            r1 = await vincular(rev, r1, [extrato[Decimal("1200.00")]], [(banco[(Decimal("1200.00"), Decimal("0.00"))], "D")])
            # O lote do SISPAG (1.200,00 = 1.000,00 + 200,00), confirmado pela pessoa que não está no Connect.
            r1 = await vincular(rev_outra, r1, [extrato[Decimal("-1200.00")]], [(banco[(Decimal("0.00"), Decimal("1000.00"))], "C"), (banco[(Decimal("0.00"), Decimal("200.00"))], "C")])

            # Uma revisão sem o SISPAG, renomeada.
            r2 = await criar(razao, "razao-itau-abril.xlsx", False)
            await rev.renomear(r2["id"], NomeConciliacao(versao=r2["versao"], titulo="Abril sem SISPAG"))
            await db.commit()
            # Uma revisão de um Razão sem a tarifa: excluída e criada de novo (o mesmo hash, viva e apagada).
            sem_tarifa = razao_xlsx(empresa.razao_social, empresa.cnpj, conta_razao, _RAZAO_BANCO[:-1])
            r3 = await criar(sem_tarifa, "razao-sem-tarifa.xlsx", False)
            await rev.excluir(r3["id"], r3["versao"])
            await db.commit()
            r4 = await criar(sem_tarifa, "razao-sem-tarifa.xlsx", False)
            assert r4["id"] != r3["id"]

            # ── Análises do financeiro ──
            fin = FinanceiroService(db, empresa_id=empresa.id, tenant_id=tenant.id, usuario_id=quem.id)
            fin_outra = FinanceiroService(db, empresa_id=empresa.id, tenant_id=tenant.id, usuario_id=outra.id)
            a = (await fin.criar(AnaliseCreate(agencia_id=agencia.id, periodo_inicio=date(2026, 4, 1), periodo_fim=date(2026, 4, 30), titulo="Financeiro de abril"))).model_dump(mode="json")
            await db.commit()
            for tipo, nome, conteudo, confirmar in (
                ("FINANCEIRO", "Pagamentos-abril.xlsx", financeiro_xlsx([(6, 1000, "FORNECEDOR ALFA INVENTADO"), (6, 200, "FORNECEDOR BETA INVENTADO"), (15, 15.90, "BANCO INVENTADO")]), True),
                ("SISPAG", "SISPAG-abril.xlsx", sispag, False),
                ("RAZAO", "razao-itau-abril.xlsx", razao, False),
                ("EXTRATO_DETALHADO", "extrato detalhado abril.xlsx", detalhado_xlsx(empresa.razao_social, f"00{numero}-0"), True),
            ):
                a = (await fin.adicionar_documento(a["id"], versao=a["versao"], tipo=tipo, conteudo=conteudo, nome_arquivo=nome, confirmar_empresa=confirmar)).model_dump(mode="json")
                await db.commit()

            def ids(tipo, *valores):
                return [linha["id"] for linha in linhas_de(a, "linhas", tipo, *valores)]

            # Financeiro × extrato: o lote de 1.200,00 contra os dois pagamentos.
            a = (await fin.vincular(a["id"], FinanceiroVinculoCreate(
                versao=a["versao"], financeiro_ids=ids("FINANCEIRO", -1000, -200), comparacao_ids=ids("EXTRATO", -1200), observacao="Conferido com o lote do banco.",
            ))).model_dump(mode="json")
            await db.commit()
            # Financeiro × Razão: o lote de sugestões.
            sugestoes = (await fin.sugestoes(a["id"], "RAZAO"))["items"]
            a = (await fin.vincular_sugestoes(a["id"], FinanceiroSugestoesLote(
                versao=a["versao"], sugestoes=[FinanceiroSugestaoConfirmada(sugestao_id=s["id"], financeiro_ids=s["financeiro_ids"], comparacao_ids=s["comparacao_ids"]) for s in sugestoes],
            ))).model_dump(mode="json")
            await db.commit()
            # Razão × extrato detalhado: uma sugestão confirmada pela pessoa que não está no Connect.
            detalhado = (await fin_outra.sugestoes(a["id"], "RAZAO_DETALHADO"))["items"]
            a = (await fin_outra.vincular(a["id"], FinanceiroVinculoCreate(
                versao=a["versao"], sugestao_id=detalhado[0]["id"], financeiro_ids=detalhado[0]["financeiro_ids"], comparacao_ids=detalhado[0]["comparacao_ids"],
            ))).model_dump(mode="json")
            await db.commit()
            # Financeiro × extrato: a tarifa, desfeita.
            a = (await fin.vincular(a["id"], FinanceiroVinculoCreate(versao=a["versao"], financeiro_ids=ids("FINANCEIRO", -15.90), comparacao_ids=ids("EXTRATO", -15.90)))).model_dump(mode="json")
            await db.commit()
            tarifa = next(v for v in a["vinculos"] if v["estado"] == "ATIVO" and Decimal(v["total_comparacao"]) == Decimal("15.90") and v["tipo_comparacao"] == "EXTRATO")
            a = (await fin.desfazer(a["id"], UUID(tarifa["id"]), FinanceiroDesfazer(versao=a["versao"], motivo="A tarifa é de outro pacote."))).model_dump(mode="json")
            await db.commit()

            # Uma análise com documento, renomeada e excluída.
            b = (await fin.criar(AnaliseCreate(agencia_id=agencia.id, periodo_inicio=date(2026, 4, 1), periodo_fim=date(2026, 4, 15), titulo="Primeira quinzena"))).model_dump(mode="json")
            await db.commit()
            b = (await fin.adicionar_documento(b["id"], versao=b["versao"], tipo="FINANCEIRO", conteudo=financeiro_xlsx([(6, 1000, "FORNECEDOR ALFA INVENTADO")]), nome_arquivo="Quinzena.xlsx", confirmar_empresa=True)).model_dump(mode="json")
            await db.commit()
            b = (await fin.renomear(b["id"], NomeConciliacao(versao=b["versao"], titulo="Quinzena (descartada)"))).model_dump(mode="json")
            await db.commit()
            await fin.excluir(b["id"], b["versao"])
            await db.commit()

            vinculos = len(a["vinculos"])
            print(f"{empresa.razao_social}: 4 revisões (1 excluída), {len(r1['vinculos'])} vínculos na primeira; 2 análises (1 excluída), {vinculos} vínculos e {len(a['fontes']) - 1} documentos na primeira")
    await engine.dispose()


asyncio.run(main())
