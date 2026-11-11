"""Gabarito dos leitores do SISPAG e do extrato detalhado do Itaú, Fase 5 (11/11/2026).

Plugin do pytest: roda a suíte do original (dev41tech/contabil-core) que exercita `ler_sispag` e
`ler_extrato_detalhado` e grava cada chamada, com a entrada e a saída exatas. Depois acrescenta
planilhas INVENTADAS (xlsx pelo openpyxl, xls pelo xlwt) com os casos difíceis — dias que não
fecham, resgates, cabeçalho deslocado, valores como texto e como número, datas como texto e como
data, limites de tamanho — e chamadas diretas às funções internas (`_data`, `_decimal`,
`_sem_acento`, `_mapear`, `_moeda`, `_periodo`). Cada arquivo passa pelos DOIS leitores. O porte
em TypeScript repete as chamadas (`src/lib/contabil-core/conciliacao/{sispag,extratoDetalhado}.test.ts`).

Dados: os testes do original e os arquivos daqui são inventados. Os CNPJs que não são de exemplo
são trocados por fictícios, e os nomes da variável GABARITO_NOMES ("REAL=FICTICIO;..."), fora do
git, também; a chamada é REPETIDA com a entrada trocada, e o gabarito guarda a saída dela.

Uso, a partir da raiz do contabil-core (com openpyxl, xlrd, xlwt e pytest):
    PYTHONPATH=<connect>/scripts/contabil-core GABARITO_PASTA=<connect>/src/lib/contabil-core/conciliacao/gabarito \\
        python -W ignore -m pytest -q -p gabarito_sispag tests/unit/test_conciliacao_bancaria_sispag.py \\
        tests/unit/test_sispag_dimensoes.py tests/unit/test_extrato_detalhado.py

Conferência local em arquivos reais (a saída fica FORA do repositório):
    python -W ignore <connect>/scripts/contabil-core/gabarito_sispag.py conferir <saida.json> <arquivo>...
"""
from __future__ import annotations

import dataclasses
import functools
import hashlib
import io
import json
import os
import re
import sys
import types
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zipfile import ZipFile

# Valores fictícios só para a configuração carregar: nada aqui abre banco.
os.environ.setdefault("SECRET_KEY", "gabarito-local-sem-segredo-0123456789abcdef")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://gabarito:gabarito@127.0.0.1:1/gabarito")

chamadas: dict[str, dict] = {}
conteudos: dict[str, bytes] = {}  # sha → bytes de cada arquivo usado nas chamadas
nomes_de_arquivo: dict[str, str] = {}  # sha → nome do arquivo inventado

_CNPJ = re.compile(r"\b(\d{2})\.?(\d{3})\.?(\d{3})/?(\d{4})-?(\d{2})\b")
_EXEMPLOS = ("00000000", "11111111", "12345678", "99999999", "22222222", "33333333")


def _troca_cnpj(m: re.Match) -> str:
    original = m.group(0)
    digitos = re.sub(r"\D", "", original)
    if len(digitos) != 14 or digitos.startswith(_EXEMPLOS):
        return original
    novo = "".join(str(int(c, 16) % 10) for c in hashlib.sha256(digitos.encode()).hexdigest()[:14])
    novo = "9" + novo[1:]
    saida, i = [], 0
    for c in original:
        if c.isdigit():
            saida.append(novo[i])
            i += 1
        else:
            saida.append(c)
    return "".join(saida)


_NOMES = dict(
    par.split("=", 1) for par in os.environ.get("GABARITO_NOMES", "").split(";") if "=" in par
)


def sanitizar(v):
    if isinstance(v, str):
        for real, ficticio in _NOMES.items():
            v = v.replace(real, ficticio)
        return _CNPJ.sub(_troca_cnpj, v)
    if isinstance(v, list):
        return [sanitizar(x) for x in v]
    if isinstance(v, tuple):
        return tuple(sanitizar(x) for x in v)
    if isinstance(v, dict):
        return {k: sanitizar(x) for k, x in v.items()}
    return v


def codificar(v):
    if isinstance(v, int) and not isinstance(v, bool) and abs(v) > 2**53:
        return {"$int": str(v)}
    if isinstance(v, bool) or v is None or isinstance(v, (int, str)):
        return v
    if isinstance(v, float):
        return {"$f": repr(v)}
    if isinstance(v, Decimal):
        return {"$dec": str(v)}
    if isinstance(v, datetime):
        return {"$dt": str(v)}
    if isinstance(v, time):
        return {"$time": str(v)}
    if isinstance(v, timedelta):
        return {"$td": str(v)}
    if isinstance(v, date):
        return {"$date": v.isoformat()}
    if isinstance(v, bytes):
        # O arquivo vai uma vez só para a pasta do gabarito; a chamada guarda o nome dele.
        sha = hashlib.sha256(v).hexdigest()[:12]
        conteudos.setdefault(sha, v)
        return {"$arquivo": sha}
    if isinstance(v, (list, tuple)):
        return [codificar(x) for x in v]
    if isinstance(v, dict):
        return {str(k): codificar(x) for k, x in v.items()}
    if dataclasses.is_dataclass(v) and not isinstance(v, type):
        return {f.name: codificar(getattr(v, f.name)) for f in dataclasses.fields(v)}
    raise TypeError(f"tipo sem codificação: {type(v)!r}")


def _registrar(nome, fn, args, kwargs=None):
    kwargs = kwargs or {}
    entrada = {"fn": nome, "args": codificar(list(args)), "kwargs": codificar(kwargs)}
    try:
        entrada["result"] = codificar(fn(*args, **kwargs))
    except Exception as exc:  # noqa: BLE001 — o erro também é saída
        entrada["error"] = {"tipo": type(exc).__name__, "mensagem": str(exc)}
    chave = json.dumps([entrada["fn"], entrada["args"], entrada["kwargs"]], sort_keys=True, ensure_ascii=False)
    chamadas.setdefault(chave, entrada)


def envolver(modulo, nome_fn, rotulo):
    original = getattr(modulo, nome_fn)
    if getattr(original, "__gabarito__", False):
        return

    @functools.wraps(original)
    def gravador(*args, **kwargs):
        try:
            return original(*args, **kwargs)  # o teste segue com a chamada de verdade
        finally:
            # Também as chamadas que levantam (os testes de recusa).
            _registrar(rotulo, original, sanitizar(list(args)), sanitizar(kwargs))

    gravador.__gabarito__ = True
    setattr(modulo, nome_fn, gravador)


def _modulos():
    sys.path.insert(0, os.getcwd())
    from src.domain.conciliacao_bancaria import extrato_detalhado, sispag

    return sispag, extrato_detalhado


def pytest_configure(config):  # noqa: ARG001
    sispag, detalhado = _modulos()
    envolver(sispag, "ler_sispag", "sispag.ler_sispag")
    envolver(detalhado, "ler_extrato_detalhado", "detalhado.ler_extrato_detalhado")


# ─── Planilhas inventadas ───────────────────────────────────────────────────

def xlsx(folhas, formatos=None, titulos=None):
    """`folhas`: lista de listas de linhas; `formatos`: {(folha, "A1"): "dd/mm/yyyy"}."""
    import openpyxl

    wb = openpyxl.Workbook()
    for i, linhas in enumerate(folhas):
        ws = wb.active if i == 0 else wb.create_sheet()
        ws.title = (titulos or [f"Folha{n + 1}" for n in range(len(folhas))])[i]
        for linha in linhas:
            ws.append(linha)
    for (i, coord), fmt in (formatos or {}).items():
        wb.worksheets[i][coord].number_format = fmt
    b = io.BytesIO()
    wb.save(b)
    return b.getvalue()


def xls(folhas, titulos=None):
    """Datas (`date`/`datetime`) saem com formato de data; o resto, como o xlwt escreve."""
    import xlwt

    wb = xlwt.Workbook()
    data = xlwt.easyxf(num_format_str="dd/mm/yyyy")
    data_hora = xlwt.easyxf(num_format_str="dd/mm/yyyy hh:mm")
    for i, linhas in enumerate(folhas):
        ws = wb.add_sheet((titulos or [f"Folha{n + 1}" for n in range(len(folhas))])[i])
        for r, linha in enumerate(linhas):
            for c, v in enumerate(linha):
                if v is None:
                    continue
                if isinstance(v, datetime):
                    ws.write(r, c, v, data_hora if (v.hour or v.minute) else data)
                elif isinstance(v, date):
                    ws.write(r, c, v, data)
                else:
                    ws.write(r, c, v)
    b = io.BytesIO()
    wb.save(b)
    return b.getvalue()


def trocar_no_zip(conteudo, troca):
    """Reescreve o XML da primeira folha (dimensão declarada errada, colunas a mais...)."""
    saida = io.BytesIO()
    with ZipFile(io.BytesIO(conteudo)) as z, ZipFile(saida, "w") as novo:
        for item in z.infolist():
            dados = z.read(item.filename)
            if item.filename == "xl/worksheets/sheet1.xml":
                dados = troca(dados)
            novo.writestr(item, dados)
    return saida.getvalue()


CAB_SISPAG = ["favorecido / beneficiário", "CPF/CNPJ", "tipo de pagamento",
              "referência da empresa", "data do pagamento", "valor (R$)", "status"]


def sispag_linhas(pagamentos, *, conta="7285 / 12287-0", cnpj="12.345.678/0001-95", cab=CAB_SISPAG,
                  deslocar=0, total=True):
    pre = [None] * deslocar
    linhas = [
        [],
        ["Dados da conta"],
        pre + ["Agência/conta", conta, "Nome da empresa:", "EMPRESA FICTICIA LTDA"],
        pre + ["CNPJ:", cnpj],
        pre + ["Período:", "01/04/2025 - 30/04/2025", "Status:", "todos"],
        pre + cab,
    ]
    for p in pagamentos:
        linhas.append(pre + list(p))
    if total:
        linhas.append(pre + ["Total:", None, None, None, None, 999.99])
    return linhas


def pag(fav, tipo, data, valor, status="Efetuado", doc="***.331.078-**", ref="-"):
    return [fav, doc, tipo, ref, data, valor, status]


def casos_sispag():
    dia = "08/04/2025"
    basicos = [
        pag("ALFA FICTICIO", "Conta Corrente", dia, 150.5),
        pag("BETA FICTICIO", "Boleto outros bancos", dia, 40213.7, "Não efetuado"),
        pag("GAMA FICTICIO", "PIX Transferências", "09/04/2025", 10, "Agendado"),
        pag("DELTA FICTICIO", "TED", "1/4/2025", -367.92, "EFETUADO"),
        pag("EPSILON", "Conta Corrente", dia, 0, "efetuado com sucesso"),
        pag("  ZETA  ", "  PIX  ", dia, 0.1 + 0.2, None),
        pag("ETA", "Conta Corrente", dia, 2.675, ""),
        pag("TETA", "Conta Corrente", dia, 0.125),
        pag("IOTA", "Conta Corrente", dia, 1e16),
        pag("KAPA", "Conta Corrente", "31/02/2025", 10.0),
        pag("LAMBDA", "Conta Corrente", "2025-04-08", 10.0),
        pag(None, None, dia, 5, None, doc=None),
        pag("MI", "Conta Corrente", None, 5),
    ]
    yield "basico.xlsx", xlsx([sispag_linhas(basicos)])
    yield "basico.xls", xls([sispag_linhas(basicos)])
    textos = [
        pag("ALFA", "Conta Corrente", datetime(2025, 4, 8), "1.234,56"),
        pag("BETA", "PIX", datetime(2025, 4, 8, 14, 30), "-150,00"),
        pag("GAMA", "PIX", date(2025, 4, 9), "R$ 10,00"),
        pag("DELTA", "PIX", dia, "1234.56"),
        pag("EPSILON", "PIX", dia, "  "),
        pag("ZETA", "PIX", dia, "1_000,5"),
        pag("ETA", "PIX", dia, "1e3"),
        pag("TETA", "PIX", dia, "Infinity"),
        pag("IOTA", "PIX", dia, "1e26"),
        pag("KAPA", "PIX", dia, "0,005"),
        pag("LAMBDA", "PIX", " 08/04/2025 ", "-0,00"),
        pag("MI", "PIX", "08/04/2025 10:00", "1,00"),
        pag("NI", "PIX", "29/02/2024", True),
        pag("XI", "PIX", "29/02/2024", "٣,٥٠"),
        pag("OMICRON", "PIX", "01/01/٢٠٢٥", "1,00"),
        pag("PI", "PIX", "1٢/01/2025", "1,00"),
        pag(12345, 678, dia, "2,00", 1),
    ]
    yield "textos.xlsx", xlsx([sispag_linhas(textos)], {(0, "F8"): "#,##0.00"})
    yield "textos.xls", xls([sispag_linhas(textos)])
    acentos = ["FAVORECIDO", "CPF / CNPJ", "Tipo de Pagamento", "Data do Pagamento", "VALOR", "STATUS do pagamento"]
    yield "cabecalho-deslocado.xlsx", xlsx([sispag_linhas(
        [["ALFA", "1", "PIX", dia, 1.5, "Efetuado"], ["BETA", "2", "TED", dia, "3,00", "Cancelado"]],
        cab=acentos, deslocar=3, total=False,
    )])
    yield "cabecalho-deslocado.xls", xls([sispag_linhas(
        [["ALFA", "1", "PIX", dia, 1.5, "Efetuado"]], cab=acentos, deslocar=2, total=False,
    )])
    # Sem documento nem status; coluna "valor" repetida: vale a primeira.
    yield "sem-status.xlsx", xlsx([[
        ["Agência/Conta:", "0001 / 1-1"], ["CNPJ", "11.111.111/0001-11"],
        ["Favorecido", "Tipo de pagamento", "Data do pagamento", "Valor", "Valor (R$)"],
        ["ALFA", "PIX", dia, 1, 2], ["BETA", "PIX", dia, None, 3], [], ["GAMA", "PIX", dia, 0.5, 4],
    ]])
    # Capa sem tabela e duas folhas com pagamentos: as linhas das folhas são emendadas.
    yield "duas-folhas.xlsx", xlsx([
        [["Consulta de pagamentos"], ["Agência/conta", "7285 / 1-0"]],
        sispag_linhas([pag("ALFA", "PIX", dia, 1)], total=False),
        [pag("BETA", "PIX", dia, 2), CAB_SISPAG, pag("GAMA", "PIX", dia, 3)],
    ], titulos=["Capa", "Pagamentos", "Mais"])
    yield "duas-folhas.xls", xls([
        [["Consulta de pagamentos"]],
        sispag_linhas([pag("ALFA", "PIX", date(2025, 4, 8), 1)], total=False),
    ], titulos=["Capa", "Pagamentos"])
    # Número que não cabe em 28 dígitos com centavos: o original deixa escapar o InvalidOperation.
    yield "numero-gigante.xlsx", xlsx([sispag_linhas([pag("ALFA", "PIX", dia, 1e27)], total=False)])
    yield "texto-gigante.xlsx", xlsx([sispag_linhas([pag("ALFA", "PIX", dia, "1" * 27), pag("BETA", "PIX", dia, "1")], total=False)])
    yield "sem-tipo.xlsx", xlsx([[["Favorecido", "Data do pagamento", "Valor"], ["ALFA", dia, 1]]])
    yield "consolidado.xlsx", xlsx([[
        ["Data", "Lançamento", "Valor (R$)", "Saldo (R$)"], [dia, "SISPAG FORNECEDORES", -10, 100],
    ]])
    yield "consolidado-sem-acento.xls", xls([[["Data", "LANCAMENTOS", "Valor"], [dia, "X", 1]]])
    yield "sem-pagamentos.xlsx", xlsx([sispag_linhas([])])
    yield "vazio.xlsx", xlsx([[]])
    base = xlsx([sispag_linhas(basicos[:3])])
    yield "dimensao-menor.xlsx", trocar_no_zip(base, lambda d: re.sub(rb'<dimension ref="[^"]*"', b'<dimension ref="A1:B2"', d))
    yield "dimensao-sem-ref.xlsx", trocar_no_zip(base, lambda d: re.sub(rb'<dimension ref="[^"]*"', b'<dimension', d))
    yield "dimensao-linhas-demais.xlsx", trocar_no_zip(base, lambda d: re.sub(rb'<dimension ref="[^"]*"', b'<dimension ref="A1:G20001"', d))
    yield "dimensao-celulas-demais.xlsx", trocar_no_zip(base, lambda d: re.sub(rb'<dimension ref="[^"]*"', b'<dimension ref="A1:DX4000"', d))
    yield "dimensao-colunas.xlsx", trocar_no_zip(base, lambda d: re.sub(rb'<dimension ref="[^"]*"', b'<dimension ref="A:EZ"', d))
    yield "coordenada-invalida.xlsx", trocar_no_zip(base, lambda d: d.replace(b'<c r="A2"', b'<c r="2A"', 1))
    colunas = sispag_linhas(basicos[:2])
    colunas[2] = colunas[2] + [None] * 130 + ["fim"]
    yield "colunas-demais.xlsx", xlsx([colunas])
    yield "colunas-demais.xls", xls([colunas])
    yield "pdf.pdf", b"%PDF-1.4 qualquer coisa"
    yield "vazio.bin", b""
    yield "zip-quebrado.xlsx", b"PK\x03\x04 isto nao e um zip"
    yield "ole-quebrado.xls", b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 600
    yield "texto.csv", "favorecido;tipo de pagamento;data do pagamento;valor\nA;PIX;08/04/2025;1\n".encode()


def detalhado_linhas(dias, *, anterior=100.00, extras=(), periodo="01/01/2025 até 31/01/2025",
                     cab=None, deslocar=0, cabecalho=True, data_anterior="31/12/2024"):
    pre = [None] * deslocar
    linhas = []
    if cabecalho:
        linhas += [
            [],
            ["Atualização:", "19/03/2026 17:57:05"],
            ["Nome:", "EMPRESA FICTICIA"],
            ["Agência:", "7285"],
            ["Conta:", "0012287-0"],
            [],
            ["Lançamentos"],
        ]
        if periodo is not None:
            linhas.append(["Periodo:", periodo])
        linhas.append([])
    linhas.append(pre + (cab or ["Data", "Lançamento", "Razão Social", "CPF/CNPJ", "Valor (R$)", "Saldo (R$)"]))
    if anterior is not None:
        linhas.append(pre + [data_anterior, "SALDO ANTERIOR", "", "", None, anterior])
    for dia, movimentos, saldos in dias:
        for lancamento, nome, documento, valor in movimentos:
            linhas.append(pre + [dia, lancamento, nome, documento, valor, None])
        for rotulo, saldo in saldos:
            linhas.append(pre + [dia, rotulo, "", "", None, saldo])
    for linha in extras:
        linhas.append(pre + list(linha))
    return linhas


DIAS = [
    ("02/01/2025", [
        ("AQUISICAO FORNECEDORES", "", "", 1000.00),
        ("PAGAMENTOS A FORNECEDORES", "FORNECEDOR ALFA LTDA", "11.111.111/0001-11", -100.00),
        ("PAGAMENTOS A FORNECEDORES", "FORNECEDOR BETA LTDA", "22.222.222/0001-22", -200.00),
    ], [("SALDO TOTAL DISPONÍVEL DIA", 800.00), ("SALDO MOVIMENTAÇÃO CONTA", 1.00)]),
    ("03/01/2025", [
        ("PAGAMENTOS A FORNECEDORES", "FORNECEDOR GAMA LTDA", "33.333.333/0001-33", -250.00),
        ("RES APLIC AUT MAIS", "", "", 200.00),
    ], [("SALDO APLIC. AUT.", 799.00), ("SALDO TOTAL DISPONÍVEL DIA", 550.00), ("SALDO MOVIMENTAÇÃO CONTA", -49.00)]),
]


def casos_detalhado():
    yield "base.xlsx", xlsx([detalhado_linhas(DIAS)])
    yield "base.xls", xls([detalhado_linhas(DIAS)])
    # Três dias, com resgates, aplicação conferida, valores grandes e movimento zerado.
    grandes = [
        ("02/01/2025", [
            ("PIX RECEBIDO", "CLIENTE FICTICIO SA", "99.999.999/0001-99", 3706427.14),
            ("TARIFA", "", "", 0),
            ("SISPAG FORNECEDORES", "FORNECEDOR DELTA", "***.123.456-**", -0.01),
        ], [("SALDO TOTAL DISPONÍVEL DIA", 3706527.13), ("SALDO MOVIMENTAÇÃO CONTA", 1.00)]),
        ("03/01/2025", [
            ("RES APLIC AUT MAIS", "", "", 3920323.56),
            ("RES APLIC AUT MAIS", "", "", 10.00),
            ("PAGAMENTO FOLHA", "", "", -3920323.56),
        ], [("SALDO APLIC. AUT.", 3706526.13), ("SALDO TOTAL DISPONÍVEL DIA", -213796.43),
            ("SALDO MOVIMENTAÇÃO CONTA", 1.00)]),
        ("06/01/2025", [("PIX RECEBIDO", "", "", 213797.43)],
         [("SALDO APLIC. AUT.", -213797.43), ("SALDO TOTAL DISPONÍVEL DIA", 1.00)]),
    ]
    yield "tres-dias.xlsx", xlsx([detalhado_linhas(grandes)])
    yield "tres-dias.xls", xls([detalhado_linhas(grandes)])
    # Os dias que não fecham: somando o resgate, ou sem um movimento.
    errado = [DIAS[0], ("03/01/2025", DIAS[1][1], [("SALDO TOTAL DISPONÍVEL DIA", 750.00)])]
    yield "nao-fecha-resgate.xlsx", xlsx([detalhado_linhas(errado)])
    yield "nao-fecha-grande.xlsx", xlsx([detalhado_linhas(
        [("02/01/2025", [("PIX", "", "", 8400000.0)], [("SALDO TOTAL DISPONÍVEL DIA", -213896.43)])], anterior=0)])
    yield "nao-fecha-negativo.xls", xls([detalhado_linhas(
        [("02/01/2025", [("PIX", "", "", -1234567.5)], [("SALDO TOTAL DISPONÍVEL DIA", 0)])], anterior=0.5)])
    yield "aplicacao-divergente.xlsx", xlsx([detalhado_linhas(
        [DIAS[0], ("03/01/2025", DIAS[1][1], [("SALDO APLIC. AUT.", 500.00), *DIAS[1][2][1:]])])])
    yield "aplicacao-primeiro-dia.xlsx", xlsx([detalhado_linhas(
        [("02/01/2025", DIAS[0][1], [("SALDO APLIC. AUT.", 12345.00), *DIAS[0][2]])])])
    # Valores e saldos como texto, datas como data, rótulos em caixa e espaçamento diferentes.
    textos = [
        (datetime(2025, 1, 2), [
            ("Aquisicao  Fornecedores", "", "", "1.000,00"),
            ("PAGAMENTOS A FORNECEDORES", "  ALFA  ", " 11.111.111/0001-11 ", "-100,00"),
            ("PAGAMENTOS", 123, 45678901234, -200),
        ], [("saldo total disponivel dia", "800,00"), ("Saldo  Movimentação  Conta", "1,00")]),
        (date(2025, 1, 3), [("res aplic aut", "", "", "200"), ("PIX", "", "", "-250,00")],
         [("SALDO APLIC. AUT.", "799,00"), ("SALDO TOTAL DISPONIVEL DIA", 550)]),
    ]
    yield "textos.xlsx", xlsx([detalhado_linhas(textos, anterior="100,00")])
    yield "textos.xls", xls([detalhado_linhas(textos, anterior="100,00")])
    cab = ["DATA", "LANÇAMENTO", "RAZÃO  SOCIAL", "CPF / CNPJ", "VALOR", "SALDO"]
    yield "cabecalho-deslocado.xlsx", xlsx([detalhado_linhas(DIAS, cab=cab, deslocar=2)])
    yield "cabecalho-deslocado.xls", xls([detalhado_linhas(DIAS, cab=cab, deslocar=1)])
    # Folhas: capa sem tabela + extrato (a numeração é da folha do extrato); duas com tabela.
    yield "capa-e-extrato.xlsx", xlsx([[["Capa"], ["Nome:", "OUTRA"]], detalhado_linhas(DIAS)], titulos=["Capa", "Lançamentos"])
    yield "capa-e-extrato.xls", xls([[["Capa"]], detalhado_linhas(DIAS)], titulos=["Capa", "Lançamentos"])
    yield "duas-tabelas.xlsx", xlsx([detalhado_linhas(DIAS), detalhado_linhas(DIAS)])
    yield "sem-tabela-duas-folhas.xlsx", xlsx([[["Nome:", "X"]], [["Data", "Lançamento", "Valor"]]])
    # Recusas linha a linha.
    extras = {
        "linha-desconhecida": [["31/01/2025", "SALDO BLOQUEADO", "", "", None, 10.00]],
        "pendente-no-fim": [["31/01/2025", "PIX RECEBIDO", "CLIENTE", "", 10.00, None],
                            ["31/01/2025", "TED", "", "", "-1,00", "  "]],
        "data-ilegivel": [["31/13/2025", "PIX RECEBIDO", "", "", 10.00, None]],
        "data-ilegivel-sem-texto": [[None, None, "X", "", 10.00, None]],
        "valor-e-saldo": [["31/01/2025", "PIX", "", "", 10.00, 20.00]],
        "anterior-repetido": [["31/01/2025", "SALDO ANTERIOR", "", "", None, 550.00]],
        "anterior-sem-saldo": [["31/01/2025", "Saldo Anterior", "", "", None, None]],
        "linha-em-branco": [[None, "", None, "", None, None], [], ["", " "]],
    }
    for nome, linhas in extras.items():
        yield f"{nome}.xlsx", xlsx([detalhado_linhas(DIAS, extras=linhas)])
    yield "linha-desconhecida.xls", xls([detalhado_linhas(DIAS, extras=extras["linha-desconhecida"])])
    yield "sem-anterior.xlsx", xlsx([detalhado_linhas(DIAS, anterior=None)])
    yield "sem-anterior-sem-saldos.xlsx", xlsx([detalhado_linhas([("02/01/2025", DIAS[0][1], [])], anterior=None)])
    yield "sem-movimentos.xlsx", xlsx([detalhado_linhas([("02/01/2025", [], [("SALDO TOTAL DISPONÍVEL DIA", 100.00)])])])
    yield "so-cabecalho.xlsx", xlsx([detalhado_linhas([], anterior=None)])
    # Período: ausente, com uma data só, e movimentos fora dele.
    yield "sem-periodo.xlsx", xlsx([detalhado_linhas(DIAS, periodo=None)])
    yield "periodo-uma-data.xlsx", xlsx([detalhado_linhas(DIAS, periodo="a partir de 01/01/2025")])
    yield "periodo-invalido.xlsx", xlsx([detalhado_linhas(DIAS, periodo="31/02/2025 até 28/01/2025")])
    yield "fora-do-periodo.xlsx", xlsx([detalhado_linhas(DIAS, periodo="03/01/2025 até 31/01/2025")])
    yield "fora-do-periodo-depois.xls", xls([detalhado_linhas(DIAS, periodo="01/12/2024 até 02/01/2025")])
    yield "sem-cabecalho.xlsx", xlsx([detalhado_linhas(DIAS, cabecalho=False)])
    # Resgate que não é "RES APLIC AUT" no começo entra na conta.
    yield "resgate-no-meio.xlsx", xlsx([detalhado_linhas(
        [("02/01/2025", [("PIX RES APLIC AUT", "", "", 50.00)], [("SALDO TOTAL DISPONÍVEL DIA", 150.00)])])])
    yield "zero-negativo.xlsx", xlsx([detalhado_linhas(
        [("02/01/2025", [("PIX", "", "", -5.0)], [("SALDO TOTAL DISPONÍVEL DIA", "-0,00")])], anterior=5.0)])
    base = xlsx([detalhado_linhas(DIAS)])
    yield "dimensao-menor.xlsx", trocar_no_zip(base, lambda d: re.sub(rb'<dimension ref="[^"]*"', b'<dimension ref="A1:A1"', d))
    yield "pdf.pdf", b"%PDF-1.4"
    yield "zip-quebrado.xlsx", b"PK\x05\x06" + b"\x00" * 18


def chamadas_diretas(sispag, detalhado):
    from src.domain.conciliacao_bancaria import extrato_detalhado as ed

    celulas = [
        None, "", " ", "0", 0, 0.0, -0.0, 1, 150.5, 0.1 + 0.2, 2.675, 0.125, 1e16, 1e-7, 123456789012345678901234567890,
        True, False, "1.234,56", "-1.234,56", "R$ 1,00", "1,5", "1.5", "1e3", "1E-3", "Infinity", "-inf", "sNaN",
        "1e26", "1e25", "12345678901234567890123456,7", "  -0,00 ", "1_000", "٣,٥", "abc",
        "08/04/2025", "8/4/2025", " 08/04/2025 ", "08/04/25", "31/02/2025", "29/02/2024", "29/02/2023",
        "00/01/2025", "01/00/2025", "01/13/2025", "01/01/0000", "01/01/0001", "31/12/9999", "1/1/1",
        "08/04/2025 10:00", "2025-04-08", "01/01/٢٠٢٥", "1٢/01/2025", "٠١/01/2025", "08-04-2025",
        datetime(2025, 4, 8), datetime(2025, 4, 8, 23, 59, 59), date(2025, 4, 8), time(10, 30), timedelta(0),
        timedelta(days=1, hours=2),
    ]
    for c in celulas:
        _registrar("sispag._data", sispag._data, [c])
        _registrar("detalhado._data", ed._data, [c])
        _registrar("sispag._decimal", sispag._decimal, [c])
        _registrar("detalhado._decimal", ed._decimal, [c])
    for t in ["", "  Favorecido  ", "FAVORECIDO / BENEFICIÁRIO", "Razão  Social", "Ação\tÚNICA\n", "ﬁ", "İstanbul",
              "SALDO TOTAL DISPONÍVEL DIA", "Agência/Conta:", "x y", "Σ ΟΔΟΣ", "ǅ", "ẞ"]:
        _registrar("sispag._sem_acento", sispag._sem_acento, [t])
        _registrar("detalhado._sem_acento", ed._sem_acento, [t])
    for linha in [
        ["favorecido", "cpf", "tipo de pagamento", "data do pagamento", "valor", "status"],
        ["Favorecido", None, 0, "Tipo de pagamento x", "DATA DO PAGAMENTO", "valor", "valor 2"],
        ["favorecido", "data do pagamento", "valor"],
        ["Data", "Lançamento", "Razão Social", "CPF/CNPJ", "Valor (R$)", "Saldo (R$)"],
        ["data", "lancamento", "razao social", "cpf", "valor", "saldo", "data"],
        ["Data", "Lançamento", "Razão Social", "Valor", "Saldo"],
        [],
    ]:
        _registrar("sispag._mapear", sispag._mapear, [linha])
        _registrar("detalhado._mapear", ed._mapear, [linha])
    for v in ["0", "-0.00", "0.005", "1234567.5", "-1234567.50", "1000", "999.995", "-213896.43", "8400000"]:
        _registrar("detalhado._moeda", ed._moeda, [Decimal(v)])
    for t in ["01/01/2025 até 31/01/2025", "", "01/01/2025", "01/01/2025 a 02/01/2025 a 03/01/2025",
              "31/02/2025 - 01/03/2025", "١٢/٠١/٢٠٢٥ até 31/01/2025", "1/1/2025 até 31/01/2025"]:
        _registrar("detalhado._periodo", ed._periodo, [t])


def pytest_unconfigure(config):  # noqa: ARG001
    pasta = os.environ.get("GABARITO_PASTA")
    if not pasta:
        return
    sispag, detalhado = _modulos()
    ler_sispag = getattr(sispag.ler_sispag, "__wrapped__", sispag.ler_sispag)
    ler_detalhado = getattr(detalhado.ler_extrato_detalhado, "__wrapped__", detalhado.ler_extrato_detalhado)
    # Os arquivos da suíte também passam pelo outro leitor; o nome diz de que teste vieram.
    for r in list(chamadas.values()):
        sha = r["args"][0]["$arquivo"]
        if r["fn"] == "sispag.ler_sispag":
            nomes_de_arquivo.setdefault(sha, f"sispag-suite-{sha}")
            _registrar("detalhado.ler_extrato_detalhado", ler_detalhado, [conteudos[sha]])
        elif r["fn"] == "detalhado.ler_extrato_detalhado":
            nomes_de_arquivo.setdefault(sha, f"detalhado-suite-{sha}")
            _registrar("sispag.ler_sispag", ler_sispag, [conteudos[sha]])
    for prefixo, casos in (("sispag", casos_sispag()), ("detalhado", casos_detalhado())):
        for nome, conteudo in casos:
            sha = hashlib.sha256(conteudo).hexdigest()[:12]
            nomes_de_arquivo.setdefault(sha, f"{prefixo}-{nome}")
            _registrar("sispag.ler_sispag", ler_sispag, [conteudo])
            _registrar("detalhado.ler_extrato_detalhado", ler_detalhado, [conteudo])
    chamadas_diretas(sispag, detalhado)

    # Cada arquivo uma vez, com nome legível; a chamada aponta para ele.
    for sha, conteudo in conteudos.items():
        nome = nomes_de_arquivo[sha]
        if "." not in nome:
            nome += ".xlsx" if conteudo[:2] == b"PK" else ".xls" if conteudo[:4] == b"\xd0\xcf\x11\xe0" else ".bin"
        nomes_de_arquivo[sha] = nome
        with open(os.path.join(pasta, nome), "wb") as f:
            f.write(conteudo)
    for r in chamadas.values():
        if r["args"] and isinstance(r["args"][0], dict) and "$arquivo" in r["args"][0]:
            r["args"][0] = {"$arquivo": nomes_de_arquivo[r["args"][0]["$arquivo"]]}

    registros = sorted(chamadas.values(), key=lambda r: (r["fn"], json.dumps(r["args"], ensure_ascii=False)))
    for prefixo in ("sispag", "detalhado"):
        destino = os.path.join(pasta, f"{prefixo}-chamadas.json")
        escolhidos = [r for r in registros if r["fn"].startswith(prefixo + ".")]
        with open(destino, "w", encoding="utf-8", newline="\n") as f:
            json.dump(escolhidos, f, ensure_ascii=False, indent=0)
        por_fn: dict[str, int] = {}
        for r in escolhidos:
            por_fn[r["fn"]] = por_fn.get(r["fn"], 0) + 1
        print(f"\ngabarito: {len(escolhidos)} chamadas {por_fn} -> {destino}")


# ─── Conferência local ──────────────────────────────────────────────────────

def conferir(saida, arquivos):
    sispag, detalhado = _modulos()
    resultado = {}
    for caminho in arquivos:
        with open(caminho, "rb") as f:
            conteudo = f.read()
        nome = os.path.basename(caminho)
        resultado[nome] = {}
        for rotulo, fn in (("sispag", sispag.ler_sispag), ("detalhado", detalhado.ler_extrato_detalhado)):
            try:
                resultado[nome][rotulo] = {"result": codificar(fn(conteudo))}
            except Exception as exc:  # noqa: BLE001
                resultado[nome][rotulo] = {"error": {"tipo": type(exc).__name__, "mensagem": str(exc)}}
    with open(saida, "w", encoding="utf-8") as f:
        json.dump(resultado, f, ensure_ascii=False)
    print(f"{len(arquivos)} arquivo(s) -> {saida}")


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "conferir":
        conferir(sys.argv[2], sys.argv[3:])
    else:
        print(__doc__)
        sys.exit(2)
