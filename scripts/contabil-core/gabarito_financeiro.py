"""Gabarito dos documentos do financeiro e das sugestões de conferência, Bloco B, Fase B4 (12/11/2026).

Plugin do pytest: roda a suíte do original (dev41tech/contabil-core) que exercita a conferência do
financeiro e grava cada chamada de `ler_financeiro`, `validar_conteudo`, `ler_omie`,
`ler_folha_titulos` e `sugerir`, com a entrada e a saída exatas. Depois acrescenta documentos
INVENTADOS — planilhas de pagamentos/recebimentos e de títulos (openpyxl e xlwt), PDFs de saldo
conciliado e do Omie (PyMuPDF) — com cada layout e cada recusa, sugestões sorteadas com semente fixa
para cada ramo, e chamadas diretas a `identidade`, `normalizar`, `_valor`, `_texto`, `_data_planilha`
e `_normalizar`. Também grava as palavras e o texto que o PyMuPDF tira de cada PDF, para o porte do
MuPDF (`pdf/mupdf.ts`). O porte em TypeScript repete as chamadas
(`src/lib/contabil-core/conciliacao/{financeiroDocumentos,sugestoesFinanceiro}.test.ts`,
`src/lib/contabil-core/pdf/mupdf.test.ts`).

Constantes que os testes do original trocam (`MAX_*`, `time.monotonic`, `MAX_COMPARACOES`) vão
junto da chamada, em `kwargs["$opcoes"]`.

Dados: os testes do original e os documentos daqui são inventados. Os CNPJs que não são de exemplo
são trocados por fictícios (começando com 9), também dentro do XML das planilhas, e os nomes da
variável GABARITO_NOMES ("REAL=FICTICIO;..."), fora do git, também; a chamada é REPETIDA com a
entrada trocada, e o gabarito guarda a saída dela.

Uso, a partir da raiz do contabil-core (com pdfplumber, PyMuPDF, openpyxl, xlrd, xlwt e pytest):
    PYTHONPATH=<connect>/scripts/contabil-core GABARITO_PASTA=<connect>/src/lib/contabil-core/conciliacao/gabarito \\
        python -W ignore -m pytest -q -p gabarito_financeiro tests/unit/test_financeiro_documentos.py \\
        tests/unit/test_financeiro_omie.py tests/unit/test_financeiro_titulos.py \\
        tests/unit/test_sugestoes_financeiro.py tests/integration/test_conciliacao_financeiro.py

Conferência local em arquivos reais (a saída fica FORA do repositório):
    python -W ignore <connect>/scripts/contabil-core/gabarito_financeiro.py conferir <saida.json> <arquivo>...
"""
from __future__ import annotations

import dataclasses
import functools
import hashlib
import io
import json
import os
import random
import re
import sys
import time
import types
import zipfile
from datetime import date, datetime, time as hora, timedelta
from decimal import Decimal

os.environ.setdefault("SECRET_KEY", "gabarito-local-sem-segredo-0123456789abcdef")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://gabarito:gabarito@127.0.0.1:1/gabarito")

chamadas: dict[str, dict] = {}
conteudos: dict[str, bytes] = {}
nomes_de_arquivo: dict[str, str] = {}
_MONOTONIC = time.monotonic
_GRAVANDO = [False]

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


_NOMES = dict(par.split("=", 1) for par in os.environ.get("GABARITO_NOMES", "").split(";") if "=" in par)


def sanitizar(v):
    if isinstance(v, str):
        for real, ficticio in _NOMES.items():
            v = v.replace(real, ficticio)
        return _CNPJ.sub(_troca_cnpj, v)
    if isinstance(v, bytes):
        return sanitizar_bytes(v)
    if isinstance(v, list):
        return [sanitizar(x) for x in v]
    if isinstance(v, tuple):
        return tuple(sanitizar(x) for x in v)
    if isinstance(v, dict):
        return {k: sanitizar(x) for k, x in v.items()}
    return v


def sanitizar_bytes(conteudo: bytes) -> bytes:
    """Dentro do .xlsx, o XML passa pela mesma troca; nos outros formatos, só confere."""
    if conteudo[:2] == b"PK":
        try:
            with zipfile.ZipFile(io.BytesIO(conteudo)) as z:
                itens = [(i, z.read(i.filename)) for i in z.infolist()]
        except Exception:  # noqa: BLE001 — zip quebrado é caso de teste
            return conteudo
        novos, mudou = [], False
        for info, dados in itens:
            if info.filename.endswith(".xml"):
                texto = dados.decode("utf-8", "replace")
                trocado = sanitizar(texto)
                if trocado != texto:
                    dados, mudou = trocado.encode("utf-8"), True
            novos.append((info, dados))
        if not mudou:
            return conteudo
        saida = io.BytesIO()
        with zipfile.ZipFile(saida, "w") as z:
            for info, dados in novos:
                z.writestr(info, dados)
        return saida.getvalue()
    for real in _NOMES:
        for codificacao in ("utf-8", "latin-1", "utf-16-le"):
            try:
                alvo = real.encode(codificacao)
            except UnicodeEncodeError:
                continue
            if alvo in conteudo:
                raise RuntimeError("nome a trocar dentro de um arquivo binário; gere um equivalente inventado")
    return conteudo


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
    if isinstance(v, hora):
        return {"$time": str(v)}
    if isinstance(v, timedelta):
        return {"$td": str(v)}
    if isinstance(v, date):
        return {"$date": v.isoformat()}
    if isinstance(v, bytes):
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


def _relogio(sequencia):
    valores = iter(sequencia)
    ultimo = [sequencia[-1]]

    def monotonic():
        try:
            ultimo[0] = next(valores)
        except StopIteration:
            pass
        return ultimo[0]

    return monotonic


def _registrar(nome, fn, args, kwargs=None, opcoes=None, rotulo_args=None):
    kwargs = kwargs or {}
    entrada = {"fn": nome, "args": codificar(list(rotulo_args if rotulo_args is not None else args)), "kwargs": codificar(kwargs)}
    if opcoes:
        entrada["kwargs"]["$opcoes"] = opcoes
    relogio = (opcoes or {}).get("relogio")
    original_mono = time.monotonic
    if relogio:
        time.monotonic = _relogio(relogio)
    _GRAVANDO[0] = True
    try:
        entrada["result"] = codificar(fn(*args, **kwargs))
    except Exception as exc:  # noqa: BLE001 — o erro também é saída
        entrada["error"] = {"tipo": type(exc).__name__, "mensagem": str(exc)}
    finally:
        _GRAVANDO[0] = False
        time.monotonic = original_mono
    chave = json.dumps([entrada["fn"], entrada["args"], entrada["kwargs"]], sort_keys=True, ensure_ascii=False)
    chamadas.setdefault(chave, entrada)


def _modulos():
    sys.path.insert(0, os.getcwd())
    from src.domain.conciliacao_bancaria import apoio
    from src.domain.conciliacao_bancaria import financeiro_documentos as doc
    from src.domain.conciliacao_bancaria import financeiro_omie as omie
    from src.domain.conciliacao_bancaria import financeiro_titulos as tit
    from src.domain.conciliacao_bancaria import sugestoes_financeiro as sug

    return doc, omie, tit, sug, apoio


_PADRAO_FIN = {"bytes": 25 * 1024 * 1024, "paginas": 100, "caracteresPagina": 150_000, "linhas": 20_000}
_PADRAO_APOIO = {"linhas": 20_000, "celulas": 500_000, "colunas": 128, "folhas": 32, "bytesExpandidos": 64 * 1024 * 1024}


def _opcoes_leitor():
    doc, _, _, _, apoio = _modulos()
    atual = {
        "bytes": doc.MAX_BYTES_FINANCEIRO,
        "paginas": doc.MAX_PAGINAS_FINANCEIRO,
        "caracteresPagina": doc.MAX_CARACTERES_PAGINA,
        "linhas": doc.MAX_LINHAS_FINANCEIRO,
    }
    atual_apoio = {
        "linhas": apoio.MAX_LINHAS_APOIO,
        "celulas": apoio.MAX_CELULAS_APOIO,
        "colunas": apoio.MAX_COLUNAS_APOIO,
        "folhas": apoio.MAX_FOLHAS_APOIO,
        "bytesExpandidos": apoio.MAX_BYTES_EXPANDIDOS_APOIO,
    }
    opcoes = {}
    limites = {k: v for k, v in atual.items() if v != _PADRAO_FIN[k]}
    if limites:
        opcoes["limites"] = limites
    limites_apoio = {k: v for k, v in atual_apoio.items() if v != _PADRAO_APOIO[k]}
    if limites_apoio:
        opcoes["limitesApoio"] = limites_apoio
    if time.monotonic is not _MONOTONIC:
        # O único teste que troca o relógio devolve 0 e depois 31 (`test_pdf_tempo_limite`).
        opcoes["relogio"] = [0, 31]
    return opcoes


def _vinculo(v):
    return {
        "estado": v.estado,
        "tipo_comparacao": v.tipo_comparacao,
        "financeiro_ids": [str(x) for x in v.financeiro_ids],
        "comparacao_ids": [str(x) for x in v.comparacao_ids],
    }


def _como_vinculos(lista):
    return [types.SimpleNamespace(**v) for v in lista]


def envolver(modulo, nome_fn, gravar):
    original = getattr(modulo, nome_fn)
    if getattr(original, "__gabarito__", False):
        return

    @functools.wraps(original)
    def gravador(*args, **kwargs):
        try:
            return original(*args, **kwargs)
        finally:
            if not _GRAVANDO[0]:
                gravar(original, args, kwargs)

    gravador.__gabarito__ = True
    gravador.__wrapped__ = original
    setattr(modulo, nome_fn, gravador)


def _gravar_documento(rotulo):
    def gravar(original, args, kwargs):
        conteudo, nome = args[0], args[1]
        _registrar(rotulo, original, [sanitizar(conteudo), sanitizar(nome)], opcoes=_opcoes_leitor())

    return gravar


def _gravar_omie(original, args, kwargs):  # noqa: ARG001
    conteudo = sanitizar(args[0])
    _registrar("omie.ler_omie", lambda c: original(c, time.monotonic()), [conteudo])


def _gravar_titulos(original, args, kwargs):  # noqa: ARG001
    folha, linhas = sanitizar(args[0]), sanitizar([list(l) for l in args[1]])
    _registrar("titulos.ler_folha_titulos", lambda f, ls: original(f, [tuple(l) for l in ls]), [folha, linhas])


def _gravar_sugerir(original, args, kwargs):  # noqa: ARG001
    _, _, _, sug, _ = _modulos()
    linhas, vinculos, tipo, versao, inicio, fim = args
    linhas = sanitizar([dict(l) for l in linhas])
    vinculos = sanitizar([_vinculo(v) for v in vinculos])
    opcoes = {}
    if sug.MAX_COMPARACOES != 20_000_000:
        opcoes["maxComparacoes"] = sug.MAX_COMPARACOES
    _registrar(
        "sugestoes.sugerir",
        lambda ls, vs, *resto: original(ls, _como_vinculos(vs), *resto),
        [linhas, vinculos, tipo, versao, inicio, fim],
        opcoes=opcoes or None,
    )


def pytest_configure(config):  # noqa: ARG001
    doc, omie, tit, sug, _ = _modulos()
    envolver(doc, "ler_financeiro", _gravar_documento("documentos.ler_financeiro"))
    envolver(doc, "validar_conteudo", _gravar_documento("documentos.validar_conteudo"))
    envolver(omie, "ler_omie", _gravar_omie)
    envolver(tit, "ler_folha_titulos", _gravar_titulos)
    envolver(sug, "sugerir", _gravar_sugerir)


# ─── Planilhas inventadas ───────────────────────────────────────────────────

def xlsx(folhas, titulos=None, formatos=None):
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


CAB_PAG = ["Nota Fiscal", "Pagamento", "Valor Pago", "Categoria", "Fornecedor (Razão Social)", "Fornecedor (CNPJ/CPF)"]
CAB_REC = ["Nota Fiscal", "Recebimento", "Valor Recebido", "Categoria", "Cliente (Razão Social)", "Cliente (CNPJ/CPF)"]


def financeiro(movimentos, *, cab=CAB_PAG, total=None, antes=(), deslocar=0, depois=()):
    pre = [None] * deslocar
    if total is None:
        total = float(sum(Decimal(str(m[2])) for m in movimentos if len(m) > 2 and isinstance(m[2], (int, float)) and not isinstance(m[2], bool)))
    linhas = [list(a) for a in antes]
    if total != "sem":
        linhas.append(pre + [None, None, total])
    linhas.append(pre + list(cab))
    linhas += [pre + list(m) for m in movimentos]
    linhas += [list(d) for d in depois]
    return linhas


D = datetime(2026, 9, 2)
MOVS = [
    ["00012", D, 10, "Insumos", "FICTÍCIO A", "123.456.789-00"],
    [None, datetime(2026, 9, 3), 20.5, "Impostos", "FICTÍCIO B", "98.765.432/0001-10"],
    [123, "04/09/2026", "1.234,56", "Serviços", None, None],
    [12.0, " 5/9/2026 ", "R$ 99,44", None, "FICTÍCIO C", 12345678901],
]


def casos_planilhas():
    for nome, cab in (("pagamentos", CAB_PAG), ("recebimentos", CAB_REC)):
        yield f"{nome}.xlsx", xlsx([financeiro(MOVS, cab=cab, total=1364.5)])
        yield f"{nome}.xls", xls([financeiro(MOVS, cab=cab, total=1364.5)])
    base = [["1", D, 10, "Cat", "ALFA", None], ["2", D, 20, "Cat", "BETA", None]]
    yield "total-texto.xlsx", xlsx([financeiro(base, total="R$ 30,00")])
    yield "total-texto-br.xls", xls([financeiro(base, total="30,00")])
    yield "total-ruido.xlsx", xlsx([financeiro(base, total=30.000000000005)])
    yield "total-um-centavo.xlsx", xlsx([financeiro(base, total=30.01)])
    yield "total-dois-centavos.xlsx", xlsx([financeiro(base, total=30.02)])
    yield "total-errado.xls", xls([financeiro(base, total=31)])
    yield "sem-total.xlsx", xlsx([financeiro(base, total="sem")])
    yield "dois-totais.xlsx", xlsx([financeiro(base, antes=[[None, None, 5]])])
    yield "total-invalido.xlsx", xlsx([financeiro(base, total="trinta")])
    yield "total-negativo.xlsx", xlsx([financeiro(base, total=-30)])
    yield "total-zero.xlsx", xlsx([financeiro([], total=0)])
    yield "sem-movimentos.xlsx", xlsx([financeiro([], total=10)])
    yield "cabecalho-linha-20.xlsx", xlsx([financeiro(base, antes=[["Relatório"]] * 18)])
    yield "cabecalho-linha-21.xlsx", xlsx([financeiro(base, antes=[["Relatório"]] * 19)])
    yield "cabecalho-deslocado.xls", xls([financeiro(base, deslocar=3, total=None)])
    yield "cabecalho-acentos.xlsx", xlsx([financeiro(base, cab=["  NOTA   fiscal ", "PAGAMENTO", "Valor  Pago", "CATEGORIA", "Fornecedor (RAZÃO SOCIAL)", "fornecedor (cnpj/cpf)"])])
    yield "cabecalho-repetido.xlsx", xlsx([financeiro(base, cab=CAB_PAG + ["Categoria"])])
    yield "cabecalho-misto.xlsx", xlsx([financeiro(base, cab=["Nota Fiscal", "Pagamento", "Valor Recebido", "Categoria", "Fornecedor (Razão Social)", "Cliente (CNPJ/CPF)"])])
    erros = {
        "data-vazia": [None, None, 10, "Cat", "ALFA", None],
        "data-mes-ano": [None, "09/2026", 10, "Cat", "ALFA", None],
        "data-invalida": [None, "31/09/2026", 10, "Cat", "ALFA", None],
        "data-iso": [None, "2026-09-02", 10, "Cat", "ALFA", None],
        "data-numero": [None, 46000, 10, "Cat", "ALFA", None],
        "valor-vazio": [None, D, None, "Cat", "ALFA", None],
        "valor-bool": [None, D, True, "Cat", "ALFA", None],
        "valor-negativo": [None, D, -10, "Cat", "ALFA", None],
        "valor-texto-negativo": [None, D, "-10,00", "Cat", "ALFA", None],
        "valor-zero": [None, D, 0, "Cat", "ALFA", None],
        "valor-zero-texto": [None, D, "0,00", "Cat", "ALFA", None],
        "valor-fracao": [None, D, 10.001, "Cat", "ALFA", None],
        "valor-ponto": [None, D, "10.00", "Cat", "ALFA", None],
        "valor-gigante": [None, D, 10_000_000_000_000, "Cat", "ALFA", None],
        "valor-limite": [None, D, 9999999999999.99, "Cat", "ALFA", None],
        "valor-1e27": [None, D, 1e27, "Cat", "ALFA", None],
        "valor-data": [None, D, D, "Cat", "ALFA", None],
        "valor-espacos": [None, D, " R$ 1 234,56 ", "Cat", "ALFA", None],
        "valor-milhar": [None, D, "1.234.567,89", "Cat", "ALFA", None],
        "valor-milhar-errado": [None, D, "1234.567,89", "Cat", "ALFA", None],
        "valor-arabe": [None, D, "١٠,٠٠", "Cat", "ALFA", None],
        "valor-mais": [None, D, "+10,00", "Cat", "ALFA", None],
        "sem-descricao": [None, D, 10, None, None, None],
        "descricao-espacos": [None, D, 10, "   ", "  ", None],
        "categoria-bool": [None, D, 10, True, "ALFA", None],
        "documento-bool": [False, D, 10, "Cat", "ALFA", None],
        "documento-fracao": [10.5, D, 10, "Cat", "ALFA", 1e-7],
        "favorecido-numero": [None, D, 10, None, 123456, None],
        "documento-grande": [1e20, D, 10, "Cat", "ALFA", 2**60],
        "texto-espacos": ["  NF   1 ", D, 10, " Cat\tA ", " ALFA  BETA ", " 1\n2 "],
    }
    for nome, linha in erros.items():
        valor = linha[2] if isinstance(linha[2], (int, float)) and not isinstance(linha[2], bool) else 10
        yield f"linha-{nome}.xlsx", xlsx([financeiro([linha], total=valor)])
    yield "linha-data-hora.xls", xls([financeiro([[None, datetime(2026, 9, 2, 14, 30), 10, "Cat", "ALFA", None]], total=10)])
    yield "linhas-vazias-no-meio.xlsx", xlsx([financeiro([base[0], [], [None, None, None, None, None, None], ["", ""], base[1]])])
    yield "repetidas.xlsx", xlsx([financeiro([base[0], base[0], base[0], base[1], base[1]])])
    yield "repetidas-referencia.xls", xls([financeiro([base[0], list(base[0])])])
    yield "duas-folhas.xlsx", xlsx([financeiro(base), financeiro(base, cab=CAB_REC)], titulos=["Pagos", "Recebidos"])
    yield "folha-vazia.xlsx", xlsx([[], financeiro(base), [[None, ""]]], titulos=["Capa", "Dados", "Branca"])
    yield "folha-desconhecida.xlsx", xlsx([financeiro(base), [["Layout desconhecido", 30]]], titulos=["Dados", "Outra fonte"])
    yield "folha-desconhecida.xls", xls([[["Layout desconhecido", 30]], financeiro(base)], titulos=["Outra", "Dados"])
    yield "formula-sem-cache.xlsx", xlsx([[[None, None, "=SUM(C3:C4)"], CAB_PAG, ["1", D, "=1+1", "Cat", "ALFA", None]]])
    yield "titulos-e-pagamentos.xlsx", xlsx([titulos_linhas("fornecedor"), financeiro(base)], titulos=["Contas", "Pagos"])
    yield "pdf-com-nome-xls.xls", b"%PDF-1.4 qualquer"
    yield "vazio.xlsx", xlsx([[]])


def titulos_linhas(parte="cliente", linhas=None, antes=(), cab=None, categorias=("Categoria 1",)):
    verbo = "recebido" if parte == "cliente" else "pago"
    cab = cab or [
        f"Nome do {parte}", f"Identificador do {parte}", "Código referência", "Descrição", "Data de vencimento",
        "Data do último pagamento", f"Valor total {verbo} da parcela (R$)", "Valor total da parcela em aberto (R$)",
        "Conta bancária", "Observações", *categorias,
    ]
    if linhas is None:
        linhas = [
            ["Fictício", "123", "NF 10", "Venda fictícia", "02/08/2025", "01/08/2025", 20, 30, "Banco não informado", "Consulta", "Serviços"],
            ["Outro", 98765432000110, 77, None, datetime(2025, 8, 3), datetime(2025, 8, 4), "1.234,56", 0, 341, None, None],
            [None, None, None, "Só aberto", "05/08/2025", None, 0, 50.5, None, None, "Impostos"],
            ["Nada", None, None, None, "06/08/2025", None, 0, 0, None, None, None],
        ]
    return [list(a) for a in antes] + [cab] + [list(l) for l in linhas]


def casos_titulos():
    for parte in ("cliente", "fornecedor"):
        yield f"titulos-{parte}.xlsx", xlsx([titulos_linhas(parte)])
        yield f"titulos-{parte}.xls", xls([titulos_linhas(parte)])
    yield "titulos-categorias.xlsx", xlsx([titulos_linhas("cliente", categorias=("Categoria 1", "Categoria 2", "categoria x", "Categoria 10"), linhas=[
        ["A", "1", "R1", "D1", "02/08/2025", "01/08/2025", 1, 0, None, None, "C1", None, "X", "C10"],
        ["B", "2", "R2", "D2", "02/08/2025", "01/08/2025", 2, 0, None, None, None, "  ", None],
    ])])
    yield "titulos-cabecalho-abaixo.xlsx", xlsx([titulos_linhas("fornecedor", antes=[["Contas a pagar"], [], ["Período", "08/2025"]])])
    yield "titulos-cabecalho-repetido.xlsx", xlsx([titulos_linhas("fornecedor", categorias=("Descrição",))])
    erros = {
        "sem-data-pagamento": ["A", "1", "R", "D", "02/08/2025", "", 20, 30, None, None, None],
        "vencimento-invalido": ["A", "1", "R", "D", "32/08/2025", "01/08/2025", 20, 30, None, None, None],
        "sem-identificacao": [None, "1", "R", "  ", "02/08/2025", "01/08/2025", 20, 30, None, None, None],
        "realizado-negativo": ["A", "1", "R", "D", "02/08/2025", "01/08/2025", -20, 30, None, None, None],
        "aberto-vazio": ["A", "1", "R", "D", "02/08/2025", "01/08/2025", 20, None, None, None, None],
        "realizado-texto": ["A", "1", "R", "D", "02/08/2025", "01/08/2025", "abc", 30, None, None, None],
        "observacao-bool": ["A", "1", "R", "D", "02/08/2025", "01/08/2025", 20, 30, None, True, None],
        "conta-fracao": ["A", "1", "R", "D", "02/08/2025", "01/08/2025", 20, 30, 1.25, "obs", None],
    }
    for nome, linha in erros.items():
        yield f"titulos-{nome}.xlsx", xlsx([titulos_linhas("fornecedor", linhas=[linha])])
    yield "titulos-so-zeros.xlsx", xlsx([titulos_linhas("cliente", linhas=[["A", "1", "R", "D", "02/08/2025", None, 0, 0, None, None, None]])])


# ─── PDFs inventados: saldo conciliado por banco ───────────────────────────

COLUNAS = [
    (10, "Data"), (47, "Tipo"), (107, "N. Nota"), (156, "Par"), (173, "Razão"), (301, "Crédito (R$)"),
    (363, "Débito (R$)"), (437, "Saldo (R$)"), (480, "Forma Pgto"), (572, "Referente"), (722, "Natureza"),
]


def pdf_conciliado(paginas, *, largura=842, altura=595):
    """`paginas`: lista de dicts {titulo, cabecalho (deslocamento ou None), itens}."""
    import pymupdf

    doc = pymupdf.open()

    def texto(pg, x, y, conteudo, tamanho=8, fonte="helv"):
        pg.insert_text((x, y), conteudo, fontsize=tamanho, fontname=fonte)

    def dinheiro(pg, direita, y, conteudo):
        texto(pg, direita - pymupdf.get_text_length(conteudo, fontsize=8, fontname="helv"), y, conteudo)

    for p in paginas:
        pg = doc.new_page(width=largura, height=altura)
        if p.get("titulo"):
            texto(pg, 212, 45, f"Saldo em Conta Conciliado por Banco: {p['titulo']}", 10)
        y = 32
        if p.get("cabecalho") is not None:
            dx = p["cabecalho"]
            for x, rotulo in p.get("colunas", COLUNAS):
                texto(pg, x + dx, 90, rotulo)
            y = 104
        for item in p["itens"]:
            tipo = item.get("k", "mov")
            if tipo == "mov":
                for x, campo in ((10, "data"), (47, "tipo"), (107, "nota"), (156, "par"), (173, "razao"), (480, "forma"), (572, "referente"), (722, "natureza")):
                    if item.get(campo):
                        texto(pg, x, y, item[campo])
                for x, campo in ((173, "razao2"), (572, "referente2"), (47, "tipo2")):
                    if item.get(campo):
                        texto(pg, x, y + 7, item[campo])
                for direita, campo in ((344, "credito"), (404, "debito"), (475, "saldo")):
                    if item.get(campo):
                        dinheiro(pg, direita, y, item[campo])
                for x, dy, extra in item.get("extras", ()):
                    texto(pg, x, y + dy, extra)
                y += item.get("dy", 16)
            elif tipo == "total":
                cred, deb = item["valores"]
                if cred is not None:
                    texto(pg, 291, y, "R$")
                    dinheiro(pg, 344, y, cred)
                if deb is not None:
                    texto(pg, 351, y, "R$")
                    dinheiro(pg, 404, y, deb)
                y += 18
            elif tipo == "resumo":
                y += 14
                texto(pg, 220, y, "Saldo Inicial (R$)")
                texto(pg, 301, y, "Crédito (R$)")
                texto(pg, 363, y, "Débito (R$)")
                texto(pg, 417, y, "Saldo Final (R$)")
                for direita, valor in zip((284, 344, 404, 475), item["valores"], strict=True):
                    if valor is not None:
                        dinheiro(pg, direita, y + 14, valor)
                y += 30
            elif tipo == "texto":
                texto(pg, item["x"], y + item.get("dy", 0), item["t"])
    dados = doc.tobytes()
    doc.close()
    return dados


def mov(tipo, valor=None, saldo="", *, debito=False, data=None, **extra):
    m = {"tipo": tipo, "saldo": saldo, "data": data, **extra}
    if valor is not None:
        m["debito" if debito else "credito"] = valor
    return m


def dia_base(data="06.24.26"):
    return [
        mov("1-SALDO", saldo="1.000,00", data=data),
        mov("2-RECEBIDO", "500,00", "1.500,00", nota="00012", par="1", razao="CLIENTE FICTICIO", forma="FATURADO", referente="Observacao", natureza="VENDAS"),
        mov("3-PAGO", "200,50", "1.299,50", debito=True, nota="00013", par="2", razao="FORNECEDOR FICTICIO", forma="DEPOSITO", natureza="INSUMOS"),
        {"k": "total", "valores": ("500,00", "200,50")},
    ]


def conciliado(itens_por_pagina, banco="3-BANCO FICTICIO", resumo=("1.000,00", "500,00", "200,50", "1.299,50"), cabecalhos=None, titulos=None):
    paginas = []
    for i, itens in enumerate(itens_por_pagina):
        cab = (cabecalhos or {}).get(i, 0 if i == 0 else None)
        titulo = (titulos or {}).get(i, banco if i == 0 else None)
        paginas.append({"titulo": titulo, "cabecalho": cab, "itens": list(itens)})
    if resumo is not None:
        paginas[-1]["itens"].append({"k": "resumo", "valores": resumo})
    return pdf_conciliado(paginas)


def casos_conciliado():
    yield "conciliado-base.pdf", conciliado([dia_base()])
    yield "conciliado-duas-paginas.pdf", conciliado([dia_base()[:2], dia_base()[2:]])
    dois_dias = dia_base() + [
        mov("2-RECEBIDO", "1.234,56", "2.534,06", data="06.25.26", razao="OUTRO CLIENTE", razao2="SEGUNDA LINHA", referente="Ref", referente2="cont.", natureza="VENDAS"),
        mov("3-PAGO", "34,06", "2.500,00", debito=True, razao="TARIFA", natureza="DESPESAS BANCARIAS"),
        {"k": "total", "valores": ("1.234,56", "34,06")},
    ]
    resumo2 = ("1.000,00", "1.734,56", "234,56", "2.500,00")
    yield "conciliado-dois-dias.pdf", conciliado([dois_dias], resumo=resumo2)
    yield "conciliado-dois-dias-paginas.pdf", conciliado([dois_dias[:4], dois_dias[4:]], resumo=resumo2, cabecalhos={1: 0})
    yield "conciliado-colunas-mudam.pdf", conciliado([dois_dias[:4], dois_dias[4:]], resumo=resumo2, cabecalhos={1: 5})
    yield "conciliado-colunas-mudam-pouco.pdf", conciliado([dois_dias[:4], dois_dias[4:]], resumo=resumo2, cabecalhos={1: 0.5})
    yield "conciliado-bancos-diferentes.pdf", conciliado([dois_dias[:4], dois_dias[4:]], resumo=resumo2, titulos={1: "4-OUTRO BANCO"})
    yield "conciliado-mesmo-banco.pdf", conciliado([dois_dias[:4], dois_dias[4:]], resumo=resumo2, titulos={1: "3-BANCO FICTICIO"})
    yield "conciliado-resumo-na-primeira.pdf", pdf_conciliado([
        {"titulo": "3-BANCO FICTICIO", "cabecalho": 0, "itens": dia_base() + [{"k": "resumo", "valores": ("1.000,00", "500,00", "200,50", "1.299,50")}]},
        {"itens": [{"k": "texto", "x": 47, "t": "continuação"}]},
    ])
    yield "conciliado-sem-resumo.pdf", conciliado([dia_base()], resumo=None)
    yield "conciliado-resumo-incompleto.pdf", conciliado([dia_base()], resumo=("1.000,00", None, "200,50", "1.299,50"))
    yield "conciliado-resumo-errado.pdf", conciliado([dia_base()], resumo=("1.000,00", "500,00", "200,50", "1.299,49"))
    yield "conciliado-resumo-um-centavo.pdf", conciliado([dia_base()], resumo=("1.000,01", "500,00", "200,50", "1.299,50"))
    base = dia_base()
    variacoes = {
        "saldo-nao-fecha": [base[0], {**base[1], "saldo": "1.500,01"}, *base[2:]],
        "credito-e-debito": [base[0], {**base[1], "debito": "1,00"}, *base[2:]],
        "sem-valor": [base[0], {k: v for k, v in base[1].items() if k != "credito"}, *base[2:]],
        "valor-zero": [base[0], {**base[1], "credito": "0,00", "saldo": "1.000,00"}, base[2], base[3]],
        "valor-negativo": [base[0], {**base[1], "credito": "-500,00", "saldo": "500,00"}, *base[2:]],
        "sem-saldo-inicial": base[1:],
        "inicial-com-valor": [{**base[0], "credito": "1,00"}, *base[1:]],
        "data-desconhecida": [{**base[0], "data": "6.24.2026"}, *base[1:]],
        "data-invalida": [{**base[0], "data": "06.31.26"}, *base[1:]],
        "data-mes-13": [{**base[0], "data": "13.01.26"}, *base[1:]],
        "data-ano-69": [{**base[0], "data": "06.24.69"}, *base[1:]],
        "data-texto": [{**base[0], "data": "ontem"}, *base[1:]],
        "sem-data": [{**base[0], "data": None}, *base[1:]],
        "fora-de-ordem": [base[0], {**base[1], "data": "06.23.26"}, *base[2:]],
        "sem-total-diario": base[:3],
        "total-diario-incompleto": [*base[:3], {"k": "total", "valores": ("500,00", None)}],
        "total-diario-errado": [*base[:3], {"k": "total", "valores": ("500,00", "200,51")}],
        "total-diario-repetido": [*base, {"k": "total", "valores": ("500,00", "200,50")}],
        "tipo-sobreposto": [base[0], {**base[1], "extras": [(47, -6, "INICIAL")]}, {**base[2], "extras": [(47, -6, "CREDITO")]}, base[3]],
        "tipo-sobreposto-sem-numero": [base[0], {**base[1], "tipo": "RECEBIDO", "extras": [(47, -6, "INICIAL")]}, *base[2:]],
        "tipo-com-espaco": [base[0], {**base[1], "tipo": "2 - RECEBIDO"}, *base[2:]],
        "razao-sobreposta": [base[0], {**base[1], "razao": "NOME MUITO LONGO QUE INVADE A COLUNA DE CREDITO SEM FIM"}, *base[2:]],
        "letras-coladas": [base[0], {**base[1], "razao": "A", "extras": [(175.5, 0, "B"), (180, 0, "C")]}, *base[2:]],
        "linhas-sobrepostas": [base[0], {**base[1], "extras": [(173, 0.4, "XYZ"), (173, 1.2, "QWE")]}, *base[2:]],
    }
    for nome, itens in variacoes.items():
        yield f"conciliado-{nome}.pdf", conciliado([itens])
    yield "conciliado-sem-titulo.pdf", conciliado([base], titulos={0: None})
    yield "conciliado-titulo-quebrado.pdf", pdf_conciliado([{"titulo": "", "cabecalho": 0, "itens": [{"k": "texto", "x": 212, "dy": -60, "t": "Saldo em Conta Conciliado por Banco:"}, *base]}])
    yield "conciliado-sem-natureza.pdf", pdf_conciliado([{"titulo": "3-BANCO", "cabecalho": 0, "colunas": COLUNAS[:-1], "itens": base}])
    yield "conciliado-forma-rs.pdf", pdf_conciliado([{"titulo": "3-BANCO", "cabecalho": 0, "colunas": [*COLUNAS[:8], (480, "Forma(R$)"), *COLUNAS[9:]], "itens": [*base, {"k": "resumo", "valores": ("1.000,00", "500,00", "200,50", "1.299,50")}]}])
    yield "conciliado-sem-movimentos.pdf", conciliado([[base[0]]], resumo=("1.000,00", "0,00", "0,00", "1.000,00"))
    yield "conciliado-pagina-em-branco.pdf", pdf_conciliado([{"titulo": "3-BANCO", "cabecalho": 0, "itens": base}, {"itens": [{"k": "resumo", "valores": ("1.000,00", "500,00", "200,50", "1.299,50")}]}])
    yield "conciliado-milhoes.pdf", conciliado([[
        mov("1-SALDO", saldo="-1.234.567,89", data="12.31.25"),
        mov("2-RECEBIDO", "2.000.000,00", "765.432,11", razao="GRANDE"),
        {"k": "total", "valores": ("2.000.000,00", "0,00")},
    ]], resumo=("-1.234.567,89", "2.000.000,00", "0,00", "765.432,11"))
    yield "pdf-quebrado.pdf", b"%PDF-1.4\n%quebrado\n"
    yield "pdf-texto.pdf", b"%PDFmalformado"


# ─── PDFs inventados: Omie ──────────────────────────────────────────────────

CAB_OMIE = [(40, "Situação"), (90, "Data"), (130, "Cliente ou Fornecedor"), (270, "Documento"), (330, "Categoria"), (480, "Valor"), (540, "Saldo")]


def pdf_omie(paginas, *, banco="Banco Ficticio", periodo="Período de 01/12/2025 até 31/12/2025", total_paginas=None, cab=CAB_OMIE, fonte="helv", fonte_cab=None, gerado=False, cab_so_na_primeira=False):
    import pymupdf

    doc = pymupdf.open()
    n = len(paginas) if total_paginas is None else total_paginas
    for i, linhas in enumerate(paginas):
        page = doc.new_page()
        if i == 0:
            if banco:
                page.insert_text((40, 40), f"Extrato de {banco}")
            page.insert_text((40, 55), "Conta Corrente")
            if periodo:
                page.insert_text((40, 70), periodo)
        if cab and (i == 0 or not cab_so_na_primeira):
            for x, texto in cab:
                page.insert_text((x, 100), texto, fontsize=8, fontname=fonte_cab or fonte)

        def moeda(texto, x, y, rotulo, tamanho=8):
            direita = x + pymupdf.get_text_length(rotulo, fontsize=8, fontname=fonte_cab or fonte)
            page.insert_text((direita - pymupdf.get_text_length(texto, fontsize=tamanho, fontname=fonte), y), texto, fontsize=tamanho, fontname=fonte)

        y = 120
        for linha in linhas:
            tamanho = linha.get("fs", 8)
            for x, campo in ((40, "situacao"), (90, "data"), (130, "nome"), (270, "doc"), (330, "cat")):
                if linha.get(campo):
                    page.insert_text((x, y + linha.get("dy_" + campo, 0)), linha[campo], fontsize=tamanho, fontname=fonte)
            if linha.get("valor"):
                moeda(linha["valor"], 480, y, "Valor", tamanho)
            if linha.get("saldo"):
                moeda(linha["saldo"], 540, y, "Saldo", tamanho)
            for x, dy, extra in linha.get("extras", ()):
                page.insert_text((x, y + dy), extra, fontsize=tamanho, fontname=fonte)
            y += linha.get("dy", 20)
        if gerado:
            page.insert_text((40, 735), "Gerado em 02/01/2026 10:00", fontsize=8, fontname=fonte)
        if n:
            page.insert_text((40, 750), f"Página {i + 1} de {n}", fontsize=8, fontname=fonte)
    dados = doc.tobytes()
    doc.close()
    return dados


def omie_mov(situacao, data, nome, doc, cat, valor, saldo, **extra):
    return {"situacao": situacao, "data": data, "nome": nome, "doc": doc, "cat": cat, "valor": valor, "saldo": saldo, **extra}


ANTERIOR = {"data": "30/11/25", "nome": "SALDO ANTERIOR", "saldo": "100,00"}
OMIE_BASE = [
    ANTERIOR,
    omie_mov("Conciliado", "01/12/25", "Cliente Exemplo", "123", "Serviços", "20,00", "120,00"),
    omie_mov("Não Conciliar", "02/12/25", "Fornecedor Exemplo", "NF 45", "Insumos", "-1.234,56", "-1.114,56"),
    omie_mov("Pendente", "02/12/25", "Tarifa", None, "Despesas", "-0,44", "-1.115,00"),
]


def casos_omie():
    yield "omie-base.pdf", pdf_omie([OMIE_BASE])
    yield "omie-duas-paginas.pdf", pdf_omie([OMIE_BASE[:2], OMIE_BASE[2:]], gerado=True)
    yield "omie-tres-paginas.pdf", pdf_omie([OMIE_BASE[:2], OMIE_BASE[2:3], OMIE_BASE[3:]])
    yield "omie-negrito.pdf", pdf_omie([OMIE_BASE], fonte_cab="hebo")
    yield "omie-times.pdf", pdf_omie([OMIE_BASE], fonte="tiro")
    yield "omie-courier.pdf", pdf_omie([OMIE_BASE], fonte="cour")
    variacoes = {
        "saldo-nao-fecha": [ANTERIOR, {**OMIE_BASE[1], "saldo": "121,00"}],
        "saldo-um-centavo": [ANTERIOR, {**OMIE_BASE[1], "saldo": "120,01"}],
        "data-fora": [ANTERIOR, {**OMIE_BASE[1], "data": "01/11/25"}],
        "data-depois": [ANTERIOR, {**OMIE_BASE[1], "data": "01/01/26"}],
        "fora-de-ordem": [ANTERIOR, {**OMIE_BASE[1], "data": "03/12/25"}, {**OMIE_BASE[2], "data": "02/12/25"}],
        "data-invalida": [ANTERIOR, {**OMIE_BASE[1], "data": "32/12/25"}],
        "sem-data": [ANTERIOR, {**OMIE_BASE[1], "data": None}],
        "situacao-desconhecida": [ANTERIOR, {**OMIE_BASE[1], "situacao": "Aprovado"}],
        "sem-anterior": OMIE_BASE[1:2],
        "anterior-repetido": [ANTERIOR, OMIE_BASE[1], ANTERIOR],
        "anterior-duas-vezes": [ANTERIOR, ANTERIOR, OMIE_BASE[1]],
        "valor-ambiguo": [ANTERIOR, {**OMIE_BASE[1], "extras": [(482, 0, "1,00")]}],
        "sem-saldo": [ANTERIOR, {**OMIE_BASE[1], "saldo": None}],
        "sem-valor": [ANTERIOR, {**OMIE_BASE[1], "valor": None}],
        "nome-invade-documento": [ANTERIOR, {**OMIE_BASE[1], "nome": "Cliente Com Nome Muito Comprido Demais", "doc": None}],
        "nome-invade-com-documento": [ANTERIOR, {**OMIE_BASE[1], "nome": "Cliente Com Nome Muito Comprido Ltda", "doc": "77"}],
        "sem-descricao": [ANTERIOR, {**OMIE_BASE[1], "nome": None, "doc": None, "cat": None}],
        "so-categoria": [ANTERIOR, {**OMIE_BASE[1], "nome": None}],
        "letras-separadas": [ANTERIOR, {**OMIE_BASE[1], "nome": "Cli", "extras": [(141.5, 0, "ente"), (160, 0, "Nome")]}],
        "tamanhos-misturados": [ANTERIOR, {**OMIE_BASE[1], "fs": 7, "extras": [(200, 1.5, "X")]}],
        "linha-quebrada": [ANTERIOR, {**OMIE_BASE[1], "dy_cat": 4}],
        "linha-quebrada-longe": [ANTERIOR, {**OMIE_BASE[1], "dy_cat": 9}],
        "duas-datas": [ANTERIOR, {**OMIE_BASE[1], "doc": "05/12/25"}],
        "zero": [ANTERIOR, {**OMIE_BASE[1], "valor": "0,00", "saldo": "100,00"}],
    }
    for nome, linhas in variacoes.items():
        yield f"omie-{nome}.pdf", pdf_omie([linhas])
    yield "omie-gerado-em.pdf", pdf_omie([OMIE_BASE], gerado=True)
    yield "omie-paginacao-errada.pdf", pdf_omie([OMIE_BASE], total_paginas=2)
    yield "omie-sem-paginacao.pdf", pdf_omie([OMIE_BASE], total_paginas=0)
    yield "omie-sem-banco.pdf", pdf_omie([OMIE_BASE], banco=None)
    yield "omie-sem-periodo.pdf", pdf_omie([OMIE_BASE], periodo=None)
    yield "omie-periodo-invertido.pdf", pdf_omie([OMIE_BASE], periodo="Período de 31/12/2025 até 01/12/2025")
    yield "omie-periodo-invalido.pdf", pdf_omie([OMIE_BASE], periodo="Periodo de 31/02/2025 ate 31/12/2025")
    yield "omie-sem-cliente.pdf", pdf_omie([OMIE_BASE], cab=[c for c in CAB_OMIE if c[1] != "Cliente ou Fornecedor"] + [(130, "Cliente ou Fornecedor")])
    yield "omie-cabecalho-sem-cliente.pdf", pdf_omie([OMIE_BASE], cab=[(x, "Fornecedor ou Cliente" if t == "Cliente ou Fornecedor" else t) for x, t in CAB_OMIE])
    yield "omie-sem-cabecalho-na-segunda.pdf", pdf_omie([OMIE_BASE[:2], OMIE_BASE[2:]], cab_so_na_primeira=True)


# ─── Sugestões sorteadas ───────────────────────────────────────────────────

def _cnpj_ficticio(rnd):
    base = [9] + [rnd.randint(0, 9) for _ in range(11)]

    def dv(ds, pesos):
        resto = sum(d * p for d, p in zip(ds, pesos)) % 11
        return 0 if resto < 2 else 11 - resto

    base.append(dv(base, (5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2)))
    base.append(dv(base, (6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2)))
    return "".join(map(str, base))


NOMES = ["EMPRESA ALFA LTDA", "EMPRESA ALFA", "ALFA", "BETA SERVICOS SA", "GAMA COMERCIO", "DELTA", "ÉPSILON ÇÃO ME",
         "FORNECEDOR NUMERO 1", "FORNECEDOR NUMERO 12", "COMERCIAL ZETA EPP", "S A", "DE DA DO", "ETA-TETA/IOTA"]


def _linha_sorteada(rnd, i, tipo, dias, valores, cnpjs):
    nome = rnd.choice(NOMES + [None, None])
    hist = rnd.choice([
        "", nome or "", f"PAGAMENTO PIX {rnd.choice(cnpjs)} {nome or ''}", f"PGTO {rnd.choice(NOMES)}",
        "SISPAG FORNECEDORES", "PAGTO SISPAG", f"TED {rnd.choice(cnpjs)[:2]}.{rnd.choice(cnpjs)[2:5]}.123/0001-{rnd.randint(10, 99)}",
        "TARIFA", f"BOLETO 123.456.789-0{rnd.randint(0, 9)} {nome or ''}",
    ])
    doc = rnd.choice([None, None, None, rnd.choice(cnpjs), f"{rnd.choice(cnpjs)[:2]}.{rnd.choice(cnpjs)[2:5]}.{rnd.choice(cnpjs)[5:8]}/{rnd.choice(cnpjs)[8:12]}-{rnd.choice(cnpjs)[12:]}", "123.456.789-09", "sem documento"])
    ordem = rnd.choice([None, i, i, rnd.randint(0, 3)])
    return {
        "id": f"{tipo.lower()}-{i}",
        "data": rnd.choice(dias),
        "valor": rnd.choice(valores),
        "tipo_fonte": tipo,
        "historico": hist,
        "favorecido": nome if rnd.random() < 0.7 else None,
        "documento_favorecido": doc,
        "documento": rnd.choice([None, "NF 1"]),
        "ordem": ordem,
        "ordem_fonte": rnd.choice(["fonte-a", "fonte-a", "fonte-b", None]) if ordem is not None else None,
        "fonte_id": "f",
    }


def casos_sugestoes(sug):
    rnd = random.Random(20261112)
    cnpjs = [_cnpj_ficticio(rnd) for _ in range(4)] + ["91234567000100", "12345678901"]
    tipos = list(sug.PARES)
    for n in range(420):
        tipo = tipos[n % len(tipos)]
        base, origem = sug.PARES[tipo]
        dias = rnd.sample(["2026-06-01", "2026-06-02", "2026-06-03", "2026-05-31", "2026-07-01"], rnd.randint(1, 3))
        valores = rnd.sample(["-10.00", "-10", "-20.00", "-5.00", "-5.05", "-15.05", "-100", "-50", "-50.05", "10.00", "20", "0", "0.00", "-30.00", "-40", "-60"], rnd.randint(2, 7))
        linhas = []
        for i in range(rnd.randint(1, 9)):
            linhas.append(_linha_sorteada(rnd, i, base, dias, valores, cnpjs))
        for i in range(rnd.randint(1, 9)):
            linhas.append(_linha_sorteada(rnd, 100 + i, origem, dias, valores, cnpjs))
        if rnd.random() < 0.2:
            linhas.append(_linha_sorteada(rnd, 200, rnd.choice(["FINANCEIRO", "EXTRATO", "RAZAO", "SISPAG"]), dias, valores, cnpjs))
        rnd.shuffle(linhas)
        vinculos = []
        for _ in range(rnd.choice([0, 0, 1, 2])):
            ids = rnd.sample([l["id"] for l in linhas], min(2, len(linhas)))
            vinculos.append({"estado": rnd.choice(["ATIVO", "DESFEITO"]), "tipo_comparacao": rnd.choice([tipo, rnd.choice(tipos)]), "financeiro_ids": ids[:1], "comparacao_ids": ids[1:]})
        opcoes = {"maxComparacoes": rnd.randint(1, 30)} if n % 9 == 0 else None
        yield linhas, vinculos, tipo, rnd.randint(1, 5), "2026-06-01", "2026-06-30", opcoes
    # Ramos dirigidos: parcelas iguais, ajuste de 5 centavos com ordem, N para 1, SISPAG com 2 e 3 alvos.
    def L(i, valor, tipo, nome=None, hist=None, dia="2026-06-01", ordem=None, fonte=None, doc=None):
        return {"id": i, "valor": valor, "tipo_fonte": tipo, "favorecido": nome, "historico": hist if hist is not None else (nome or ""),
                "data": dia, "ordem": ordem, "ordem_fonte": fonte, "documento_favorecido": doc}
    dirigidos = [
        ("EXTRATO", [L("f", "-100.05", "FINANCEIRO", "EMPRESA ALFA"), L("a", "-50", "EXTRATO", "EMPRESA ALFA", ordem=2, fonte="x"), L("b", "-50.05", "EXTRATO", "EMPRESA ALFA", ordem=1, fonte="x")]),
        ("EXTRATO", [L("f", "-100.05", "FINANCEIRO", "EMPRESA ALFA"), L("a", "-50.05", "EXTRATO", "EMPRESA ALFA", ordem=1, fonte="x"), L("b", "-50", "EXTRATO", "EMPRESA ALFA", ordem=2, fonte="x")]),
        ("EXTRATO", [L("c", "-100.05", "EXTRATO", "EMPRESA ALFA"), L("a", "-50", "FINANCEIRO", "EMPRESA ALFA", ordem=0, fonte="x"), L("b", "-50.05", "FINANCEIRO", "EMPRESA ALFA", ordem=1, fonte="x")]),
        ("EXTRATO", [L("c", "-100.05", "EXTRATO", "EMPRESA ALFA"), L("a", "-50", "FINANCEIRO", "EMPRESA ALFA", ordem=0, fonte="x"), L("b", "-50.05", "FINANCEIRO", "EMPRESA ALFA", ordem=0, fonte="x")]),
        ("SISPAG", [L("s1", "-100", "SISPAG", hist="SISPAG FORNECEDORES"), L("s2", "-50", "SISPAG", hist="SISPAG TRIBUTOS"),
                    L("a", "-40", "FINANCEIRO", "ALFA"), L("b", "-60", "FINANCEIRO", "BETA"), L("c", "-30", "FINANCEIRO", "GAMA"), L("d", "-20", "FINANCEIRO", "DELTA")]),
        ("EXTRATO", [L("s1", "-100", "EXTRATO", hist="SISPAG FORNECEDORES"), L("s2", "-70", "EXTRATO", hist="SISPAG SALARIOS"), L("s3", "-30", "EXTRATO", hist="SISPAG X"),
                     L("a", "-40", "FINANCEIRO", "ALFA"), L("b", "-60", "FINANCEIRO", "BETA"), L("c", "-30", "FINANCEIRO", "GAMA"), L("d", "-70", "FINANCEIRO", "DELTA")]),
        ("RAZAO_SISPAG", [L("r1", "-100", "RAZAO", hist="PAGTO SISPAG"), L("r2", "-50", "RAZAO", hist="SISPAG 2"),
                          L("a", "-40", "SISPAG", "ALFA"), L("b", "-60", "SISPAG", "BETA"), L("c", "-50", "SISPAG", "GAMA")]),
        ("EXTRATO", [L("s1", "100", "EXTRATO", hist="SISPAG ESTORNO"), L("a", "-100", "FINANCEIRO", "ALFA")]),
        ("RAZAO", [L("f", "-10", "FINANCEIRO", doc="91234567000100"), L("r", "-10", "RAZAO", hist="PIX 91.234.567/0001-00 X")]),
        ("RAZAO", [L("f", "-10", "FINANCEIRO", doc="12345678901"), L("r", "-10", "RAZAO", hist="PIX 12345678901")]),
        ("RAZAO", [L("f", "-10", "FINANCEIRO", "ALFA BETA GAMA"), L("r", "-10", "RAZAO", hist="PGTO ALFA BETA GAMA DELTA")]),
        ("RAZAO", [L("f", "-10", "FINANCEIRO", "EMPRESA ALFA"), L("r", "-10", "RAZAO", "EMPRESA ALFA COMERCIO")]),
    ]
    for tipo, linhas in dirigidos:
        yield linhas, [], tipo, 7, "2026-06-01", "2026-06-30", None


def chamadas_diretas(doc, sug):
    celulas = [
        None, "", " ", "abc", "  Texto  com   espaços ", "\tTAB\n", "Ação", "ﬁm", "İSTANBUL", "Straße", 0, 1, -1, 10, 2**60,
        0.0, -0.0, 1.0, 1.5, 10.001, 30.000000000005, 245698.99000000005, 0.1 + 0.2, 1e-7, 1e16, 1e20, 1e27, float("inf"),
        float("-inf"), float("nan"), True, False, "10,00", "R$ 10,00", "R$10,00", " R$ 1.234,56 ", "-10,00", "+10,00", "10.00",
        "1.234", "1234,5", "١٠,٠٠", "0,00", "-0,00", "9.999.999.999.999,99", "10.000.000.000.000,00",
        "02/09/2026", " 2/9/2026", "31/02/2026", "29/02/2024", "2026-09-02", "02/09/26", "1٢/09/2026",
        datetime(2026, 9, 2), datetime(2026, 9, 2, 23, 59, 59), date(2026, 9, 2), hora(10, 30), timedelta(days=1),
    ]
    for c in celulas:
        _registrar("documentos._valor", doc._valor, [c, "contexto"])
        _registrar("documentos._valor", doc._valor, [c, "contexto"], {"assinado": True})
        _registrar("documentos._texto", doc._texto, [c])
        _registrar("documentos._data_planilha", doc._data_planilha, [c, "contexto"])
        _registrar("documentos._normalizar", doc._normalizar, [c])
    textos = ["", "Empresa Ação Ltda", "PAGAMENTO PIX 91234567000100 EMPRESA-ALFA/SA", "ﬁscal", "straße", "İstanbul", "ı",
              "  muitos   espaços\tnovos\n", "Œuvre", "№ 12", "x²", "١٢٣", "ǅ", "Σ ΟΔΟΣ", "Ångström", "naïve café", "日本"]
    for t in textos:
        _registrar("sugestoes.normalizar", sug.normalizar, [t])
    rnd = random.Random(7)
    cnpjs = [_cnpj_ficticio(rnd) for _ in range(3)] + ["91234567000100", "12345678901", "00000000000000"]
    for i in range(300):
        a = _linha_sorteada(rnd, i, "FINANCEIRO", ["2026-06-01"], ["-1"], cnpjs)
        b = _linha_sorteada(rnd, 500 + i, "EXTRATO", ["2026-06-01"], ["-1"], cnpjs)
        _registrar("sugestoes.identidade", sug.identidade, sanitizar([a, b]))


def pytest_unconfigure(config):  # noqa: ARG001
    pasta = os.environ.get("GABARITO_PASTA")
    if not pasta:
        return
    doc, omie, tit, sug, _ = _modulos()
    ler = getattr(doc.ler_financeiro, "__wrapped__", doc.ler_financeiro)
    validar = getattr(doc.validar_conteudo, "__wrapped__", doc.validar_conteudo)
    ler_omie = getattr(omie.ler_omie, "__wrapped__", omie.ler_omie)
    ler_titulos = getattr(tit.ler_folha_titulos, "__wrapped__", tit.ler_folha_titulos)
    sugerir = getattr(sug.sugerir, "__wrapped__", sug.sugerir)
    for r in list(chamadas.values()):
        if r["fn"].startswith("documentos.") and r["args"] and isinstance(r["args"][0], dict) and "$arquivo" in r["args"][0]:
            nomes_de_arquivo.setdefault(r["args"][0]["$arquivo"], f"fin-suite-{r['args'][0]['$arquivo']}")
        if r["fn"] == "omie.ler_omie":
            nomes_de_arquivo.setdefault(r["args"][0]["$arquivo"], f"fin-suite-{r['args'][0]['$arquivo']}")
    casos = [*casos_planilhas(), *casos_titulos(), *casos_conciliado(), *casos_omie()]
    for nome, conteudo in casos:
        conteudo = sanitizar_bytes(conteudo)
        sha = hashlib.sha256(conteudo).hexdigest()[:12]
        nomes_de_arquivo.setdefault(sha, f"fin-{nome}")
        extensao = os.path.splitext(nome)[1]
        _registrar("documentos.ler_financeiro", ler, [conteudo, f"arquivo{extensao}"])
        _registrar("documentos.validar_conteudo", validar, [conteudo, f"arquivo{extensao}"])
        if nome.startswith("omie-") or nome.startswith("conciliado-base"):
            _registrar("omie.ler_omie", lambda c: ler_omie(c, time.monotonic()), [conteudo])
    # Extensão diferente do conteúdo e nomes estranhos.
    planilha = dict(casos)["pagamentos.xlsx"]
    velho = dict(casos)["pagamentos.xls"]
    pdf = dict(casos)["conciliado-base.pdf"]
    for conteudo, nome in [
        (planilha, "arquivo.xls"), (planilha, "arquivo.pdf"), (planilha, "arquivo.csv"), (planilha, "ARQUIVO.XLSX"), (planilha, ".xlsx"),
        (planilha, "pasta/arquivo.xlsx"), (planilha, "arquivo.xlsx."), (planilha, "arquivo"), (velho, "arquivo.xlsx"), (velho, "a.b.XLS"),
        (pdf, "arquivo.PDF"), (pdf, "arquivo.xlsx"), (b"", "arquivo.xlsx"), (b"PK", "arquivo.xlsx"), (b"\xd0\xcf\x11\xe0", "arquivo.xls"),
        (b"%PDF", "arquivo.pdf"), (b"texto qualquer", "arquivo.xls"),
    ]:
        _registrar("documentos.ler_financeiro", ler, [conteudo, nome])
        _registrar("documentos.validar_conteudo", validar, [conteudo, nome])
    # Limites trocados, como os testes do original fazem.
    import src.domain.conciliacao_bancaria.apoio as apoio

    for modulo, constante, valor, conteudo, nome in [
        (doc, "MAX_LINHAS_FINANCEIRO", 2, dict(casos)["pagamentos.xlsx"], "a.xlsx"),
        (doc, "MAX_LINHAS_FINANCEIRO", 2, dict(casos)["titulos-cliente.xlsx"], "a.xlsx"),
        (doc, "MAX_LINHAS_FINANCEIRO", 1, dict(casos)["conciliado-base.pdf"], "a.pdf"),
        (doc, "MAX_PAGINAS_FINANCEIRO", 1, dict(casos)["conciliado-duas-paginas.pdf"], "a.pdf"),
        (doc, "MAX_CARACTERES_PAGINA", 50, dict(casos)["conciliado-duas-paginas.pdf"], "a.pdf"),
        (doc, "MAX_BYTES_FINANCEIRO", 100, dict(casos)["pagamentos.xlsx"], "a.xlsx"),
        (apoio, "MAX_LINHAS_APOIO", 3, dict(casos)["pagamentos.xls"], "a.xls"),
        (apoio, "MAX_COLUNAS_APOIO", 3, dict(casos)["pagamentos.xlsx"], "a.xlsx"),
        (apoio, "MAX_FOLHAS_APOIO", 1, dict(casos)["duas-folhas.xlsx"], "a.xlsx"),
        (apoio, "MAX_CELULAS_APOIO", 10, dict(casos)["pagamentos.xls"], "a.xls"),
    ]:
        anterior = getattr(modulo, constante)
        setattr(modulo, constante, valor)
        try:
            _registrar("documentos.ler_financeiro", ler, [conteudo, nome], opcoes=_opcoes_leitor())
            _registrar("documentos.validar_conteudo", validar, [conteudo, nome], opcoes=_opcoes_leitor())
        finally:
            setattr(modulo, constante, anterior)
    for nome in ("titulos-cliente.xlsx", "titulos-categorias.xlsx", "titulos-fornecedor.xls"):
        for folha, linhas in apoio._ler_folhas(dict(casos)[nome]):
            _registrar("titulos.ler_folha_titulos", lambda f, ls: ler_titulos(f, [tuple(l) for l in ls]), [folha, [list(l) for l in linhas]])
    for linhas, vinculos, tipo, versao, inicio, fim, opcoes in casos_sugestoes(sug):
        anterior = sug.MAX_COMPARACOES
        if opcoes:
            sug.MAX_COMPARACOES = opcoes["maxComparacoes"]
        try:
            _registrar("sugestoes.sugerir", lambda ls, vs, *resto: sugerir(ls, _como_vinculos(vs), *resto),
                       [sanitizar(linhas), vinculos, tipo, versao, inicio, fim], opcoes=opcoes)
        finally:
            sug.MAX_COMPARACOES = anterior
    chamadas_diretas(doc, sug)

    # Cada arquivo uma vez, com nome legível; a chamada aponta para ele.
    for sha, conteudo in conteudos.items():
        nome = nomes_de_arquivo.get(sha, f"fin-suite-{sha}")
        if "." not in nome:
            nome += ".xlsx" if conteudo[:2] == b"PK" else ".xls" if conteudo[:4] == b"\xd0\xcf\x11\xe0" else ".pdf" if conteudo[:4] == b"%PDF" else ".bin"
        nomes_de_arquivo[sha] = nome
        with open(os.path.join(pasta, nome), "wb") as f:
            f.write(conteudo)
    for r in chamadas.values():
        if r["args"] and isinstance(r["args"][0], dict) and "$arquivo" in r["args"][0]:
            r["args"][0] = {"$arquivo": nomes_de_arquivo[r["args"][0]["$arquivo"]]}

    registros = sorted(chamadas.values(), key=lambda r: (r["fn"], json.dumps(r["args"], ensure_ascii=False), json.dumps(r["kwargs"])))
    gravar(pasta, "financeiro-chamadas", [r for r in registros if not r["fn"].startswith("sugestoes.")])
    gravar(pasta, "sugestoes-chamadas", [r for r in registros if r["fn"].startswith("sugestoes.")])
    gravar_mupdf(pasta)


def gravar(pasta, prefixo, registros, limite=2_300_000):
    """Em pedaços de até ~2,3 MB: `<prefixo>-1.json`, `<prefixo>-2.json`..."""
    for antigo in os.listdir(pasta):
        if antigo.startswith(prefixo + "-") and antigo.endswith(".json"):
            os.remove(os.path.join(pasta, antigo))
    pedacos, atual, tamanho = [], [], 0
    for r in registros:
        t = len(json.dumps(r, ensure_ascii=False).encode()) + 2
        if atual and tamanho + t > limite:
            pedacos.append(atual)
            atual, tamanho = [], 0
        atual.append(r)
        tamanho += t
    if atual:
        pedacos.append(atual)
    por_fn: dict[str, int] = {}
    for r in registros:
        por_fn[r["fn"]] = por_fn.get(r["fn"], 0) + 1
    for i, pedaco in enumerate(pedacos, 1):
        with open(os.path.join(pasta, f"{prefixo}-{i}.json"), "w", encoding="utf-8", newline="\n") as f:
            json.dump(pedaco, f, ensure_ascii=False, indent=0)
    print(f"\ngabarito: {len(registros)} chamadas em {len(pedacos)} arquivo(s) {por_fn} -> {prefixo}")


def gravar_mupdf(pasta):
    """As palavras e o texto de cada página que o PyMuPDF tira dos PDFs do gabarito."""
    import pymupdf

    saida = {}
    for sha, conteudo in sorted(conteudos.items(), key=lambda x: nomes_de_arquivo[x[0]]):
        if conteudo[:4] != b"%PDF":
            continue
        try:
            with pymupdf.open(stream=conteudo, filetype="pdf") as pdf:
                saida[nomes_de_arquivo[sha]] = [
                    {"texto": pg.get_text(), "palavras": [[round(w[0], 3), round(w[1], 3), round(w[2], 3), round(w[3], 3), w[4]] for w in pg.get_text("words")]}
                    for pg in pdf
                ]
        except Exception:  # noqa: BLE001 — PDF quebrado de propósito
            continue
    with open(os.path.join(pasta, "mupdf-paginas.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(saida, f, ensure_ascii=False, indent=0)
    print(f"gabarito: {len(saida)} PDFs no PyMuPDF -> mupdf-paginas.json")


# ─── Conferência local ──────────────────────────────────────────────────────

def conferir(saida, arquivos):
    doc, _, _, _, _ = _modulos()
    resultado = {}
    for caminho in arquivos:
        with open(caminho, "rb") as f:
            conteudo = f.read()
        nome = os.path.basename(caminho)
        try:
            resultado[caminho] = {"result": codificar(doc.ler_financeiro(conteudo, nome))}
        except Exception as exc:  # noqa: BLE001
            resultado[caminho] = {"error": {"tipo": type(exc).__name__, "mensagem": str(exc)}}
    with open(saida, "w", encoding="utf-8") as f:
        json.dump(resultado, f, ensure_ascii=False)
    print(f"{len(arquivos)} arquivo(s) -> {saida}")


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "conferir":
        conferir(sys.argv[2], sys.argv[3:])
    else:
        print(__doc__)
        sys.exit(2)
