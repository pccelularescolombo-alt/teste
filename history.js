"use strict";

/*
  Histórico de modelos (Firebase / Cloud Firestore)

  Estrutura no banco:
    modelos/{id}                 → dados do formulário + título + data da última atualização
    modelos/{id}/logos/header    → { data: "data:image/...", updatedAt }
    modelos/{id}/logos/logo1
    modelos/{id}/logos/logo2

  Os logotipos ficam em documentos separados para a lista do histórico carregar
  rápido (sem baixar imagens) e para cada documento respeitar o limite de 1 MB.
  O {id} é gerado a partir de: modelo de destaque + fabricante + modelo +
  armazenamento + RAM. Gerar de novo o mesmo aparelho atualiza o mesmo registro.
*/
(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyBztiCGlhkicOoAMMnROOqkP6m38IfIdsA",
    authDomain: "destaques-5f65c.firebaseapp.com",
    projectId: "destaques-5f65c",
    storageBucket: "destaques-5f65c.firebasestorage.app",
    messagingSenderId: "235683841918",
    appId: "1:235683841918:web:fc6ad5f8fe342c8d4d552f"
  };

  const COLLECTION = "modelos";
  const LOGO_KINDS = ["header", "logo1", "logo2"];
  const MAX_DATA_URL = 800000; // caracteres por logotipo (limite do Firestore: ~1 MB por documento)
  const SHRINK_STEPS = {
    header: [[1024, .85], [800, .8], [600, .75], [400, .7]],
    logo1: [[512, .85], [384, .8], [256, .7]],
    logo2: [[512, .85], [384, .8], [256, .7]]
  };
  const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  const q = (selector) => document.querySelector(selector);

  let db = null;
  let items = [];
  let panelOpen = false;
  let fetching = false;
  let expandedId = null;
  let savedSnapshot = "";

  // ---------- Firebase ----------
  function getDb() {
    if (db) return db;
    if (!window.firebase || !firebase.firestore) {
      const error = new Error("sdk"); error.code = "sdk"; throw error;
    }
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    return db;
  }

  function friendlyError(error) {
    const code = (error && error.code) || "";
    if (code === "permission-denied") return "Sem permissão no Firestore. Publique as regras do arquivo firestore.rules no Firebase Console.";
    if (code === "unavailable" || code === "failed-precondition") return "Sem conexão com o Firebase. Verifique a internet e tente de novo.";
    if (code === "sdk") return "Não foi possível carregar o Firebase. Verifique a internet.";
    return "Não foi possível acessar o histórico.";
  }

  // ---------- Utilidades ----------
  function normalize(text) {
    return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  function slug(text) {
    return normalize(text).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function makeId(data) {
    return ["m" + data.activeMode, data.manufacturer, data.model, data.storage, data.ram]
      .map(slug).filter(Boolean).join("--").slice(0, 150).replace(/-+$/, "");
  }

  function snapshotOf(data) {
    return JSON.stringify([data.activeMode, ...fieldIds.map(id => data[id] || "")]);
  }

  function capitalize(text) { return text.charAt(0).toUpperCase() + text.slice(1); }

  function monthLabel(date) { return `${capitalize(MONTHS[date.getMonth()])} de ${date.getFullYear()}`; }

  function timeLabel(date) {
    return date.toLocaleTimeString("pt-BR", {hour: "2-digit", minute: "2-digit"});
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // ---------- Logotipos: reduz se passar do limite do documento ----------
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("imagem inválida"));
      img.src = src;
    });
  }

  async function shrink(dataUrl, maxDim, quality) {
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const canvasEl = document.createElement("canvas");
    canvasEl.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvasEl.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvasEl.getContext("2d").drawImage(img, 0, 0, canvasEl.width, canvasEl.height);
    let out = canvasEl.toDataURL("image/webp", quality);
    if (!out.startsWith("data:image/webp")) out = canvasEl.toDataURL("image/png"); // navegadores sem WebP
    return out;
  }

  // Retorna "" (sem logotipo), a imagem pronta, ou null se não coube (não mexe no que já está salvo).
  async function prepareLogo(kind, dataUrl) {
    if (!dataUrl) return "";
    if (dataUrl.length <= MAX_DATA_URL) return dataUrl;
    for (const [dimension, quality] of SHRINK_STEPS[kind]) {
      try {
        const out = await shrink(dataUrl, dimension, quality);
        if (out.length <= MAX_DATA_URL) return out;
      } catch (_) { return null; }
    }
    return null;
  }

  // ---------- Salvar ----------
  async function saveCurrent() {
    try {
      const data = collectData();
      if (!data.manufacturer.trim() && !data.model.trim()) {
        return {ok: false, skipped: true, message: "Imagem gerada. Preencha fabricante ou modelo para salvar no histórico."};
      }

      const logos = getLogoData();
      const prepared = {
        header: await prepareLogo("header", logos.header),
        logo1: await prepareLogo("logo1", logos.logo1),
        logo2: await prepareLogo("logo2", logos.logo2)
      };
      const skippedLogos = LOGO_KINDS.filter(kind => prepared[kind] === null);

      const database = getDb();
      const id = makeId(data);
      const ref = database.collection(COLLECTION).doc(id);
      const stamp = firebase.firestore.FieldValue.serverTimestamp();
      const title = [data.manufacturer.trim(), data.model.trim()].filter(Boolean).join(" ");

      const batch = database.batch();
      batch.set(ref, {
        ...data,
        activeMode: Number(data.activeMode),
        title,
        searchText: normalize([title, data.storage, data.ram].join(" ")),
        updatedAt: stamp
      });
      LOGO_KINDS.forEach(kind => {
        const logoRef = ref.collection("logos").doc(kind);
        const image = prepared[kind];
        if (image === null) return;                       // não coube: mantém o que já estava salvo
        if (image) batch.set(logoRef, {data: image, updatedAt: stamp});
        else batch.delete(logoRef);                       // logotipo removido do formulário
      });
      await batch.commit();

      savedSnapshot = snapshotOf(data);
      return {
        ok: true,
        id,
        message: skippedLogos.length
          ? "Salvo no histórico, mas algum logotipo é grande demais e não foi atualizado"
          : "Imagem gerada e salva no histórico"
      };
    } catch (error) {
      console.error("Erro ao salvar no histórico:", error);
      return {ok: false, message: "Imagem gerada, mas não foi salva no histórico. " + friendlyError(error)};
    }
  }

  // ---------- Listar ----------
  async function fetchItems() {
    const snap = await getDb().collection(COLLECTION).orderBy("updatedAt", "desc").limit(500).get();
    items = snap.docs.map(doc => {
      const value = doc.data();
      const when = value.updatedAt && value.updatedAt.toDate ? value.updatedAt.toDate() : new Date();
      const searchable = normalize([
        value.title, value.storage, value.ram, MONTHS[when.getMonth()], String(when.getFullYear()),
        `${String(when.getMonth() + 1).padStart(2, "0")}/${when.getFullYear()}`, timeLabel(when)
      ].join(" "));
      return {...value, id: doc.id, when, searchable};
    });
  }

  function setStatus(text, isError = false) {
    const status = q("#historyStatus");
    status.textContent = text;
    status.classList.toggle("error", isError);
  }

  function render() {
    const list = q("#historyList");
    list.replaceChildren();
    const tokens = normalize(q("#historySearch").value).split(/\s+/).filter(Boolean);
    const visible = items.filter(item => tokens.every(token => item.searchable.includes(token)));

    if (!items.length) return;
    if (!visible.length) { setStatus("Nenhum modelo encontrado para essa busca."); return; }
    setStatus(tokens.length ? `${visible.length} de ${items.length} modelos` : `${items.length} ${items.length === 1 ? "modelo" : "modelos"}`);

    visible.forEach(item => list.append(renderItem(item)));
  }

  function fact(label, text) {
    const wrap = el("div");
    wrap.append(el("dt", "", label), el("dd", "", text));
    return wrap;
  }

  function renderItem(item) {
    const open = item.id === expandedId;
    const li = el("li", "h-item" + (open ? " open" : ""));
    li.dataset.id = item.id;

    const row = el("button", "h-row");
    row.type = "button";
    row.setAttribute("aria-expanded", String(open));
    row.dataset.action = "toggle";

    const main = el("span", "h-main");
    main.append(el("b", "h-title", item.title || "Sem nome"));
    const sub = [item.storage, item.ram && `${item.ram} RAM`].filter(Boolean).join(" · ");
    if (sub) main.append(el("small", "h-sub", sub));

    const when = el("span", "h-when");
    when.title = item.when.toLocaleString("pt-BR", {dateStyle: "full", timeStyle: "short"});
    when.append(el("b", "", monthLabel(item.when)), el("small", "", timeLabel(item.when)));

    row.append(el("span", "h-mode", String(item.activeMode || 1).padStart(2, "0")), main, when);
    li.append(row);

    if (open) {
      const detail = el("div", "h-detail");
      const facts = el("dl", "h-facts");
      facts.append(fact("Modelo de destaque", `Modelo ${item.activeMode || 1}`));
      if (item.cashPrice) facts.append(fact("Valor à vista", `R$ ${money(item.cashPrice)}`));
      if (item.condition) facts.append(fact("Condição", item.condition));
      if (item.warrantyQty && item.warrantyUnit) facts.append(fact("Garantia", `${item.warrantyQty} ${item.warrantyUnit}`));

      const actions = el("div", "h-actions");
      const edit = el("button", "btn primary", "Editar modelo");
      edit.type = "button"; edit.dataset.action = "edit";
      const remove = el("button", "btn h-delete", "Excluir");
      remove.type = "button"; remove.dataset.action = "delete";
      actions.append(edit, remove);

      detail.append(facts, actions);
      li.append(detail);
    }
    return li;
  }

  async function refresh() {
    if (fetching) return;
    fetching = true;
    if (!items.length) setStatus("Carregando histórico…");
    try {
      await fetchItems();
      if (!items.length) { q("#historyList").replaceChildren(); setStatus("Nenhum modelo salvo ainda. Gere uma imagem para o primeiro aparecer aqui."); }
      else render();
    } catch (error) {
      console.error("Erro ao carregar histórico:", error);
      setStatus(friendlyError(error), true);
    } finally {
      fetching = false;
    }
  }

  // ---------- Editar / excluir ----------
  function hasUnsavedChanges() {
    const now = collectData();
    const filled = fieldIds.some(id => String(now[id] || "").trim());
    return filled && snapshotOf(now) !== savedSnapshot;
  }

  async function editItem(id, button) {
    const item = items.find(entry => entry.id === id);
    if (!item) return;
    if (hasUnsavedChanges() && !confirm("O formulário tem alterações que ainda não foram salvas no histórico. Carregar este modelo vai substituí-las. Continuar?")) return;

    button.disabled = true; button.textContent = "Carregando…";
    try {
      const snap = await getDb().collection(COLLECTION).doc(id).collection("logos").get();
      const logos = {header: "", logo1: "", logo2: ""};
      snap.forEach(doc => { if (doc.id in logos && doc.data().data) logos[doc.id] = doc.data().data; });

      await applyModelData(item, logos);
      savedSnapshot = snapshotOf(collectData());
      closePanel();
      q("#actionStatus").textContent = "Modelo carregado do histórico. Ajuste o que precisar e clique em Gerar imagem para salvar as alterações.";
      showToast("Modelo carregado para edição");
      window.scrollTo({top: 0, behavior: "smooth"});
    } catch (error) {
      console.error("Erro ao carregar modelo:", error);
      showToast(friendlyError(error));
      button.disabled = false; button.textContent = "Editar modelo";
    }
  }

  async function deleteItem(id, button) {
    const item = items.find(entry => entry.id === id);
    if (!item) return;
    if (!confirm(`Excluir "${item.title}" do histórico? Essa ação não pode ser desfeita.`)) return;
    button.disabled = true;
    try {
      const database = getDb();
      const ref = database.collection(COLLECTION).doc(id);
      const batch = database.batch();
      LOGO_KINDS.forEach(kind => batch.delete(ref.collection("logos").doc(kind)));
      batch.delete(ref);
      await batch.commit();
      items = items.filter(entry => entry.id !== id);
      expandedId = null;
      if (!items.length) { q("#historyList").replaceChildren(); setStatus("Nenhum modelo salvo ainda. Gere uma imagem para o primeiro aparecer aqui."); }
      else render();
      showToast("Modelo excluído do histórico");
    } catch (error) {
      console.error("Erro ao excluir modelo:", error);
      showToast(friendlyError(error));
      button.disabled = false;
    }
  }

  // ---------- Painel ----------
  function openPanel() {
    panelOpen = true;
    q("#historyPanel").classList.add("open");
    q("#historyOverlay").classList.add("open");
    q("#historyPanel").setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    refresh();
    setTimeout(() => q("#historySearch").focus(), 120);
  }

  function closePanel() {
    if (!panelOpen) return;
    panelOpen = false;
    q("#historyPanel").classList.remove("open");
    q("#historyOverlay").classList.remove("open");
    q("#historyPanel").setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    q("#historyBtn").focus();
  }

  q("#historyBtn").addEventListener("click", openPanel);
  q("#historyClose").addEventListener("click", closePanel);
  q("#historyOverlay").addEventListener("click", closePanel);
  q("#historyRefresh").addEventListener("click", refresh);
  q("#historySearch").addEventListener("input", () => { expandedId = null; render(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") closePanel(); });

  q("#historyList").addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const id = button.closest(".h-item").dataset.id;
    if (button.dataset.action === "toggle") { expandedId = expandedId === id ? null : id; render(); }
    else if (button.dataset.action === "edit") editItem(id, button);
    else if (button.dataset.action === "delete") deleteItem(id, button);
  });

  window.VitrineHistory = {saveCurrent, open: openPanel};
})();
