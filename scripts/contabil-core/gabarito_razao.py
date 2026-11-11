"""Gabarito dos leitores de Razão do Contábil Core, Fase 5 (11/11/2026).

Plugin do pytest: roda a suíte do original que exercita `concilpro/planilha.py`,
`conciliacao_bancaria/razao.py` e `conciliacao_bancaria/apoio.py` e grava cada chamada às funções
públicas (e a algumas internas), com a entrada e a saída exatas. Depois acrescenta chamadas sobre
planilhas (openpyxl, xlwt) e PDFs (PyMuPDF) INVENTADOS, com os casos difíceis que a suíte não cobre.
O porte em TypeScript repete as chamadas (`src/lib/contabil-core/conciliacao/razao.test.ts`).

Saída, em `src/lib/contabil-core/conciliacao/gabarito/`:
- `razao-chamadas.json`: as chamadas; bytes viram `{"$arquivo": <sha12>}`;
- `razao-arquivos.json`: o conteúdo de cada arquivo usado (base64).

Dados: as planilhas da suíte são montadas em memória, com nomes de fornecedores que podem ser
reais. Os nomes listados em GABARITO_NOMES ("REAL=FICTICIO;..."; fora do git, com o fictício do
MESMO tamanho) são trocados no texto e DENTRO dos arquivos (XML do xlsx, BIFF do xls), e a chamada é
REPETIDA com a entrada trocada: o gabarito guarda a saída da entrada fictícia, nunca a da original.
CNPJs que não são de exemplo também são trocados por fictícios do mesmo formato.

Para PDF, além dos bytes, a chamada guarda as linhas de texto que o pdfplumber extraiu
(`linhas_pdf`): a suíte troca o `pdfplumber.open` por um falso, e o porte repete a leitura a partir
dessas linhas. Os PDFs inventados aqui (`pdf_real`) também são lidos pelo porte de verdade.

Uso, a partir da raiz do contabil-core, com pytest, openpyxl, xlrd, xlwt, pdfplumber e pymupdf:
    PYTHONPATH=<connect>/scripts/contabil-core GABARITO_SAIDA=<pasta> SECRET_KEY=x DATABASE_URL=x \
        python -W ignore -m pytest -q -p gabarito_razao tests/unit/test_concilpro_planilha.py \
        tests/unit/test_conciliacao_bancaria_razao.py tests/unit/test_conciliacao_apoio.py
"""
from __future__ import annotations

import base64
import dataclasses
import functools
import hashlib
import io
import json
import os
import re
import zipfile
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from pathlib import Path

chamadas: dict[str, dict] = {}
arquivos: dict[str, str] = {}

# ─── Sanitização ──────────────────────────────────────────────────────────────

_CNPJ = re.compile(r"\b(\d{2})\.?(\d{3})\.?(\d{3})/?(\d{4})-?(\d{2})\b")
_EXEMPLOS = ("00000000", "11111111", "12345678", "99999999", "98765432")


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
for _real, _ficticio in _NOMES.items():
    assert len(_real) == len(_ficticio), "GABARITO_NOMES: o fictício precisa ter o tamanho do real"


def _sanitizar_texto(v: str) -> str:
    for real, ficticio in _NOMES.items():
        v = v.replace(real, ficticio)
    return _CNPJ.sub(_troca_cnpj, v)


def _sanitizar_bytes(b: bytes) -> bytes:
    if not _NOMES:
        return b
    if b[:2] == b"PK":
        try:
            entrada = zipfile.ZipFile(io.BytesIO(b))
            membros = [(info, entrada.read(info)) for info in entrada.infolist()]
        except Exception:  # noqa: BLE001 — zip quebrado fica como está
            return b
        trocados = []
        mudou = False
        for info, dados in membros:
            try:
                texto = dados.decode("utf-8")
            except UnicodeDecodeError:
                trocados.append((info, dados))
                continue
            novo = texto
            for real, ficticio in _NOMES.items():
                novo = novo.replace(real, ficticio)
            mudou |= novo != texto
            trocados.append((info, novo.encode("utf-8")))
        if not mudou:
            return b
        saida = io.BytesIO()
        with zipfile.ZipFile(saida, "w", zipfile.ZIP_DEFLATED) as z:
            for info, dados in trocados:
                z.writestr(info, dados)
        return saida.getvalue()
    if b[:4] == b"\xd0\xcf\x11\xe0":
        for real, ficticio in _NOMES.items():
            for codificacao in ("latin-1", "utf-16-le"):
                b = b.replace(real.encode(codificacao), ficticio.encode(codificacao))
    return b


def sanitizar(v):
    if isinstance(v, str):
        return _sanitizar_texto(v)
    if isinstance(v, bytes):
        return _sanitizar_bytes(v)
    if isinstance(v, list):
        return [sanitizar(x) for x in v]
    if isinstance(v, tuple):
        return tuple(sanitizar(x) for x in v)
    if isinstance(v, dict):
        return {k: sanitizar(x) for k, x in v.items()}
    if dataclasses.is_dataclass(v) and not isinstance(v, type):
        return dataclasses.replace(
            v, **{f.name: sanitizar(getattr(v, f.name)) for f in dataclasses.fields(v) if f.init}
        )
    return v


# ─── Codificação ──────────────────────────────────────────────────────────────


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
    if isinstance(v, (bytes, bytearray)):
        chave = hashlib.sha256(bytes(v)).hexdigest()[:12]
        arquivos[chave] = base64.b64encode(bytes(v)).decode()
        return {"$arquivo": chave}
    if isinstance(v, (list, tuple)):
        return [codificar(x) for x in v]
    if isinstance(v, dict):
        return {str(k): codificar(x) for k, x in v.items()}
    if dataclasses.is_dataclass(v) and not isinstance(v, type):
        return {f.name: codificar(getattr(v, f.name)) for f in dataclasses.fields(v)}
    raise TypeError(f"tipo sem codificação: {type(v)!r}")


_capturas: list[list] = []  # linhas de PDF lidas durante a chamada gravada
_LIMITES = ("MAX_LINHAS_APOIO", "MAX_CELULAS_APOIO", "MAX_COLUNAS_APOIO", "MAX_FOLHAS_APOIO", "MAX_BYTES_EXPANDIDOS_APOIO")


def _registrar(nome, fn, args, kwargs, **extra):
    try:
        entrada = {"fn": nome, "args": codificar(list(args)), "kwargs": codificar(kwargs)}
    except TypeError:
        return
    if nome == "apoio.ler_razao_apoio":
        from src.domain.conciliacao_bancaria import apoio

        entrada["limites"] = {c: getattr(apoio, c) for c in _LIMITES}
    _capturas.append([])
    try:
        entrada["result"] = codificar(fn(*args, **kwargs))
    except TypeError as exc:
        if "codificação" in str(exc):
            _capturas.pop()
            return
        entrada["error"] = {"tipo": type(exc).__name__, "mensagem": str(exc)}
    except Exception as exc:  # noqa: BLE001 — o erro também é saída
        entrada["error"] = {"tipo": type(exc).__name__, "mensagem": str(exc)}
    capturadas = _capturas.pop()
    if capturadas:
        entrada["linhas_pdf"] = capturadas[0]
    entrada.update(extra)
    chave = json.dumps([entrada["fn"], entrada["args"], entrada["kwargs"], entrada.get("limites")], sort_keys=True, ensure_ascii=False)
    chamadas.setdefault(chave, entrada)


_originais: dict[str, object] = {}


def envolver(modulo, nome_fn, rotulo):
    original = getattr(modulo, nome_fn)
    if getattr(original, "__gabarito__", False):
        return

    @functools.wraps(original)
    def gravador(*args, **kwargs):
        resultado = original(*args, **kwargs)  # o teste segue com a chamada de verdade
        if rotulo == "apoio.ler_razao_apoio" and not _sem_falsos():
            return resultado
        # As funções de cabeçalho recebem a planilha inteira por dentro dos leitores: grava só as
        # chamadas pequenas (as diretas da suíte); as outras já estão no resultado do leitor.
        if rotulo in ("planilha.localizar_colunas", "planilha._extrair_cabecalho") and len(args[0]) > 12:
            return resultado
        _registrar(rotulo, original, sanitizar(list(args)), sanitizar(kwargs))
        return resultado

    gravador.__gabarito__ = True
    _originais[rotulo] = original
    setattr(modulo, nome_fn, gravador)


def _sem_falsos() -> bool:
    """O teste trocou `apoio.ler_razao` por um falso? Então a chamada não é do original."""
    from src.domain.conciliacao_bancaria import apoio, razao

    return apoio.ler_razao is razao.ler_razao or apoio.ler_razao is _originais.get("razao.ler_razao")


def pytest_configure(config):  # noqa: ARG001
    from src.domain.concilpro import parser, planilha

    for fn in ("extrair_numero_nf", "extrair_cnpj"):
        envolver(parser, fn, f"parser.{fn}")
    for fn in (
        "e_planilha", "localizar_colunas", "_decimal", "_inteiro_como_texto", "_extrair_cabecalho",
        "_nome_do_fornecedor", "parsear_planilha_razao", "parsear_xls_razao",
    ):
        envolver(planilha, fn, f"planilha.{fn}")

    from src.domain.conciliacao_bancaria import razao

    for fn in ("ler_razao", "_razao_das_linhas", "_conferir_total"):
        envolver(razao, fn, f"razao.{fn}")
    gravador = razao._razao_das_linhas

    @functools.wraps(gravador)
    def capturar(linhas):
        if _capturas:
            _capturas[-1].append(list(linhas))
        return gravador(linhas)

    capturar.__gabarito__ = True
    razao._razao_das_linhas = capturar

    from src.domain.conciliacao_bancaria import apoio

    for fn in ("ler_razao_apoio", "_valor", "_data", "_normalizar"):
        envolver(apoio, fn, f"apoio.{fn}")


# ─── Chamadas diretas ─────────────────────────────────────────────────────────


def chamadas_diretas():
    from src.domain.conciliacao_bancaria import apoio, razao
    from src.domain.concilpro import parser, planilha

    org = _originais
    for v in (
        "1.234,56", "1234,56", "1234.56", "1,234.56", "(1.234,56)", "R$ 1.234,56", "-1.234,56", "1.234",
        "1,5", "1,234", "1.234.567", "12,345,678.9", "1.234.567,891", " - ", "", "abc", "()", "(", "+-1",
        "١٢٣,٤٥", "1e5", "0,005", "0,015", "99999999999999999999999999999", "--5", "5-", "(5)", "((5))",
        1500, 0, -1088.77, 1e16, 1e30, 0.1 + 0.2, float("inf"), True, False, None,
        datetime(2025, 1, 2), Decimal("1.005"), 12345678901234567890123456789,
    ):
        _registrar("planilha._decimal", org["planilha._decimal"], [v], {})
    for v in (None, "", 11190.0, 11190.5, -0.0, 1e20, 7, True, False, "  0042 ", float("inf"), datetime(2025, 3, 4, 5, 6, 7)):
        _registrar("planilha._inteiro_como_texto", org["planilha._inteiro_como_texto"], [v], {})
    cabecalhos = [
        [("Data", "Lote", "Histórico", "Cta.C.Part.", "Débito", "Crédito", "Saldo-Exercício")],
        [("DATA", "NÚMERO", "DESCRIÇÃO", "CONTRAPARTIDA", "DÉBITO", "CRÉDITO", "SALDO")],
        [("Data", "Nº", "Historico", "c.part.", "Debito", "Debito", "Credito", " Saldo exercício ")],
        [(), ("x",), ("Data", "Débito"), ("Data", "Débito", "Crédito")],
        [("Data", 1, None, "Crédito", "  débito  ")],
        [("data", "no", "historico", "cta c part", "debito", "credito", "saldo-exercicio")],
    ]
    for linhas in cabecalhos:
        _registrar("planilha.localizar_colunas", org["planilha.localizar_colunas"], [linhas], {})
    _registrar("planilha.localizar_colunas", org["planilha.localizar_colunas"], [[("a",)] * 60 + [("Débito", "Crédito")]], {})
    preambulos = [
        [("Empresa:", None, "EMPRESA FICTICIA LTDA", None, "Folha:", 1), ("C.N.P.J.:", "12.345.678/0001-90"), ("Período:", "01/01/2025 - 31/01/2025")],
        [("Empresa:", "Folha: 1", "", "EMPRESA B"), ("C.N.P.J.: 12.345.678/0001-90",), ("Período: 01/02/2025-28/02/2025",), ("Período:", "01/03/2025 - 31/03/2025")],
        [("Empresa:",), ("Empresa:", "SEGUNDA"), ("CNPJ", "x"), ("C.N.P.J.", "sem numero"), ("C.N.P.J.", "1.2")],
        [("Período:", "31/02/2025 - 31/03/2025")],
        [("Período:", "32/01/2025 - 31/03/2025")],
        [("Período:", "01/01/0000 - 31/03/2025")],
        [("Período:", "29/02/2024 - 29/02/2025")],
        [("Período:", "00/01/2025 - 31/03/2025")],
        [("Período:", "01/13/2025 - 31/03/2025")],
        [None] * 0 + [("x",)] * 15 + [("Empresa:", "TARDE")],
        [(datetime(2025, 1, 1), "Empresa:"), (1, "C.N.P.J.:", 12.5)],
    ]
    for linhas in preambulos:
        _registrar("planilha._extrair_cabecalho", org["planilha._extrair_cabecalho"], [linhas], {})
    for linha in (
        ("Conta:", 1667, "2.1.3.01.0002", "", "", "FORNECEDOR ALFA LTDA"),
        ("Conta:", 1667, "2.1.3.01.0002"),
        ("Conta:", 1667, "2.1.3.01.0002", "123", "NOME", "1.2.3", 5),
        ("Conta:",),
        ("Conta:", 1, "NOME NA CLASSIFICACAO", "  "),
    ):
        _registrar("planilha._nome_do_fornecedor", org["planilha._nome_do_fornecedor"], [linha], {})
    for h in (
        "COMPRAS CONFORME NF. Nº 116722", "NF 123", "NF 1234", "REF REF NF 98765", "REF 4567", "CT-E 12345",
        "NOTA FISCAL 5555", "conforme nf 7777", "12345 - PAGAMENTO", "CONFORME NF NÚMERO 8888", "CONF. NFS 4321",
        "nf.n°1234", "SEM NUMERO", "PGTO 12.345.678/0001-90 ALFA", "nf 12 ref 3456", "",
    ):
        _registrar("parser.extrair_numero_nf", org["parser.extrair_numero_nf"], [h], {})
        _registrar("parser.extrair_cnpj", org["parser.extrair_cnpj"], [h], {})

    cab = ["Empresa: EXEMPLO LOGISTICA LTDA Folha: 0001", "C.N.P.J.: 12.345.678/0001-95", "Período: 01/01/2025 - 31/01/2025",
           "CONSOLIDADO", "RAZÃO", "Data LoteHistórico Cta.C.Part. Débito Crédito Saldo-Exercício"]
    casos_pdf = [
        cab + ["Conta: 2699 - 1.1.1.02.0015 BANCO FICTICIO C/C 1234", "SALDO ANTERIOR 1.000,00C",
               "02/01/2025 1 PIX RECEBIDO 2700 1.500,00 500,00D", "continua o historico",
               "03/01/2025 2 TARIFA 9,90 490,10D", "04/01/2025 3 TED 0,00 490,10D",
               "05/01/2025 4 SAQUE 1234567 490,10 0,00", "Total do mês: 1.500,00 500,00",
               "Total da conta: 1.500,00 500,00", "Conta: 1 - 1 DEPOIS DO TOTAL"],
        cab + ["Conta: 2699 - 1.1.1.02.0015 BANCO", "02/01/2025 1 X 1,00 1,00D", "Total da conta: 1,00 0,00"],
        cab + ["Conta: 2699 - 1.1.1.02.0015 BANCO", "Conta: 2700 - 1.1.1.02.0016 OUTRO", "Total da conta: 0,00 0,00"],
        cab + ["02/01/2025 1 X 1,00 1,00D"],
        cab + ["Conta: 2699 - 1.1.1.02.0015 BANCO", "02/01/2025 1 X 1,00 1,00D"],
        ["Período: 31/02/2025 - 31/03/2025"],
        ["Conta: 1 - 1 B", "31/02/2025 1 X 1,00 1,00D", "Total da conta: 1,00 0,00"],
        ["Empresa: Folha: 1", "Empresa:   ALFA   Folha: 2", "C.N.P.J.", "C.N.P.J.: 98.765.432/0001-10", "Periodo: 01/01/2025 - 31/01/2025",
         "Conta: 7 - 1.2 C", "SALDO ANTERIOR 0,00", "SALDO ANTERIOR 5,00D", "01/01/2025 9 A B C 12 1.234.567,89 1.234.567,89D",
         "Sistema licenciado", "_____", "linha solta", "Total da conta: 1.234.567,89 0,00"],
    ]
    for linhas in casos_pdf:
        _registrar("razao._razao_das_linhas", org["razao._razao_das_linhas"], [linhas], {})

    for v in (None, "", "120", "120,00", "R$ 1.234,56", "(50,00)", "+120", "-120", "12..00", "1.2.3", "erro", "0,00", "0",
              "00,001", "1.234", "1,234", "1,234.56", "1.234,5", " 7 ", "R$", "١٢٠", "0,001", "0.0", 120, 0, -1, 0.5, 1e30, 10**30,
              float("inf"), float("nan"), True, datetime(2025, 1, 1), time(1, 2), Decimal("5")):
        _registrar("apoio._valor", org["apoio._valor"], [v, "folha \"F\", linha 1"], {})
    for v in (datetime(2025, 4, 5, 10, 30), date(2025, 4, 5), "05/04/2025", " 05/04/2025 ", "31/04/2025", "5/4/2025",
              "05/04/25", 45000, None, "", "٠٥/٠٤/٢٠٢٥", "05/04/٢٠٢٥", "00/04/2025"):
        _registrar("apoio._data", org["apoio._data"], [v, "ctx"], {})
    for v in ("  Data  ", "HISTÓRICO", "Número do Documento", "Fornecedor/Cliente", "Total  da\tconta", None, 0, 0.0, False, 1,
              "ﬁ", "Ａ", datetime(2025, 1, 1), "Total do Mês", "Ǆ"):
        _registrar("apoio._normalizar", org["apoio._normalizar"], [v], {})


# ─── Planilhas inventadas ─────────────────────────────────────────────────────

CAB = ["Data", "Lote", "Histórico", "", "", "", "", "Cta.C.Part.", "Débito", "Crédito", "", "", "Saldo-Exercício"]
POS = {"data": 0, "lote": 1, "historico": 2, "cta": 7, "debito": 8, "credito": 9, "saldo": 12}


def _linha(**campos):
    linha = [None] * 13
    for k, v in campos.items():
        linha[POS[k]] = v
    return linha


def _preambulo(empresa="EMPRESA FICTICIA LTDA", cnpj="12.345.678/0001-90", periodo="01/01/2025 - 31/01/2025"):
    return [
        ["Empresa:", None, empresa, None, None, None, None, None, None, None, None, "Folha:", None, 1],
        ["C.N.P.J.:", None, cnpj],
        ["Período:", None, periodo],
        [],
        ["RAZÃO"],
        [],
    ]


def _xlsx(folhas, formatos=None):
    """folhas: [(titulo, linhas)]. formatos: {(folha, coord): number_format}."""
    import openpyxl

    wb = openpyxl.Workbook()
    for i, (titulo, linhas) in enumerate(folhas):
        ws = wb.active if i == 0 else wb.create_sheet()
        ws.title = titulo
        for linha in linhas:
            ws.append(list(linha))
    for (i, coord), fmt in (formatos or {}).items():
        wb.worksheets[i][coord].number_format = fmt
    b = io.BytesIO()
    wb.save(b)
    return b.getvalue()


def _xls(folhas, estilos=None):
    import xlwt

    wb = xlwt.Workbook()
    data = xlwt.easyxf(num_format_str="DD/MM/YYYY")
    for i, (titulo, linhas) in enumerate(folhas):
        ws = wb.add_sheet(titulo)
        for r, linha in enumerate(linhas):
            for c, v in enumerate(linha):
                if v is None or v == "":
                    continue
                estilo = (estilos or {}).get((i, r, c))
                if estilo:
                    ws.write(r, c, v, xlwt.easyxf(num_format_str=estilo))
                elif isinstance(v, (datetime, date)):
                    ws.write(r, c, v, data)
                else:
                    ws.write(r, c, v)
    b = io.BytesIO()
    wb.save(b)
    return b.getvalue()


def _alterar_zip(conteudo: bytes, troca) -> bytes:
    """Reescreve o zip passando cada membro por `troca(nome, dados)`."""
    saida = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(conteudo)) as entrada, zipfile.ZipFile(saida, "w", zipfile.ZIP_DEFLATED) as z:
        for info in entrada.infolist():
            z.writestr(info, troca(info.filename, entrada.read(info)))
    return saida.getvalue()


def _bloco_banco():
    return [
        ["Conta:", 2699, "1.1.1.02.0015", None, None, "BANCO FICTICIO C/C 12345"],
        _linha(historico="SALDO ANTERIOR", saldo=1000),
        _linha(data=datetime(2025, 1, 2, 10, 30), lote=20812, historico="PIX RECEBIDO ALFA REF NF 4567", cta=1740, debito=1500.5, saldo=2500.5),
        _linha(data=date(2025, 1, 3), lote=11190.0, historico="  TARIFA PACOTE  ", cta="609", credito="1.234,56", saldo=1265.94),
        _linha(data=datetime(2025, 1, 4), lote="94", historico="TED 12.345.678/0001-90 CONFORME NF NÚMERO 1234", cta=None, credito=265.94, saldo=1000),
        _linha(data=datetime(2025, 1, 5), lote=95, historico="SEM VALOR", debito=0, credito=""),
        _linha(data="06/01/2025", lote=96, historico="DATA EM TEXTO NAO ENTRA", debito=50),
        _linha(data=datetime(2025, 1, 7), lote=True, historico="ESTORNO", cta=1.5, debito="(10,00)", saldo=-0.0),
        ["", "", "", "", "Total do mês:", "", "", "", 1500.5, 1510.5],
        ["", "", "", "", "Total da conta:", "", "", "", 1500.5, 1510.5],
    ]


def planilhas_inventadas():
    from src.domain.conciliacao_bancaria import apoio, razao
    from src.domain.concilpro import planilha

    org = _originais
    casos: list[tuple[str, bytes]] = []

    banco = _preambulo() + [CAB] + _bloco_banco()
    casos.append(("banco.xlsx", _xlsx([("Razão", banco)])))
    casos.append(("banco.xls", _xls([("Razão", banco)])))
    # Total que não fecha, com milhares (a mensagem formata "1,490.50").
    errado = [list(x) for x in banco]
    errado[-1][9] = 123456.78
    casos.append(("total-errado.xlsx", _xlsx([("Razão", errado)])))
    # Sem "Total da conta": o total é a soma.
    casos.append(("sem-total.xlsx", _xlsx([("Razão", banco[:-1])])))
    # Duas contas, nenhuma conta, conta sem lançamento.
    casos.append(("duas-contas.xlsx", _xlsx([("Razão", banco + _bloco_banco())])))
    casos.append(("sem-conta.xlsx", _xlsx([("Razão", _preambulo() + [CAB] + _bloco_banco()[1:])])))
    casos.append(("sem-lancamento.xlsx", _xlsx([("Razão", _preambulo() + [CAB, ["Conta:", 1, "1.1", "", "", "CAIXA"], ["", "", "", "", "Total da conta:", "", "", "", 0, 0]])])))
    # Cabeçalho: sem Débito; rótulos alternativos e colunas em outra ordem.
    casos.append(("sem-debito.xlsx", _xlsx([("Razão", _preambulo() + [["Data", "Lote", "Histórico", "Crédito"]] + _bloco_banco())])))
    alt = ["Saldo", "Crédito", "Débito", "Contrapartida", "Descrição", "Número", "Data"]
    def inverter(linha):
        if not linha or linha[0] == "Conta:" or "Total da conta:" in linha:
            return linha
        return [linha[12], linha[9], linha[8], linha[7], linha[2], linha[1], linha[0]] if len(linha) >= 13 else linha
    casos.append(("rotulos.xlsx", _xlsx([("Razão", _preambulo() + [alt] + [inverter(l) for l in _bloco_banco()[:-2]] + [[None, 1510.5, 1500.5, None, "Total da conta:"]])])))
    # Períodos inválidos.
    for nome, periodo in (("dia.xlsx", "31/02/2025 - 31/03/2025"), ("formato.xlsx", "32/01/2025 - 31/03/2025"), ("ano0.xlsx", "01/01/0000 - 31/03/2025")):
        casos.append((nome, _xlsx([("Razão", _preambulo(periodo=periodo) + [CAB] + _bloco_banco())])))
    # .xls: data serial 0 e negativa com formato de data (ficam número), bool e texto numérico.
    xls_estranho = _preambulo() + [CAB, ["Conta:", 2699.0, "1.1.1.02.0015", None, None, "BANCO"],
        _linha(data=0, lote=1, historico="ZERO", debito=1),
        _linha(data=-5, lote=2, historico="NEGATIVA", debito=2),
        _linha(data=45000.75, lote=False, historico="COM HORA", debito="3,00", saldo="-3,00"),
        _linha(data=datetime(2025, 1, 2), lote=4.0, historico="OK", cta=12.0, credito=4.25, saldo=-1.25),
        ["", "", "", "", "Total da conta:", "", "", "", 3, 4.25]]
    estilos = {(0, 8, 0): "DD/MM/YYYY", (0, 9, 0): "DD/MM/YYYY", (0, 10, 0): "DD/MM/YYYY HH:MM"}
    casos.append(("estranho.xls", _xls([("Razão", xls_estranho)], estilos)))
    # Formatos que não são planilha.
    casos.append(("lixo-pk.xlsx", b"PK\x03\x04 isto nao e zip"))
    zip_comum = io.BytesIO()
    with zipfile.ZipFile(zip_comum, "w") as z:
        z.writestr("leiame.txt", "nao sou planilha")
    casos.append(("zip-comum.xlsx", zip_comum.getvalue()))
    casos.append(("lixo-ole.xls", b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 600))
    casos.append(("texto.txt", b"qualquer texto"))
    casos.append(("vazio.bin", b""))
    casos.append(("xls-como-pk.xls", b"PK" + _xls([("Razão", banco)])[2:]))
    # Só a primeira folha conta; folha vazia; cabeçalho depois da linha 60.
    casos.append(("duas-folhas.xls", _xls([("Razão", banco), ("Outra", banco + _bloco_banco())])))
    casos.append(("duas-folhas.xlsx", _xlsx([("Razão", banco), ("Outra", banco + _bloco_banco())])))
    casos.append(("primeira-vazia.xlsx", _xlsx([("Vazia", []), ("Razão", banco)])))
    casos.append(("cabecalho-tarde.xlsx", _xlsx([("Razão", [["linha"]] * 60 + [CAB] + _bloco_banco())])))
    # Dimensão declarada menor que os dados: o openpyxl sem `reset_dimensions` corta.
    for nome, ref in (("dim-menor.xlsx", b"A1:M12"), ("dim-estreita.xlsx", b"A1:J30"), ("dim-so-linhas.xlsx", b"1:13")):
        casos.append((nome, _alterar_zip(_xlsx([("Razão", banco)]), lambda n, d, ref=ref: re.sub(rb'<dimension ref="[^"]*"', b'<dimension ref="' + ref + b'"', d) if n.startswith("xl/worksheets/") else d)))

    for nome, conteudo in casos:
        _registrar("razao.ler_razao", org["razao.ler_razao"], [conteudo, nome], {})
        _registrar("apoio.ler_razao_apoio", org["apoio.ler_razao_apoio"], [conteudo, nome], {})
        _registrar("planilha.e_planilha", org["planilha.e_planilha"], [conteudo], {})
        if conteudo[:2] == b"PK":
            _registrar("planilha.parsear_planilha_razao", org["planilha.parsear_planilha_razao"], [conteudo], {})
        elif conteudo[:4] == b"\xd0\xcf\x11\xe0":
            _registrar("planilha.parsear_xls_razao", org["planilha.parsear_xls_razao"], [conteudo], {})

    # ── Apoio: várias contas e folhas, colunas opcionais, recusas ──
    cab_apoio = ["Data", "Lote", "Histórico", "Contrapartida", "Débito", "Crédito", "Saldo", "Nota Fiscal", "Fornecedor/Cliente"]
    pre = [["Empresa:", "EMPRESA FICTICIA LTDA"], ["C.N.P.J.:", "12.345.678/0001-90"], ["Período:", "01/04/2025 - 30/04/2025"]]
    fgts = [
        ["Conta:", 700, "2.1.2.03.0001", "FGTS A RECOLHER"],
        ["SALDO ANTERIOR", None, None, None, None, None, -10],
        [datetime(2025, 4, 5), 101, "PROVISÃO FGTS", 800, None, "R$ 1.234,56", -1244.56, 45.0, None],
        ["05/04/2025", 102.0, "PAGAMENTO FGTS", "900", "+1.234,56", 0, -10, "  00046 ", "CAIXA"],
        [None, None, "Total do mês:", None, 1234.56, 1234.56],
        cab_apoio,
        ["Conta:", 700, "2.1.2.03.0001", "FGTS A RECOLHER"],
        [date(2025, 4, 9), "103", "  AJUSTE  ", None, "0,50", None, None, 47, 3.5],
        [None, None, "Total da conta:", None, "1.235,06", "1234,56"],
        ["Conta:", 701, "2.1.2.03.0002", "", "INSS A RECOLHER"],
        [datetime(2025, 4, 7), 103, "PROVISÃO INSS", 800, 0, 250, -250, None, None],
        [None, None, "total da conta", None, 0, "250"],
    ]
    casos_apoio: list[tuple[str, bytes]] = []
    casos_apoio.append(("apoio.xlsx", _xlsx([("Impostos", pre + [cab_apoio] + fgts), ("Vazia", []), ("Outra", pre + [cab_apoio] + [
        ["Conta:", 702, "2.1.2.03.0003", "IRRF A RECOLHER"],
        [datetime(2025, 4, 10), 1, "RETENÇÃO", 800, None, 15],
        [None, None, "Total da conta:", None, 0, 15],
    ])])))
    casos_apoio.append(("apoio.xls", _xls([("Impostos", pre + [cab_apoio] + fgts), ("Outra", pre + [cab_apoio] + [
        ["Conta:", 702, "2.1.2.03.0003", "IRRF A RECOLHER"],
        [datetime(2025, 4, 10), 1, "RETENÇÃO", 800, None, 15],
        [None, None, "Total da conta:", None, 0, 15],
    ])])))

    def variar(trocas):
        linhas = [list(x) for x in fgts]
        for (i, j), v in trocas.items():
            while len(linhas[i]) <= j:
                linhas[i].append(None)
            linhas[i][j] = v
        return linhas

    for nome, linhas in (
        ("parenteses.xlsx", variar({(2, 5): "(1.234,56)"})),
        ("bool.xlsx", variar({(2, 5): True})),
        ("data-no-valor.xlsx", variar({(2, 5): datetime(2025, 1, 1)})),
        ("enorme.xlsx", variar({(2, 5): 1e30})),
        ("zero-texto.xlsx", variar({(2, 5): "0,001"})),
        ("data-invalida.xlsx", variar({(3, 0): "31/04/2025"})),
        ("sem-data.xlsx", variar({(3, 0): None})),
        ("sem-descricao.xlsx", variar({(0, 3): None})),
        ("sem-valores-total.xlsx", variar({(8, 4): ""})),
        ("conta-nao-fecha.xlsx", variar({(8, 4): 999})),
    ):
        casos_apoio.append((nome, _xlsx([("F", pre + [cab_apoio] + linhas)])))
    casos_apoio.append(("total-sem-bloco.xlsx", _xlsx([("F", pre + [cab_apoio, [None, None, "Total da conta:", None, 0, 0]] + fgts)])))
    casos_apoio.append(("lancamento-sem-conta.xlsx", _xlsx([("F", pre + [cab_apoio, [datetime(2025, 4, 1), 1, "X", None, 1, 0]] + fgts)])))
    casos_apoio.append(("fora-do-bloco.xlsx", _xlsx([("F", pre + [cab_apoio] + fgts + [[datetime(2025, 4, 30), 9, "DEPOIS", None, 1, 0]])])))
    casos_apoio.append(("sem-total-final.xlsx", _xlsx([("F", pre + [cab_apoio] + fgts[:-1])])))
    casos_apoio.append(("outra-conta-aberta.xlsx", _xlsx([("F", pre + [cab_apoio] + fgts[:8] + fgts[9:])])))
    casos_apoio.append(("sem-colunas.xlsx", _xlsx([("F", pre + [["Lote", "Histórico", "Débito", "Crédito"]] + fgts)])))
    casos_apoio.append(("folha-sem-conta.xlsx", _xlsx([("F", pre + [cab_apoio, [None, None, "nada"]])])))
    casos_apoio.append(("periodo-invalido.xlsx", _xlsx([("F", [pre[0], pre[1], ["Período:", "31/04/2025 - 30/04/2025"], cab_apoio] + fgts)])))
    outra_empresa = [["Empresa:", "OUTRA EMPRESA"], pre[1], pre[2]]
    casos_apoio.append(("duas-empresas.xlsx", _xlsx([("A", pre + [cab_apoio] + fgts), ("B", outra_empresa + [cab_apoio] + fgts)])))
    sem_preambulo = _xlsx([("A", pre + [cab_apoio] + fgts), ("B", [cab_apoio] + fgts)])
    casos_apoio.append(("bloco-repetido.xlsx", sem_preambulo))
    outro_periodo = [pre[0], pre[1], ["Período:", "01/05/2025 - 31/05/2025"]]
    casos_apoio.append(("dois-periodos.xls", _xls([("A", pre + [cab_apoio] + fgts), ("B", outro_periodo + [cab_apoio] + fgts)])))

    # XML mexido: sem dimensão, linhas e células sem "r", coordenada minúscula, dimensão inválida.
    base = _xlsx([("F", pre + [cab_apoio] + fgts)])

    def sem_r(nome, dados):
        if nome != "xl/worksheets/sheet1.xml":
            return dados
        texto = dados.decode()
        texto = re.sub(r"<dimension[^>]*/>", "", texto)
        texto = re.sub(r' r="[A-Z]+\d+"', "", texto)
        texto = re.sub(r'<row r="\d+"', "<row", texto)
        return texto.encode()

    casos_apoio.append(("sem-r.xlsx", _alterar_zip(base, sem_r)))
    # Sem "r" e sem buraco nas linhas (célula vazia escrita como texto vazio): lê inteiro.
    cheias = [[("" if v is None else v) for v in linha] + [""] * (9 - len(linha)) for linha in pre + [cab_apoio] + fgts]
    casos_apoio.append(("sem-r-cheia.xlsx", _alterar_zip(_xlsx([("F", cheias)]), sem_r)))
    casos_apoio.append(("dim-menor-apoio.xlsx", _alterar_zip(base, lambda n, d: re.sub(rb'<dimension ref="[^"]*"', b'<dimension ref="A1:C3"', d) if n.startswith("xl/worksheets/") else d)))
    for nome, de, para in (
        ("dimensao-a1.xlsx", rb'<dimension ref="[^"]*"', b'<dimension ref="A1"'),
        ("dimensao-colunas.xlsx", rb'<dimension ref="[^"]*"', b'<dimension ref="A:ZZ"'),
        ("dimensao-linhas.xlsx", rb'<dimension ref="[^"]*"', b'<dimension ref="1:30000"'),
        ("dimensao-invalida.xlsx", rb'<dimension ref="[^"]*"', b'<dimension ref="A1:C"'),
        ("dimensao-sem-ref.xlsx", rb'<dimension ref="[^"]*"', b"<dimension"),
        ("minuscula.xlsx", rb' r="C5"', b' r="c5"'),
        ("linha-salta.xlsx", rb'<row r="20"', b'<row r="25000"'),
    ):
        casos_apoio.append((nome, _alterar_zip(base, lambda n, d, de=de, para=para: re.sub(de, para, d) if n == "xl/worksheets/sheet1.xml" else d)))

    for nome, conteudo in casos_apoio:
        _registrar("apoio.ler_razao_apoio", org["apoio.ler_razao_apoio"], [conteudo, nome], {})
        _registrar("razao.ler_razao", org["razao.ler_razao"], [conteudo, nome], {})

    # Limites menores, como a suíte faz com monkeypatch.
    for constante, valor in (("MAX_LINHAS_APOIO", 30), ("MAX_LINHAS_APOIO", 45), ("MAX_CELULAS_APOIO", 200),
                             ("MAX_COLUNAS_APOIO", 8), ("MAX_FOLHAS_APOIO", 2), ("MAX_BYTES_EXPANDIDOS_APOIO", 4000)):
        anterior = getattr(apoio, constante)
        setattr(apoio, constante, valor)
        try:
            for nome, conteudo in casos_apoio[:2] + [c for c in casos_apoio if c[0] in ("sem-r.xlsx", "dois-periodos.xls", "duas-empresas.xlsx")]:
                _registrar("apoio.ler_razao_apoio", org["apoio.ler_razao_apoio"], [conteudo, nome], {})
        finally:
            setattr(apoio, constante, anterior)
    return razao, planilha


# ─── PDFs inventados ──────────────────────────────────────────────────────────


def _pdf(paginas: list[list[str]]) -> bytes:
    import pymupdf

    doc = pymupdf.open()
    for linhas in paginas:
        p = doc.new_page(width=595, height=842)
        for i, linha in enumerate(linhas):
            p.insert_text((30, 40 + i * 12), linha, fontname="helv", fontsize=8)
    b = doc.tobytes(garbage=3, deflate=True)
    doc.close()
    return b


def pdfs_inventados():
    org = _originais
    cab = ["Empresa: EMPRESA FICTICIA LTDA Folha: 0001", "C.N.P.J.: 12.345.678/0001-90", "Período: 01/01/2025 - 28/02/2025",
           "CONSOLIDADO", "RAZÃO", "Data Lote Histórico Cta.C.Part. Débito Crédito Saldo-Exercício",
           "Conta: 2700 - 1.1.1.03.0016 APLICAÇÃO - BANCO FICTICIO"]
    pagina1 = cab + [
        "SALDO ANTERIOR 1.000,00D",
        "02/01/2025 3001 APLIC AUT MAIS 2699 1.000,00 2.000,00D",
        "03/01/2025 3002 RESGATE DE APLICAÇÃO AUTOMÁTICA 2699 1.999,41 0,59D",
        "03/01/2025 3003 VALOR REF IRRF DE APLICAÇÃO 1352 0,59 0,00",
        "10/01/2025 3004 PAGAMENTO FORNECEDOR 500,00 500,00C",
        "EMPRESA BETA SERVICOS LTDA",
        "REF NF 12345",
        "Total do mês: 1.000,00 2.500,00",
        "Sistema licenciado para CONTABILIDADE FICTICIA LTDA",
    ]
    pagina2 = ["Empresa: EMPRESA FICTICIA LTDA Folha: 0002", "Conta: 2700 - 1.1.1.03.0016 APLICAÇÃO - BANCO FICTICIO",
               "03/02/2025 3005 TED RECEBIDA 2699 1.500,00 1.000,00D", "Total do mês: 1.500,00 0,00",
               "Total da conta: 2.500,00 2.500,00", "_______________________________", "FULANO DE TAL SOCIO", "CPF: 000.000.000-00"]
    pdfs = [
        ("razao.pdf", _pdf([pagina1, pagina2])),
        ("total-errado.pdf", _pdf([pagina1, pagina2[:4] + ["Total da conta: 2.500,00 2.400,00"]])),
        ("sem-total.pdf", _pdf([pagina1, pagina2[:4]])),
        ("duas-contas.pdf", _pdf([pagina1, ["Conta: 2701 - 1.1.1.03.0017 OUTRA"] + pagina2[2:]])),
        ("sem-conta.pdf", _pdf([[l for l in pagina1 if not l.startswith("Conta:")], [l for l in pagina2 if not l.startswith("Conta:")]])),
        ("sem-lancamento.pdf", _pdf([cab + ["SALDO ANTERIOR 0,00", "Total da conta: 0,00 0,00"]])),
        ("periodo-invalido.pdf", _pdf([[l.replace("01/01/2025", "31/02/2025") for l in pagina1], pagina2])),
    ]
    for nome, conteudo in pdfs:
        _registrar("razao.ler_razao", org["razao.ler_razao"], [conteudo, nome], {}, pdf_real=True)
        _registrar("apoio.ler_razao_apoio", org["apoio.ler_razao_apoio"], [conteudo, nome], {}, pdf_real=True)
    quebrado = b"%PDF-1.4\n isto nao e um pdf de verdade"
    _registrar("razao.ler_razao", org["razao.ler_razao"], [quebrado, "quebrado.pdf"], {}, pdf_real=True, abre_pdf_falhou=True)


def pytest_unconfigure(config):  # noqa: ARG001
    saida = os.environ.get("GABARITO_SAIDA")
    if not saida:
        return
    chamadas_diretas()
    planilhas_inventadas()
    pdfs_inventados()
    registros = sorted(chamadas.values(), key=lambda r: (r["fn"], json.dumps(r["args"], ensure_ascii=False), json.dumps(r.get("limites"))))
    usados = set(re.findall(r'"\$arquivo": "([0-9a-f]{12})"', json.dumps(registros)))
    pasta = Path(saida)
    pasta.mkdir(parents=True, exist_ok=True)
    with open(pasta / "razao-chamadas.json", "w", encoding="utf-8", newline="\n") as f:
        json.dump(registros, f, ensure_ascii=False, indent=0)
    with open(pasta / "razao-arquivos.json", "w", encoding="utf-8", newline="\n") as f:
        json.dump({k: arquivos[k] for k in sorted(usados)}, f, indent=0)
    por_fn: dict[str, int] = {}
    for r in registros:
        por_fn[r["fn"]] = por_fn.get(r["fn"], 0) + 1
    print(f"\ngabarito: {len(registros)} chamadas em {len(por_fn)} funções, {len(usados)} arquivos -> {pasta}")
    for fn, n in sorted(por_fn.items()):
        print(f"  {fn}: {n}")
