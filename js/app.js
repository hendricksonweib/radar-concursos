/* Radar Concursos — protótipo (vanilla JS + D3) */
(() => {
  "use strict";

  // ---------- Constantes ----------
  const HOJE = new Date();
  const IBGE = "https://servicodados.ibge.gov.br/api";
  const STATUS = { previsto: "Previsto", autorizado: "Autorizado", banca_definida: "Banca definida", edital_aberto: "Edital aberto", encerrado: "Encerrado" };
  const ESFERA = { federal: "Federal", estadual: "Estadual", municipal: "Municipal", estatal: "Estatal", sistema_s: "Sistema S", privada: "Privada" };
  const NIVEIS = ["Fundamental", "Médio", "Superior"];
  const ETAPAS = ["Sem previsão", "Pedido feito", "Autorizado", "Banca definida", "Edital publicado"];
  const STATUS_ETAPA = { previsto: 1, autorizado: 2, banca_definida: 3, edital_aberto: 4, encerrado: 4 };
  const CARGO_ALVO = { ABIN: "Oficial de Inteligência", BACEN: "Analista do Banco Central", Itamaraty: "Diplomata", Senado: "Consultor Legislativo", CGU: "Auditor Federal de Finanças e Controle", RFB: "Auditor-Fiscal" };
  const UF_BY_SIGLA = Object.fromEntries(Object.entries(UF_INFO).map(([cod, [s, n]]) => [s, { cod, nome: n }]));
  const PAGE = 30;

  // ---------- Armazenamento ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("rc:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("rc:" + k, JSON.stringify(v)); } catch { /* ignore */ } },
  };

  // ---------- Estado ----------
  const S = {
    concursos: [...CONCURSOS_BASE, ...CONCURSOS_MUNICIPAIS],
    favs: new Set(store.get("favs", [])),
    alvo: store.get("alvo", null), // usuário novo começa sem alvo
    notifs: store.get("notifs", []),
    modo: "demo", sinais: [], coleta: null, // modo "real" quando há dados coletados
    tab: "todos",
    q: "", salary: 0, tipo: "",
    nivel: new Set(), esfera: new Set(), status: new Set(), area: new Set(),
    sort: "recentes", uf: null, mun: null, limit: PAGE,
    fresh: new Set(),
  };
  const CFG = window.RADAR_CONFIG || {};
  let fonte = null, dadosBase = "", sinaisTodos = []; // fonte: "api" (servidor local) | "json" (arquivos estáticos)
  const AREAS = [...new Set(S.concursos.flatMap(c => c.cargos.map(x => x.area)))].sort((a, b) => a.localeCompare(b, "pt"));

  // ---------- Utilidades ----------
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const norm = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const brl = n => "R$ " + Math.round(n).toLocaleString("pt-BR");
  const num = n => n.toLocaleString("pt-BR");
  const fmtDate = iso => new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
  const daysLeft = iso => Math.ceil((new Date(iso + "T23:59:59") - HOJE) / 864e5);
  // Catálogo de alvos: órgãos monitorados + todo órgão que já tem concurso na base + os que a pessoa digitou
  const alvosCustom = store.get("alvosCustom", []);
  function alvoDeConcurso(c) {
    const top = c.cargos.reduce((m, x) => x.salario > m.salario ? x : m);
    return { sigla: c.sigla, nome: c.orgao, area: top.area, nivel: top.nivel, salarioRef: top.salario,
      ultimoEdital: +(c.publicado || "2026").slice(0, 4), etapa: STATUS_ETAPA[c.status] || 0, sinais: [], cargo: top.nome };
  }
  function catalogoAlvos() {
    const seen = new Set(), out = [];
    const add = a => { if (!seen.has(a.sigla)) { seen.add(a.sigla); out.push(a); } };
    ALVOS.forEach(add);
    alvosCustom.forEach(add);
    S.concursos.forEach(c => add(alvoDeConcurso(c)));
    return out;
  }
  let alvoCache = { k: "", v: null };
  const alvoInfo = () => {
    if (!S.alvo) return null;
    const k = S.alvo + "|" + S.concursos.length + "|" + alvosCustom.length;
    if (alvoCache.k !== k) alvoCache = { k, v: catalogoAlvos().find(a => a.sigla === S.alvo) || null };
    return alvoCache.v;
  };
  const termoAlvo = a => (a.custom ? a.sigla : a.nome);
  const isAlvo = c => {
    if (!alvoInfo()) return false;
    if (c.sigla === S.alvo) return true;
    const t = norm(termoAlvo(alvoInfo()));
    return t.length > 5 && norm(c.orgao + " " + c.sigla).includes(t);
  };

  // ---------- Filtro ----------
  function matchCargos(c, { ignoreGeo = false, ignoreTab = false } = {}) {
    if (!ignoreTab && S.tab === "favoritos" && !S.favs.has(c.id)) return null;
    if (S.tipo && c.tipo !== S.tipo) return null;
    if (S.esfera.size && !S.esfera.has(c.esfera)) return null;
    if (S.status.size && !S.status.has(c.status)) return null;
    if (!ignoreGeo) {
      if (S.uf && !c.ufs.includes(S.uf)) return null;
      if (S.mun && c.mun !== S.mun) return null;
    }
    const q = norm(S.q.trim());
    const orgHit = q && norm(c.orgao + " " + c.sigla).includes(q);
    const cargos = c.cargos.filter(x =>
      (!q || orgHit || norm(x.nome).includes(q)) &&
      x.salario >= S.salary &&
      (!S.nivel.size || S.nivel.has(x.nivel)) &&
      (!S.area.size || S.area.has(x.area)));
    return cargos.length ? cargos : null;
  }

  function similarity(c) {
    const a = alvoInfo();
    if (!a || isAlvo(c) || c.status === "encerrado") return 0;
    const viz = AREAS_SIMILARES[a.area] || [];
    let best = 0;
    for (const x of c.cargos) {
      const areaPts = x.area === a.area ? 3 : viz.includes(x.area) ? 2 : 0;
      if (!areaPts) continue;
      best = Math.max(best, areaPts + (x.nivel === a.nivel ? 1 : 0) + (x.salario >= a.salarioRef * 0.6 ? 1 : 0));
    }
    return best;
  }
  const isSimilar = c => similarity(c) >= 4;

  // ---------- Notificações ----------
  function notify(kind, title, text, cid) {
    const n = { id: Date.now() + Math.random(), kind, title, text, cid, at: new Date().toISOString(), read: false };
    S.notifs.unshift(n);
    S.notifs = S.notifs.slice(0, 60);
    store.set("notifs", S.notifs);
    renderBell();
    if (kind === "alvo" && S.view !== "alvo") $("#alvoDot").hidden = false;
    toast(n);
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body: text, tag: String(n.id) });
      }
    } catch { /* ignore */ }
  }
  const KIND = { alvo: "Seu alvo", similar: "Parecido com seu alvo", fav: "Favorito atualizado", novo: "Novo edital" };
  function toast(n) {
    const el = document.createElement("div");
    el.className = "toast " + n.kind;
    el.innerHTML = `<span class="k ${n.kind}">${KIND[n.kind]}</span><p><b>${esc(n.title)}</b></p><p class="muted">${esc(n.text)}</p>`;
    el.onclick = () => { el.remove(); if (n.cid) openDetail(n.cid); };
    $("#toasts").prepend(el);
    setTimeout(() => el.remove(), n.kind === "alvo" ? 12000 : 7000);
  }
  function renderBell() {
    const unread = S.notifs.filter(n => !n.read).length;
    const b = $("#bellBadge");
    b.hidden = !unread; b.textContent = unread > 9 ? "9+" : unread;
  }
  function renderNotifs() {
    $("#notifList").innerHTML = S.notifs.length ? S.notifs.map(n => `
      <div class="notif ${n.read ? "" : "unread"}" data-cid="${esc(n.cid || "")}">
        <span class="k ${n.kind}">${KIND[n.kind]}</span>
        <p><b>${esc(n.title)}</b></p><p class="muted">${esc(n.text)}</p>
        <time>${new Date(n.at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
      </div>`).join("") : `<div class="empty"><h3>Tudo em dia</h3>Você será avisado aqui quando sair algo do seu interesse.</div>`;
  }
  function renderPushBtn() {
    const b = $("#btnPush");
    const p = "Notification" in window ? Notification.permission : "unsupported";
    b.textContent = p === "granted" ? "● Notificações ativas" : p === "denied" ? "Notificações bloqueadas" : "Ativar notificações";
    b.classList.toggle("on", p === "granted");
  }

  // ---------- Hero ----------
  function renderHero() {
    const abertos = S.concursos.filter(c => c.status === "edital_aberto");
    const vagas = abertos.reduce((s, c) => s + c.cargos.reduce((t, x) => t + x.vagas, 0), 0);
    const maior = Math.max(...abertos.flatMap(c => c.cargos.map(x => x.salario)));
    const prev = S.concursos.filter(c => ["previsto", "autorizado", "banca_definida"].includes(c.status)).length;
    const terceiro = S.modo === "real" ? `<b class="r">${num(S.sinaisDou || 0)}</b> sinais no Diário Oficial` : `<b class="r">${num(prev)}</b> previstos`;
    $("#heroStats").innerHTML = `<b>${num(abertos.length)}</b> inscrições abertas · <b>${num(vagas)}</b> vagas · ${terceiro} · salários até <b class="b">${brl(abertos.length ? maior : 0)}</b>`;
    const ult = S.coleta && (S.coleta.gerado || (S.coleta.status && S.coleta.status.pci && S.coleta.status.pci.quando));
    $("#lastUpdate").textContent = S.modo === "real"
      ? (ult ? "atualizado às " + new Date(ult).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "coletando…")
      : "dados de demonstração";
  }

  // ---------- Alvo ----------
  function renderTarget() {
    const a = alvoInfo();
    if (!a) {
      $("#targetCard").innerHTML = `
        <div class="target-empty">
          <div>
            <div class="eyebrow">Seu alvo</div>
            <div class="target-name">Qual concurso você quer passar?</div>
            <p class="muted">Escolha um órgão ou cargo. A gente vigia o Diário Oficial e as bancas e te avisa no primeiro sinal de edital, além de destacar concursos parecidos.</p>
          </div>
          <button class="btn" id="changeTarget" type="button">◎ Escolher meu alvo</button>
        </div>`;
      return;
    }
    const live = S.concursos.find(c => isAlvo(c) && c.status !== "encerrado");
    // modo real: só avança com evidência (autorização no DOU → 2, banca listando → 3, inscrições abertas → 4)
    const etapa = live ? STATUS_ETAPA[live.status]
      : S.modo !== "real" ? a.etapa
      : S.sinais.some(x => x.tipo === "banca") ? 3 : S.sinais.some(x => /autoriz/i.test(x.titulo + x.texto)) ? 2 : S.sinais.length ? 1 : 0;
    const anos = HOJE.getFullYear() - a.ultimoEdital;
    const aberto = live && live.status === "edital_aberto";
    const base = S.modo === "real" ? S.sinais.slice(0, 5) : a.sinais;
    const sinais = base.length ? base : [{ data: HOJE.toISOString().slice(0, 10), fonte: "Radar", texto: live ? `Inscrições abertas: ${live.titulo || live.orgao}` : `Nada sobre "${termoAlvo(a)}" no Diário Oficial nem nas bancas no último ano` }];
    $("#targetCard").innerHTML = `
      <div class="target-top">
        <div>
          <div class="eyebrow">Seu alvo</div>
          <div class="target-name">${esc(a.sigla)}<small>${a.custom ? "Alvo personalizado · monitorando pelo nome" : `${esc(a.nome)} · ${esc(a.cargo || CARGO_ALVO[a.sigla] || a.area)} · ref. ${brl(a.salarioRef)}`}</small></div>
        </div>
        <span class="target-alert ${aberto ? "ok" : ""}">${aberto ? "● Edital aberto agora" : anos > 0 ? `Sem edital há ${anos} ${anos === 1 ? "ano" : "anos"} (último: ${a.ultimoEdital})` : "Edital recente"}</span>
      </div>
      <div class="steps">${ETAPAS.map((e, i) => `<div class="step ${i < etapa ? "done" : i === etapa ? "current" : ""}"><div class="bar"></div><span>${e}</span></div>`).join("")}</div>
      <div class="target-grid">
        <div>
          <div class="eyebrow" style="margin-bottom:6px">Últimos sinais detectados</div>
          <ul class="signals">${sinais.map(s => `<li><time>${fmtDate(s.data)}</time><span class="src">${esc(s.fonte)}</span><br>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.titulo || s.texto)}</a><div class="muted" style="font-size:13px">${esc(s.titulo ? s.texto : "")}</div>` : esc(s.texto)}</li>`).join("")}</ul>
        </div>
        <div class="priority">
          <b>Alerta prioritário ligado</b>
          <ul>
            ${fonte === "json"
              ? `<li>Diário Oficial da União checado a cada ~15 min</li>
            <li>Inscrições abertas (PCI) a cada 30 min · bancas FGV e Cesgranrio a cada 2 h</li>`
              : `<li>Diário Oficial da União checado a cada 10 min</li>
            <li>Inscrições abertas (PCI) a cada 30 min · bancas FGV e Cesgranrio a cada 2 h</li>`}
            <li>Aviso na hora por notificação do navegador</li>
          </ul>
          <div class="row">
            <button class="btn small" id="changeTarget" type="button">Trocar alvo</button>
            ${aberto && live ? `<button class="btn ghost small" data-open="${live.id}" type="button">Ver edital</button>` : `<button class="btn ghost small" id="simulateTarget" type="button">Testar aviso</button>`}
          </div>
        </div>
      </div>`;
  }

  function renderSimilar() {
    const a = alvoInfo();
    $(".similar").hidden = !a;
    if (!a) return;
    const list = S.concursos.filter(isSimilar)
      .sort((x, y) => similarity(y) - similarity(x) || (x.status === "edital_aberto" ? -1 : 1))
      .slice(0, 10);
    $("#similarHint").textContent = a.area ? `Mesma área (${a.area}) ou vizinhas, nível e salário parecidos` : "Escolha um alvo da base para ver parecidos";
    $("#similarRow").innerHTML = list.map(c => {
      const top = c.cargos.reduce((m, x) => x.salario > m.salario ? x : m);
      return `<div class="card mini" data-open="${c.id}">
        <div class="why">${c.status === "edital_aberto" ? "● Inscrições abertas" : STATUS[c.status]}</div>
        <div class="t">${esc(c.sigla)} — ${esc(top.nome)}</div>
        <div class="muted" style="font-size:13px">${esc(top.area)} · ${esc(top.nivel)} · ${locLabel(c)}</div>
        <div class="s">${brl(top.salario)}</div>
      </div>`;
    }).join("") || `<div class="muted">Nada parecido aberto agora — avisaremos quando surgir.</div>`;
  }

  // ---------- Filtros UI ----------
  function chipGroup(el, values, set, labels) {
    el.innerHTML = values.map(v => `<button class="chip ${set.has(v) ? "on" : ""}" data-v="${esc(v)}" type="button">${esc(labels ? labels[v] : v)}</button>`).join("");
    el.onclick = e => {
      const b = e.target.closest(".chip"); if (!b) return;
      const v = b.dataset.v; set.has(v) ? set.delete(v) : set.add(v);
      b.classList.toggle("on"); S.limit = PAGE; refresh();
    };
  }
  function initFilters() {
    chipGroup($("#fNivel"), NIVEIS, S.nivel);
    chipGroup($("#fEsfera"), Object.keys(ESFERA), S.esfera, ESFERA);
    chipGroup($("#fStatus"), Object.keys(STATUS), S.status, STATUS);
    chipGroup($("#fArea"), AREAS, S.area);
    let t;
    $("#q").addEventListener("input", e => { clearTimeout(t); t = setTimeout(() => { S.q = e.target.value; S.limit = PAGE; refresh(); }, 120); });
    $("#salary").addEventListener("input", e => {
      S.salary = +e.target.value;
      $("#salaryVal").textContent = S.salary ? "a partir de " + brl(S.salary) : "qualquer";
      S.limit = PAGE; refresh();
    });
    $("#fTipo").onclick = e => {
      const b = e.target.closest("button"); if (!b) return;
      $("#fTipo").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
      S.tipo = b.dataset.v; S.limit = PAGE; refresh();
    };
    $("#sort").onchange = e => { S.sort = e.target.value; refresh(); };
    $("#clearFilters").onclick = () => {
      Object.assign(S, { q: "", salary: 0, tipo: "", limit: PAGE });
      [S.nivel, S.esfera, S.status, S.area].forEach(s => s.clear());
      $("#q").value = ""; $("#salary").value = 0; $("#salaryVal").textContent = "qualquer";
      $("#fTipo").querySelectorAll("button").forEach((x, i) => x.classList.toggle("on", i === 0));
      document.querySelectorAll(".chip.on").forEach(x => x.classList.remove("on"));
      refresh();
    };
    document.querySelectorAll(".tab").forEach(t => t.onclick = () => {
      document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === t));
      S.tab = t.dataset.tab; S.limit = PAGE; refresh();
    });
    $("#more").onclick = () => { S.limit += PAGE; renderList(); };
  }

  // ---------- Lista ----------
  function locLabel(c) {
    if (c.mun) return `${esc(c.munNome)}/${c.ufs[0]}`;
    if (c.ufs.length >= 20) return "Nacional";
    if (c.ufs.length > 3) return `${c.ufs.length} estados`;
    return c.ufs.join(", ");
  }
  function sortList(arr) {
    const by = {
      recentes: (a, b) => (b.c.publicado || "").localeCompare(a.c.publicado || ""),
      salario: (a, b) => b.max - a.max,
      vagas: (a, b) => b.vagas - a.vagas,
      prazo: (a, b) => (a.c.inscricoesAte || "9999").localeCompare(b.c.inscricoesAte || "9999"),
    }[S.sort];
    return arr.sort((a, b) => (isAlvo(b.c) - isAlvo(a.c)) || (S.fresh.has(b.c.id) - S.fresh.has(a.c.id)) || by(a, b));
  }
  function itemHTML({ c, cargos, max, vagas }) {
    const fav = S.favs.has(c.id), sim = isSimilar(c), alvo = isAlvo(c);
    const niveis = [...new Set(cargos.map(x => x.nivel))].join(" / ");
    let prazo;
    if (c.status === "edital_aberto" && c.inscricoesAte) {
      const d = daysLeft(c.inscricoesAte);
      prazo = `<div class="deadline ${d <= 7 ? "urgent" : ""}">Inscrições até ${fmtDate(c.inscricoesAte)}<br>${d < 0 ? "prazo vencido — confira prorrogação" : d === 0 ? "último dia" : d === 1 ? "falta 1 dia" : `faltam ${d} dias`}</div>`;
    } else prazo = `<div class="deadline muted">${c.banca ? "Banca: " + esc(c.banca) : "Banca a definir"}</div>`;
    return `<article class="card item ${sim ? "similar" : ""} ${alvo ? "is-target" : ""} ${S.fresh.has(c.id) ? "fresh" : ""}" data-open="${c.id}">
      <div class="item-top">
        <div>
          <div class="org">${esc(c.orgao)}</div>
          <div class="title">${(() => { const nomes = [...new Set(cargos.map(x => x.nome))]; return nomes.slice(0, 2).map(esc).join(" · ") + (nomes.length > 2 ? ` <span class="muted">+${nomes.length - 2}</span>` : ""); })()}</div>
        </div>
        <button class="star ${fav ? "on" : ""}" data-fav="${c.id}" type="button" aria-label="${fav ? "Remover dos favoritos" : "Favoritar"}" aria-pressed="${fav}">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="${fav ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>
        </button>
      </div>
      <div class="meta">
        ${alvo ? `<span class="tag tgt">◎ Seu alvo</span>` : ""}
        <span class="tag st-${c.status}">${STATUS[c.status]}</span>
        ${sim ? `<span class="tag hot">★ Parecido com ${esc(S.alvo)}</span>` : ""}
        <span class="tag">${ESFERA[c.esfera]}</span>
        <span class="tag">${locLabel(c)}</span>
        <span class="tag">${niveis}</span>
      </div>
      <div class="item-bottom">
        <div class="money"><small>${max ? (cargos.length > 1 || c.resumo ? "até" : "salário") : "salário"}${vagas ? ` · ${num(vagas)} vagas` : ""}</small>${max ? brl(max) : `<span style="font-size:16px">ver edital</span>`}</div>
        ${prazo}
      </div>
    </article>`;
  }
  function renderList() {
    const rows = [];
    for (const c of S.concursos) {
      const cargos = matchCargos(c);
      if (cargos) rows.push({ c, cargos, max: Math.max(...cargos.map(x => x.salario)), vagas: cargos.reduce((s, x) => s + x.vagas, 0) });
    }
    sortList(rows);
    const where = S.mun ? munName(S.mun) : S.uf ? UF_BY_SIGLA[S.uf].nome : "todo o Brasil";
    $("#resultCount").textContent = `${num(rows.length)} ${rows.length === 1 ? "concurso" : "concursos"} em ${where}`;
    $("#list").innerHTML = rows.length ? rows.slice(0, S.limit).map(itemHTML).join("") :
      S.tab === "favoritos" ? `<div class="card empty"><h3>Nenhum favorito aqui</h3>Toque na estrela de um concurso para acompanhar e ser avisado de cada mudança.</div>`
        : `<div class="card empty"><h3>Nada encontrado</h3>Tente afrouxar os filtros ou a meta salarial.</div>`;
    $("#more").hidden = rows.length <= S.limit;
    $("#favCount").textContent = S.concursos.filter(c => S.favs.has(c.id)).length;
  }

  // ---------- Mapa ----------
  const map = { br: null, munGeo: {}, munNames: {}, svg: null, w: 600, h: 570 };
  const munName = cod => map.munNames[cod] || (S.concursos.find(c => c.mun === cod) || {}).munNome || "Município";

  async function getJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return r.json(); }
  // IBGE usa anéis anti-horários (RFC 7946); o D3 espera o contrário. Invertemos quando a área "explode".
  function rewind(fc) {
    for (const f of fc.features) {
      if (d3.geoArea(f) > 2 * Math.PI) {
        const g = f.geometry;
        if (g.type === "Polygon") g.coordinates.forEach(r => r.reverse());
        else if (g.type === "MultiPolygon") g.coordinates.forEach(p => p.forEach(r => r.reverse()));
      }
    }
    return fc;
  }
  async function loadBR() {
    if (!map.br) map.br = rewind(await getJSON(`${IBGE}/v3/malhas/paises/BR?formato=application/vnd.geo%2Bjson&intrarregiao=UF&qualidade=minima`));
    return map.br;
  }
  async function loadUF(sigla) {
    const cod = UF_BY_SIGLA[sigla].cod;
    if (!map.munGeo[sigla]) {
      const [geo, names] = await Promise.all([
        getJSON(`${IBGE}/v3/malhas/estados/${cod}?formato=application/vnd.geo%2Bjson&intrarregiao=municipio&qualidade=minima`),
        getJSON(`${IBGE}/v1/localidades/estados/${cod}/municipios`).catch(() => []),
      ]);
      map.munGeo[sigla] = rewind(geo);
      names.forEach(m => { map.munNames[m.id] = m.nome; });
    }
    return map.munGeo[sigla];
  }

  function countsByUF() {
    const m = {};
    for (const c of S.concursos) if (matchCargos(c, { ignoreGeo: true })) for (const u of c.ufs) m[u] = (m[u] || 0) + 1;
    return m;
  }
  function countsByMun(uf) {
    const m = {};
    for (const c of S.concursos) if (c.mun && c.ufs[0] === uf && matchCargos(c, { ignoreGeo: true })) m[c.mun] = (m[c.mun] || 0) + 1;
    return m;
  }

  function colorScale(min, max) {
    const lo = Math.max(0, min - 1);
    return d3.scaleSequential([lo, Math.max(lo + 1, max)], d3.interpolateRgb("#1F3B31", "#6EE7B7"));
  }

  let mapToken = 0;
  async function renderMap() {
    const token = ++mapToken;
    const svg = d3.select("#map");
    const box = $(".map-wrap").getBoundingClientRect();
    map.w = box.width || 600; map.h = box.height || 570;
    svg.attr("viewBox", `0 0 ${map.w} ${map.h}`);
    $("#mapLoading").hidden = false;
    let geo, counts, keyOf, nameOf;
    try {
      if (!S.uf) {
        geo = await loadBR();
        counts = countsByUF();
        keyOf = f => UF_INFO[f.properties.codarea][0];
        nameOf = f => UF_INFO[f.properties.codarea][1];
      } else {
        geo = await loadUF(S.uf);
        counts = countsByMun(S.uf);
        keyOf = f => +f.properties.codarea;
        nameOf = f => munName(+f.properties.codarea);
      }
    } catch (err) {
      if (token !== mapToken) return;
      $("#mapLoading").textContent = "Não foi possível carregar o mapa do IBGE. Verifique a conexão.";
      return;
    }
    if (token !== mapToken) return; // um render mais novo já começou
    $("#mapLoading").hidden = true;
    const proj = d3.geoMercator().fitExtent([[10, 10], [map.w - 10, map.h - 10]], geo);
    const path = d3.geoPath(proj);
    const max = d3.max(Object.values(counts)) || 1;
    const min = d3.min(Object.values(counts)) || 0;
    const color = colorScale(min, max);
    const selKey = S.uf && S.mun ? S.mun : null;

    svg.classed("has-sel", !!selKey);
    const paths = svg.selectAll("path").data(geo.features, f => f.properties.codarea);
    paths.exit().remove();
    paths.enter().append("path")
      .merge(paths)
      .attr("d", path)
      .attr("fill", f => counts[keyOf(f)] ? color(counts[keyOf(f)]) : "#24221F")
      .classed("sel", f => selKey != null && keyOf(f) === selKey)
      .on("mousemove", (ev, f) => {
        const [x, y] = d3.pointer(ev, $(".map-wrap"));
        const n = counts[keyOf(f)] || 0;
        const tt = $("#tooltip");
        tt.hidden = false; tt.style.left = x + "px"; tt.style.top = y + "px";
        tt.innerHTML = `<b>${esc(nameOf(f))}</b>${n} ${n === 1 ? "concurso" : "concursos"}${S.uf ? " municipais" : ""}`;
      })
      .on("mouseleave", () => { $("#tooltip").hidden = true; })
      .on("click", (ev, f) => {
        $("#tooltip").hidden = true;
        if (!S.uf) selectUF(keyOf(f));
        else selectMun(keyOf(f) === S.mun ? null : keyOf(f));
      });

    // rótulos (siglas dos estados)
    const labels = svg.selectAll("text").data(S.uf ? [] : geo.features, f => f.properties.codarea);
    labels.exit().remove();
    labels.enter().append("text").attr("text-anchor", "middle").attr("dy", "0.35em")
      .merge(labels)
      .attr("x", f => path.centroid(f)[0]).attr("y", f => path.centroid(f)[1])
      .text(f => keyOf(f));

    // legenda
    $("#legend").innerHTML = `<span>${min}</span><span class="ramp" style="background:linear-gradient(90deg,${color(min)},${color(max)})"></span><span>${max}</span>`;

    renderRanking(counts, geo, keyOf, nameOf, max);
    renderCrumbs();
  }

  function renderRanking(counts, geo, keyOf, nameOf, max) {
    const rows = geo.features.map(f => ({ k: keyOf(f), name: nameOf(f), n: counts[keyOf(f)] || 0 }))
      .filter(r => r.n > 0).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "pt"));
    $("#rankingTitle").textContent = S.uf ? `Municípios de ${UF_BY_SIGLA[S.uf].nome} com concurso` : "Por estado";
    $("#ranking").innerHTML = rows.map(r => `
      <li data-k="${r.k}" class="${(S.uf ? S.mun : null) === r.k ? "sel" : ""}"><span>${esc(r.name)}</span><span class="meter"><i style="width:${(r.n / max) * 100}%"></i></span><span class="n">${r.n}</span></li>`).join("")
      || `<li style="cursor:default"><span class="muted">Nenhum concurso municipal com esses filtros.</span></li>`;
    $("#ranking").onclick = e => {
      const li = e.target.closest("li[data-k]"); if (!li) return;
      if (!S.uf) selectUF(li.dataset.k); else selectMun(+li.dataset.k === S.mun ? null : +li.dataset.k);
    };
  }

  function renderCrumbs() {
    const parts = [`<button data-go="br" type="button">Brasil</button>`];
    if (S.uf) {
      parts.push(`<span class="sep">›</span>`);
      parts.push(S.mun ? `<button data-go="uf" type="button">${esc(UF_BY_SIGLA[S.uf].nome)}</button>` : `<span class="cur">${esc(UF_BY_SIGLA[S.uf].nome)}</span>`);
    }
    if (S.mun) parts.push(`<span class="sep">›</span><span class="cur">${esc(munName(S.mun))}</span>`);
    if (!S.uf) parts[0] = `<span class="cur">Brasil</span><span class="muted" style="font-size:13px">· toque num estado</span>`;
    $("#crumbs").innerHTML = parts.join("");
    $("#crumbs").onclick = e => {
      const b = e.target.closest("button[data-go]"); if (!b) return;
      if (b.dataset.go === "br") selectUF(null); else selectMun(null);
    };
  }

  function selectUF(uf) { S.uf = uf; S.mun = null; S.limit = PAGE; d3.select("#map").selectAll("*").remove(); refresh(); }
  function selectMun(mun) { S.mun = mun; S.limit = PAGE; refresh(); }

  // ---------- Detalhe ----------
  function openDetail(id) {
    const c = S.concursos.find(x => x.id === id); if (!c) return;
    const fav = S.favs.has(c.id);
    const podeAlvo = !isAlvo(c);
    $("#detailTitle").textContent = c.sigla;
    $("#detailBody").innerHTML = `
      <div class="detail-sec">
        <div class="muted">${esc(c.orgao)}</div>
        <div class="meta" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
          <span class="tag st-${c.status}">${STATUS[c.status]}</span>
          ${isSimilar(c) ? `<span class="tag hot">★ Parecido com ${esc(S.alvo)}</span>` : ""}
          ${isAlvo(c) ? `<span class="tag tgt">◎ Seu alvo</span>` : ""}
        </div>
      </div>
      <div class="detail-sec kv">
        <div><span>Esfera</span>${ESFERA[c.esfera]} · ${c.tipo === "publico" ? "Público" : "Privado / estatal"}</div>
        <div><span>Banca</span>${esc(c.banca || "A definir")}</div>
        <div><span>Publicado em</span>${c.publicado ? fmtDate(c.publicado) : "—"}</div>
        <div><span>Inscrições até</span>${c.inscricoesAte ? fmtDate(c.inscricoesAte) + ` (${daysLeft(c.inscricoesAte)} dias)` : "—"}</div>
        <div style="grid-column:1/-1"><span>Lotação</span>${c.mun ? esc(c.munNome) + "/" + c.ufs[0] : c.ufs.length >= 20 ? "Todos os estados" : c.ufs.join(", ")}</div>
      </div>
      <div class="detail-sec">
        <h4>Cargos</h4>
        <table><thead><tr><th>Cargo</th><th>Nível</th><th class="r">Vagas</th><th class="r">Salário</th></tr></thead>
        <tbody>${c.cargos.map(x => `<tr><td>${esc(x.nome)}<br><span class="muted" style="font-size:12px">${esc(x.area)}</span></td><td>${x.nivel}</td><td class="r">${num(x.vagas)}</td><td class="r">${brl(x.salario)}</td></tr>`).join("")}</tbody></table>
      </div>
      <div class="actions">
        <button class="btn" data-fav="${c.id}" type="button">${fav ? "★ Nos favoritos" : "☆ Favoritar e ser avisado"}</button>
        ${podeAlvo ? `<button class="btn ghost" data-setalvo="${esc(c.sigla)}" type="button">◎ Tornar meu alvo</button>` : ""}
        ${c.url ? `<a class="btn ghost" href="${esc(c.url)}" target="_blank" rel="noopener">Ver na fonte (${esc(c.fonte || "")})</a>` : ""}${c.bancaUrl ? `<a class="btn ghost" href="${esc(c.bancaUrl)}" target="_blank" rel="noopener">Página na ${esc(c.banca)}</a>` : ""}
      </div>`;
    openDrawer("#detailDrawer");
  }

  function openDrawer(sel) {
    document.querySelectorAll(".drawer.open").forEach(d => d.classList.remove("open"));
    $(sel).classList.add("open"); $(sel).setAttribute("aria-hidden", "false"); $("#scrim").hidden = false;
  }
  function closeDrawers() {
    document.querySelectorAll(".drawer").forEach(d => { d.classList.remove("open"); d.setAttribute("aria-hidden", "true"); });
    $("#scrim").hidden = true;
  }

  // ---------- Ações ----------
  function toggleFav(id) {
    S.favs.has(id) ? S.favs.delete(id) : S.favs.add(id);
    store.set("favs", [...S.favs]);
    renderList();
    if ($("#detailDrawer").classList.contains("open")) openDetail(id);
  }
  function setAlvo(sigla) {
    S.alvo = sigla; store.set("alvo", sigla);
    S.sinais = [];
    renderTarget(); renderSimilar(); renderList(); renderTargetOptions();
    if (S.modo === "real") registrarAlvo().then(() => setTimeout(carregarSinais, 4000));
  }
  function renderTargetOptions() {
    const q = norm(($("#targetSearch").value || "").trim());
    const cat = catalogoAlvos();
    const atual = alvoInfo();
    $("#targetCurrent").hidden = !atual;
    if (atual) $("#targetCurrent").innerHTML = `<span class="eyebrow">Alvo atual</span><b>${esc(atual.sigla)}</b><span class="muted">${esc(atual.custom ? "personalizado" : atual.nome)}</span>`;
    if (!q) {
      $("#targetOptions").innerHTML = `<div class="target-hint">Digite a sigla, o órgão ou o cargo para ver os resultados.</div>`;
      return;
    }
    const list = cat.map(a => {
        const s = norm(a.sigla), n = norm(a.nome), cg = norm(a.cargo || CARGO_ALVO[a.sigla] || "");
        const score = s === q ? 0 : s.startsWith(q) ? 1 : n.startsWith(q) ? 2 : (s.includes(q) || n.includes(q)) ? 3 : cg.includes(q) ? 4 : 9;
        return { a, score };
      }).filter(x => x.score < 9).sort((x, y) => x.score - y.score || x.a.sigla.localeCompare(y.a.sigla, "pt")).slice(0, 10).map(x => x.a);
    const raw = $("#targetSearch").value.trim();
    const exact = cat.some(a => norm(a.sigla) === q || norm(a.nome) === q);
    $("#targetOptions").innerHTML = list.map(a => {
      const anos = HOJE.getFullYear() - a.ultimoEdital;
      const info = a.custom ? "acompanhando pelo nome" : anos > 0 ? `sem edital há ${anos} ${anos === 1 ? "ano" : "anos"}` : "edital recente";
      return `<button class="target-row" type="button" data-setalvo="${esc(a.sigla)}">
        <b>${esc(a.sigla)}</b><span>${esc(a.nome)}</span><em>${a.sigla === S.alvo ? "atual" : info}</em></button>`;
    }).join("") + (!exact ? `<button class="target-row custom" type="button" data-newalvo="${esc(raw)}">
        <b>+ Acompanhar "${esc(raw)}"</b><span>Não está na base — vira um alvo monitorado pelo nome</span></button>` : "");
  }
  function closeTargetDialog() { const d = $("#targetDialog"); if (d.open) d.close(); }
  function criarAlvo(nome) {
    const a = { sigla: nome, nome, area: "", nivel: "", salarioRef: 0, ultimoEdital: HOJE.getFullYear(), etapa: 0, custom: true,
      sinais: [{ data: HOJE.toISOString().slice(0, 10), fonte: "Radar", texto: `Monitoramento de "${nome}" iniciado no Diário Oficial e nas bancas` }] };
    alvosCustom.push(a); store.set("alvosCustom", alvosCustom);
    setAlvo(nome);
  }

  function simulateTargetEdital() {
    const a = alvoInfo();
    const id = "alvo-" + a.sigla;
    let c = S.concursos.find(x => x.id === id);
    if (!c) {
      c = { id, orgao: a.nome, sigla: a.sigla, esfera: "federal", tipo: "publico", ufs: ["DF"], banca: "Cebraspe", status: "edital_aberto",
        publicado: HOJE.toISOString().slice(0, 10), inscricoesAte: "2026-12-29",
        cargos: [{ nome: CARGO_ALVO[a.sigla] || `Analista - ${a.area}`, nivel: a.nivel, area: a.area, salario: a.salarioRef, vagas: 80 }] };
      S.concursos.unshift(c);
    }
    S.fresh.add(c.id);
    notify("alvo", `🚨 Saiu o edital ${a.sigla}!`, `${c.cargos[0].nome} · ${brl(c.cargos[0].salario)} · ${c.cargos[0].vagas} vagas · banca ${c.banca}. Inscrições até ${fmtDate(c.inscricoesAte)}.`, c.id);
    refreshAll();
  }

  // ---------- Tempo real (simulado) ----------
  // Em produção: EventSource('/api/stream') ou WebSocket. Aqui um timer injeta editais do FEED_SIMULADO.
  let feedIdx = 0, tick = 0;
  function realtimeTick() {
    tick++;
    if (tick % 3 === 0) {
      // atualização de um favorito
      const fav = S.concursos.find(c => S.favs.has(c.id) && ["previsto", "autorizado", "banca_definida"].includes(c.status));
      if (fav) {
        const next = { previsto: "autorizado", autorizado: "banca_definida", banca_definida: "edital_aberto" }[fav.status];
        fav.status = next;
        if (next === "edital_aberto") fav.inscricoesAte = "2026-12-31";
        if (next === "banca_definida" && !fav.banca) fav.banca = "Cebraspe";
        S.fresh.add(fav.id);
        notify("fav", `${fav.sigla}: ${STATUS[next]}`, `Um concurso que você favoritou avançou para "${STATUS[next]}".`, fav.id);
        refreshAll(); return;
      }
    }
    if (feedIdx >= FEED_SIMULADO.length) { renderHero(); return; }
    const c = { ...FEED_SIMULADO[feedIdx++], publicado: HOJE.toISOString().slice(0, 10) };
    S.concursos.unshift(c); S.fresh.add(c.id);
    const top = c.cargos[0];
    if (isAlvo(c)) notify("alvo", `🚨 ${c.sigla}: ${STATUS[c.status]}`, `${top.nome} · ${brl(top.salario)}`, c.id);
    else if (isSimilar(c)) notify("similar", `${c.sigla} — ${top.nome}`, `${STATUS[c.status]} · ${brl(top.salario)} · parecido com ${S.alvo}`, c.id);
    else if (matchCargos(c, { ignoreTab: true })) notify("novo", `${c.sigla} — ${top.nome}`, `${STATUS[c.status]} · ${brl(top.salario)} · ${locLabel(c)}`, c.id);
    refreshAll();
  }

  // ---------- Render geral ----------
  function refresh() { renderList(); renderMap(); }
  function refreshAll() { renderHero(); renderTarget(); renderSimilar(); refresh(); }

  // ---------- Eventos globais ----------
  document.addEventListener("click", e => {
    const fav = e.target.closest("[data-fav]");
    if (fav) { e.stopPropagation(); toggleFav(fav.dataset.fav); return; }
    const sa = e.target.closest("[data-setalvo]");
    if (sa) { e.preventDefault(); setAlvo(sa.dataset.setalvo); closeDrawers(); closeTargetDialog(); return; }
    const na = e.target.closest("[data-newalvo]");
    if (na) { e.preventDefault(); criarAlvo(na.dataset.newalvo); closeTargetDialog(); return; }
    if (e.target.closest("#changeTarget")) {
      $("#targetSearch").value = ""; renderTargetOptions(); $("#targetDialog").showModal(); $("#targetSearch").focus(); return;
    }
    if (e.target.closest("#simulateTarget")) { simulateTargetEdital(); return; }
    const op = e.target.closest("[data-open]");
    if (op) { openDetail(op.dataset.open); return; }
    const n = e.target.closest(".notif[data-cid]");
    if (n && n.dataset.cid) { openDetail(n.dataset.cid); return; }
    if (e.target.closest("[data-close]") || e.target.id === "scrim") closeDrawers();
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeDrawers(); });
  $("#btnBell").onclick = () => {
    renderNotifs(); openDrawer("#notifDrawer");
    S.notifs.forEach(n => { n.read = true; }); store.set("notifs", S.notifs); renderBell();
  };
  $("#btnPush").onclick = async () => {
    if (!("Notification" in window)) return;
    try { await Notification.requestPermission(); } catch { /* ignore */ }
    renderPushBtn();
  };
  $("#targetSearch").addEventListener("input", renderTargetOptions);
  $("#targetSearch").addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const first = $("#targetOptions [data-setalvo], #targetOptions [data-newalvo]");
    if (first) first.click();
  });
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(renderMap, 150); });

  // ---------- Abas principais ----------
  function setView(v, salvar = true) {
    if (!["concursos", "alvo"].includes(v)) v = "concursos";
    S.view = v;
    document.querySelectorAll("#viewTabs [data-view]").forEach(b => { const on = b.dataset.view === v; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    $("#viewConcursos").hidden = v !== "concursos";
    $("#viewAlvo").hidden = v !== "alvo";
    if (v === "alvo") $("#alvoDot").hidden = true;
    if (v === "concursos") renderMap();
    if (salvar) { store.set("view", v); history.replaceState(null, "", "#" + v); }
  }
  $("#viewTabs").addEventListener("click", e => { const b = e.target.closest("[data-view]"); if (b) setView(b.dataset.view); });
  window.addEventListener("hashchange", () => setView(location.hash.slice(1)));

  // ---------- Boot ----------
  setView(location.hash.slice(1) || store.get("view", "concursos"), false);
  initFilters();
  renderPushBtn();
  renderBell();
  refreshAll();
  iniciar();

  // ---------- Dados reais ----------
  // fonte "api": servidor local (backend/server.py) com SSE
  // fonte "json": arquivos estáticos gerados pelo GitHub Actions (backend/coletar_json.py), lidos a cada minuto
  async function api(path, opts) {
    const r = await fetch(path, opts);
    if (!r.ok) throw new Error(path + " " + r.status);
    return r.json();
  }
  const lerJson = nome => api(dadosBase + nome, { cache: "no-cache" });
  function sinaisDoTermo(termo, limite = 20) {
    const t = norm(termo);
    return sinaisTodos.filter(s => !t || norm(s.termo || "") === t || norm((s.titulo || "") + " " + (s.texto || "") + " " + (s.orgao || "")).includes(t)).slice(0, limite);
  }
  async function carregarConcursos() {
    if (fonte === "json") {
      const [c, s] = await Promise.all([lerJson("concursos.json"), lerJson("sinais.json")]);
      S.concursos = c.itens; sinaisTodos = s.itens;
      S.sinaisDou = S.coleta.sinaisDou || 0;
    } else {
      S.concursos = await api("/api/concursos");
      S.sinaisDou = (await api("/api/sinais?termo=&limite=1000")).filter(x => x.fonte === "Diário Oficial da União").length;
    }
    alvoCache.k = "";
  }
  async function carregarSinais() {
    if (S.modo !== "real" || !alvoInfo()) return;
    const termo = termoAlvo(alvoInfo());
    try {
      S.sinais = fonte === "json" ? sinaisDoTermo(termo) : await api("/api/sinais?termo=" + encodeURIComponent(termo));
      renderTarget();
    } catch { /* ignore */ }
  }
  function registrarAlvo() {
    // no modo estático os órgãos monitorados ficam em backend/alvos.txt
    if (!alvoInfo() || fonte !== "api") return Promise.resolve();
    return api("/api/alvos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ termo: termoAlvo(alvoInfo()) }) }).catch(() => {});
  }
  async function iniciar() {
    try {
      S.coleta = await api("/api/status"); fonte = "api";
    } catch {
      for (const base of [CFG.dadosUrl, "dados/"].filter(Boolean)) {
        try { dadosBase = base.replace(/\/?$/, "/"); S.coleta = await lerJson("status.json"); fonte = "json"; break; } catch { /* tenta a próxima */ }
      }
    }
    if (!fonte) { setInterval(realtimeTick, 20000); return; } // sem dados reais: demonstração
    S.modo = "real";
    $("#disclaimer").textContent = "Fontes: PCI Concursos (inscrições abertas), Diário Oficial da União, FGV e Cesgranrio. Mapas: IBGE. Confira sempre o edital oficial.";
    if (fonte === "api" && !S.coleta.concursos) {
      $("#heroStats").textContent = "Primeira coleta em andamento… isso leva uns segundos.";
      S.concursos = [];
      refreshAll();
      while (!S.coleta.concursos) { await new Promise(r => setTimeout(r, 3000)); S.coleta = await api("/api/status"); }
    }
    await carregarConcursos();
    refreshAll();
    registrarAlvo();
    carregarSinais();
    if (fonte === "api") conectarStream(); else setInterval(verificarJson, 60000);
  }

  function novoConcurso(c) {
    S.fresh.add(c.id);
    const top = c.cargos[0];
    const txt = `${top.nome} · ${top.salario ? "até " + brl(top.salario) : "salário no edital"} · ${locLabel(c)}`;
    if (isAlvo(c)) notify("alvo", `🚨 Inscrições abertas: ${c.sigla}`, txt, c.id);
    else if (isSimilar(c)) notify("similar", c.sigla, txt + ` · parecido com ${S.alvo}`, c.id);
    else if (S.favs.size === 0 || matchCargos(c, { ignoreTab: true, ignoreGeo: true })) notify("novo", c.sigla, txt, c.id);
  }
  function novoSinal(s) {
    const t = alvoInfo() ? norm(termoAlvo(alvoInfo())) : null;
    if (t && norm((s.termo || "") + " " + s.titulo + " " + s.texto + " " + (s.orgao || "")).includes(t)) {
      notify("alvo", `🚨 Novo sinal: ${S.alvo}`, `${s.fonte}: ${s.titulo}`, null);
      return true;
    }
    if (s.tipo === "autorizacao") notify("novo", "Concurso autorizado no Diário Oficial", s.titulo + " — " + (s.orgao || ""), null);
    return false;
  }

  // modo estático: confere a cada minuto se o robô publicou dados novos
  let verificando = false;
  async function verificarJson() {
    if (verificando) return;
    verificando = true;
    try {
      const st = await lerJson("status.json");
      if (st.gerado === S.coleta.gerado) return;
      const [c, s] = await Promise.all([lerJson("concursos.json"), lerJson("sinais.json")]);
      const tinhaC = new Set(S.concursos.map(x => x.id)), tinhaS = new Set(sinaisTodos.map(x => x.id));
      S.coleta = st; S.sinaisDou = st.sinaisDou || 0;
      S.concursos = c.itens; sinaisTodos = s.itens; alvoCache.k = "";
      const novosC = c.itens.filter(x => !tinhaC.has(x.id)), novosS = s.itens.filter(x => !tinhaS.has(x.id));
      if (novosC.length > 8) notify("novo", `${novosC.length} concursos novos`, "Inscrições abertas desde a última atualização.", null);
      else novosC.forEach(novoConcurso);
      let alvoMudou = false;
      novosS.slice(0, 10).forEach(x => { alvoMudou = novoSinal(x) || alvoMudou; });
      refreshAll();
      if (alvoMudou || novosS.length) carregarSinais();
    } catch { /* tenta de novo no próximo minuto */ } finally { verificando = false; }
  }

  function conectarStream() {
    const es = new EventSource("/api/stream");
    es.addEventListener("concurso", ev => {
      const c = JSON.parse(ev.data);
      if (S.concursos.some(x => x.id === c.id)) return;
      S.concursos.unshift(c);
      novoConcurso(c);
      refreshAll();
    });
    es.addEventListener("sinal", ev => {
      const s = JSON.parse(ev.data);
      if (novoSinal(s)) carregarSinais();
      if (s.fonte === "Diário Oficial da União") { S.sinaisDou = (S.sinaisDou || 0) + 1; renderHero(); }
    });
    es.addEventListener("status", ev => {
      S.coleta = { ...(S.coleta || {}), status: JSON.parse(ev.data) };
      renderHero();
      api("/api/concursos").then(l => { // reconcilia (inscrições que encerraram somem)
        const ids = new Set(l.map(x => x.id));
        if (l.length && (l.length !== S.concursos.length || S.concursos.some(x => !ids.has(x.id)))) { S.concursos = l; alvoCache.k = ""; refreshAll(); }
      }).catch(() => {});
    });
  }
})();
