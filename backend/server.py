"""Radar Concursos — servidor (só biblioteca padrão do Python 3.9+).

    python3 backend/server.py            # sobe em http://localhost:5173

- Serve o site (pasta acima desta)
- Coleta agendada: PCI a cada 30 min, Diário Oficial a cada 10 min, bancas a cada 2 h
- API:  GET  /api/concursos   GET /api/sinais?termo=   GET /api/status   GET /api/stream (SSE)
        POST /api/alvos {"termo": "..."}   POST /api/coletar
"""
import json
import os
import queue
import sqlite3
import sys
import threading
import time
import traceback
import urllib.request
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import classificar as cl  # noqa: E402
import coletores as co  # noqa: E402
from comum import ALVOS_PADRAO, CONSULTAS_DOU_GERAIS, banca_para, carregar_env  # noqa: E402
from comum import municipios as _municipios  # noqa: E402

SITE = os.path.dirname(AQUI)
carregar_env(os.path.join(SITE, ".env"))
DADOS = os.path.join(AQUI, "dados")
os.makedirs(DADOS, exist_ok=True)
DB_PATH = os.path.join(DADOS, "radar.db")
PORT = int(os.environ.get("PORT", "5173"))
MIN = 60
INTERVALOS = {  # segundos
    "pci": int(os.environ.get("INTERVALO_PCI", 30 * MIN)),
    "dou": int(os.environ.get("INTERVALO_DOU", 10 * MIN)),
    "bancas": int(os.environ.get("INTERVALO_BANCAS", 120 * MIN)),
}
LOCK = threading.Lock()
CLIENTES = set()  # filas SSE


def log(*a):
    print(datetime.now().strftime("%H:%M:%S"), *a, flush=True)


# ------------------------------------------------------------------ banco
def db():
    c = sqlite3.connect(DB_PATH, check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


CON = db()
with LOCK:
    CON.executescript("""
    CREATE TABLE IF NOT EXISTS concursos (id TEXT PRIMARY KEY, dados TEXT, primeiro_visto TEXT, ultimo_visto TEXT, ativo INTEGER DEFAULT 1);
    CREATE TABLE IF NOT EXISTS sinais (id TEXT PRIMARY KEY, dados TEXT, termo TEXT, tipo TEXT, data TEXT, primeiro_visto TEXT);
    CREATE TABLE IF NOT EXISTS alvos (termo TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
    """)
    for t in ALVOS_PADRAO:
        CON.execute("INSERT OR IGNORE INTO alvos VALUES (?)", (t,))
    CON.commit()


def meta_set(k, v):
    with LOCK:
        CON.execute("INSERT OR REPLACE INTO meta VALUES (?,?)", (k, json.dumps(v)))
        CON.commit()


def meta_get(k, d=None):
    with LOCK:
        r = CON.execute("SELECT v FROM meta WHERE k=?", (k,)).fetchone()
    return json.loads(r["v"]) if r else d


def agora():
    return datetime.now().isoformat(timespec="seconds")


# ------------------------------------------------------------------ tempo real
def emitir(evento, dados):
    msg = f"event: {evento}\ndata: {json.dumps(dados, ensure_ascii=False)}\n\n"
    for q in list(CLIENTES):
        try:
            q.put_nowait(msg)
        except queue.Full:
            pass


# ------------------------------------------------------------------ municípios (IBGE)
def municipios():
    log("carregando municípios do IBGE…")
    return _municipios(DADOS)


MUNICIPIOS = None


# ------------------------------------------------------------------ coletas
def coletar_pci():
    global MUNICIPIOS
    MUNICIPIOS = MUNICIPIOS or municipios()
    itens = co.pci(MUNICIPIOS)
    hoje, ts = datetime.now().date().isoformat(), agora()
    with LOCK:
        carga_inicial = CON.execute("SELECT COUNT(*) FROM concursos").fetchone()[0] == 0
        existentes = {r["id"]: r["primeiro_visto"] for r in CON.execute("SELECT id, primeiro_visto FROM concursos")}
        novos = []
        for c in itens:
            primeiro = existentes.get(c["id"], ts)
            c["publicado"] = primeiro[:10] if c["id"] in existentes else hoje
            CON.execute("INSERT OR REPLACE INTO concursos VALUES (?,?,?,?,1)", (c["id"], json.dumps(c, ensure_ascii=False), primeiro, ts))
            if c["id"] not in existentes:
                novos.append(c)
        ids = [c["id"] for c in itens]
        if ids:  # o que sumiu da lista de abertos = inscrições encerradas
            CON.execute(f"UPDATE concursos SET ativo=0 WHERE id NOT IN ({','.join('?' * len(ids))})", ids)
        CON.commit()
    log(f"PCI: {len(itens)} abertos, {len(novos)} novos")
    if not carga_inicial:
        for c in novos:
            emitir("concurso", c)
    return len(itens)


def salvar_sinais(lista, tipo):
    novos = []
    ts = agora()
    with LOCK:
        for s in lista:
            s["tipo"] = tipo
            if CON.execute("SELECT 1 FROM sinais WHERE id=?", (s["id"],)).fetchone():
                continue
            CON.execute("INSERT INTO sinais VALUES (?,?,?,?,?,?)",
                        (s["id"], json.dumps(s, ensure_ascii=False), s.get("termo", ""), tipo, s.get("data", ""), ts))
            novos.append(s)
        CON.commit()
    return novos


def coletar_dou():
    primeira = not meta_get("dou_ok")
    total_novos = []
    for consulta, tipo in CONSULTAS_DOU_GERAIS:
        try:
            itens = [x for x in co.dou(consulta, "semana") if not co.RUIDO.search(x["titulo"] + " " + x["texto"])]
            if tipo == "autorizacao":
                itens = [x for x in itens if "autoriz" in (x["titulo"] + x["texto"]).lower()]
            total_novos += salvar_sinais(itens, tipo)
            log(f"DOU {consulta}: {len(itens)} relevantes")
        except Exception as e:
            log("DOU erro", consulta, e)
        co.pausa()
    with LOCK:
        termos = [r["termo"] for r in CON.execute("SELECT termo FROM alvos")]
    for t in termos:
        try:
            achados = co.dou_sinais(t, "ano")
            total_novos += salvar_sinais(achados, "alvo")
            log(f"DOU alvo '{t}': {len(achados)} relevantes")
        except Exception as e:
            log("DOU erro alvo", t, e)
        co.pausa()
    meta_set("dou_ok", True)
    log(f"DOU: {len(total_novos)} sinais novos")
    if not primeira:
        for s in total_novos:
            emitir("sinal", s)
    return len(total_novos)


def coletar_bancas():
    lista = []
    for f in (co.fgv, co.cesgranrio):
        try:
            lista += f()
        except Exception as e:
            log("banca erro", f.__name__, e)
        co.pausa()
    primeira = not meta_get("bancas_ok")
    novos = salvar_sinais(lista, "banca")
    meta_set("bancas_ok", True)
    meta_set("bancas_lista", lista)
    log(f"Bancas: {len(lista)} concursos listados, {len(novos)} novos")
    if not primeira:
        for s in novos:
            emitir("sinal", s)
    return len(lista)


JOBS = {"pci": coletar_pci, "dou": coletar_dou, "bancas": coletar_bancas}
RODANDO = set()


def rodar(nome):
    if nome in RODANDO:
        return
    RODANDO.add(nome)
    try:
        n = JOBS[nome]()
        st = meta_get("status", {})
        st[nome] = {"quando": agora(), "itens": n, "ok": True}
        meta_set("status", st)
        emitir("status", st)
    except Exception as e:
        traceback.print_exc()
        st = meta_get("status", {})
        st[nome] = {"quando": agora(), "ok": False, "erro": str(e)[:200]}
        meta_set("status", st)
    finally:
        RODANDO.discard(nome)


def agendador():
    proximo = {k: 0 for k in JOBS}
    while True:
        t = time.time()
        for nome, quando in proximo.items():
            if t >= quando:
                proximo[nome] = t + INTERVALOS[nome]
                threading.Thread(target=rodar, args=(nome,), daemon=True).start()
        time.sleep(5)


# ------------------------------------------------------------------ consultas
def listar_concursos():
    bancas = meta_get("bancas_lista", [])
    with LOCK:
        rows = CON.execute("SELECT dados FROM concursos WHERE ativo=1").fetchall()
    out = []
    for r in rows:
        c = json.loads(r["dados"])
        b, u = banca_para(c, bancas)
        if b:
            c["banca"], c["bancaUrl"] = b, u
        out.append(c)
    return out


def listar_sinais(termo, limite=20):
    nt = cl.norm(termo)
    with LOCK:
        rows = CON.execute("SELECT dados, termo FROM sinais ORDER BY data DESC, primeiro_visto DESC").fetchall()
    out = []
    for r in rows:
        s = json.loads(r["dados"])
        if not nt or cl.norm(r["termo"]) == nt or nt in cl.norm(s.get("titulo", "") + " " + s.get("texto", "") + " " + s.get("orgao", "")):
            out.append(s)
        if len(out) >= limite:
            break
    return out


# ------------------------------------------------------------------ HTTP
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=SITE, **k)

    def end_headers(self):
        # site sempre revalida: evita o navegador mostrar JS/CSS antigos
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "/api/" in str(args[0] if args else ""):
            return
        super().log_message(fmt, *args)

    def _json(self, obj, code=200):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if u.path == "/api/concursos":
            return self._json(listar_concursos())
        if u.path == "/api/sinais":
            lim = min(int(q.get("limite", ["20"])[0] or 20), 1000)
            return self._json(listar_sinais(q.get("termo", [""])[0], lim))
        if u.path == "/api/status":
            with LOCK:
                n = CON.execute("SELECT COUNT(*) FROM concursos WHERE ativo=1").fetchone()[0]
            return self._json({"status": meta_get("status", {}), "concursos": n, "rodando": sorted(RODANDO),
                               "intervalos": INTERVALOS})
        if u.path == "/api/stream":
            return self._stream()
        return super().do_GET()

    def do_POST(self):
        u = urlparse(self.path)
        n = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            body = {}
        if u.path == "/api/alvos":
            termo = str(body.get("termo", "")).strip()[:120]
            if len(termo) < 2:
                return self._json({"erro": "termo curto"}, 400)
            with LOCK:
                novo = CON.execute("INSERT OR IGNORE INTO alvos VALUES (?)", (termo,)).rowcount
                CON.commit()
            if novo:  # busca imediata no DOU para o alvo novo
                threading.Thread(target=lambda: salvar_sinais(co.dou_sinais(termo, "ano"), "alvo"), daemon=True).start()
            return self._json({"ok": True, "novo": bool(novo)})
        if u.path == "/api/coletar":
            for nome in JOBS:
                threading.Thread(target=rodar, args=(nome,), daemon=True).start()
            return self._json({"ok": True})
        self.send_error(404)

    def _stream(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        q = queue.Queue(maxsize=200)
        CLIENTES.add(q)
        try:
            self.wfile.write(b": conectado\n\n")
            self.wfile.flush()
            while True:
                try:
                    msg = q.get(timeout=20)
                except queue.Empty:
                    msg = ": ping\n\n"
                self.wfile.write(msg.encode())
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            CLIENTES.discard(q)


def main():
    if os.environ.get("SEM_COLETA") != "1":
        threading.Thread(target=agendador, daemon=True).start()
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    srv.daemon_threads = True
    log(f"Radar Concursos em http://localhost:{PORT}")
    srv.serve_forever()


if __name__ == "__main__":
    main()
