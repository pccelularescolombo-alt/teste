"use strict";

const $ = (selector) => document.querySelector(selector);
const canvas = $("#poster");
const ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;
const DESIGN_W = 900, DESIGN_H = 1311;
// Área do logotipo principal (topo, centralizado, retangular ~3:1)
const HEADER_LOGO = {w:420, h:135, x:(DESIGN_W-420)/2, y:30};

const fieldIds = ["manufacturer","model","storage","ram","warrantyQty","warrantyUnit","cashPrice","total5","total10","total18","condition","display","refresh","processor","rearCamera","frontCamera","android","network","battery","logo1","logo2"];
let generatedUrl = "";
let toastTimer;
let activeMode = 1;
let headerLogo = null;
let headerLogoData = "";
let logo1Image = null;
let logo1ImageData = "";
let logo2Image = null;
let logo2ImageData = "";

// Drawing and interaction logic is added in sections below.

function value(id) { return $("#" + id).value.trim(); }
function upper(text) { return String(text || "").toLocaleUpperCase("pt-BR"); }
function safe(text, fallback = "—") { return String(text || "").trim() || fallback; }
function monthYear() { return new Intl.DateTimeFormat("pt-BR", {month:"2-digit", year:"numeric"}).format(new Date()); }

function roundedRect(x, y, w, h, r, fill, stroke, lineWidth = 1) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function fitText(text, maxWidth, startSize, family = "Georgia", weight = "700", minSize = 18) {
  let size = startSize;
  do { ctx.font = `${weight} ${size}px ${family}`; size -= 1; }
  while (ctx.measureText(text).width > maxWidth && size > minSize);
  return size + 1;
}

function labelValue(label, text, x, y, maxWidth) {
  ctx.fillStyle = "#f05a22"; ctx.font = "800 20px sans-serif"; ctx.fillText(label, x, y);
  const offset = ctx.measureText(label).width + 10;
  const size = fitText(safe(text), maxWidth - offset, 24, "sans-serif", "700");
  ctx.fillStyle = "#31475b"; ctx.font = `700 ${size}px sans-serif`;
  ctx.fillText(safe(text), x + offset, y);
}

function moneyNumber(input) {
  let text = String(input || "").replace(/[^0-9,.-]/g, "");
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  const number = Number.parseFloat(text);
  return Number.isFinite(number) ? number : 0;
}

function money(input) {
  if (String(input ?? "").trim() === "") return "—";
  return moneyNumber(input).toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});
}

function hasValue(input) { return String(input ?? "").trim() !== "" && moneyNumber(input) > 0; }

// Parcela = valor total ÷ número de parcelas, arredondada para centavos.
function installmentValue(total, count) {
  if (!hasValue(total) || !count) return "";
  return Math.round(moneyNumber(total) / count * 100) / 100;
}

function drawImageContain(img, x, y, w, h) {
  const sourceW = img.naturalWidth || img.width, sourceH = img.naturalHeight || img.height;
  const scale = Math.min(w / sourceW, h / sourceH);
  const dw = sourceW * scale, dh = sourceH * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function drawLogo(type, slot, x, y, w, h) {
  if (type === "none") return;
  ctx.save();
  // Fator de escala: os desenhos abaixo foram calibrados para uma caixa de 168×168.
  // Ao usar caixas menores (ex.: os logotipos 1 e 2 colados no canto), tudo escala
  // proporcionalmente, sem estourar os limites da caixa.
  const s = w / 168;
  if (type === "anatel") {
    ctx.translate(x + w / 2, y + h / 2 - 8 * s);
    ctx.lineWidth = 18 * s; ctx.lineCap = "round";
    ctx.strokeStyle="#ffdc2c";ctx.beginPath();ctx.arc(8*s,0,70*s,-1.15,1.15);ctx.stroke();
    ctx.strokeStyle="#2f65ad";ctx.beginPath();ctx.arc(-25*s,15*s,38*s,-1.25,1.25);ctx.stroke();
    ctx.fillStyle="#2ea85e";ctx.textAlign="center";ctx.font=`italic 900 ${28*s}px sans-serif`;ctx.fillText("ANATEL",0,76*s);
  } else if (type === "store") {
    if (headerLogo) drawImageContain(headerLogo,x,y,w,h);
    else {ctx.fillStyle="#7b868d";ctx.textAlign="center";ctx.font=`800 ${Math.max(11,17*s)}px sans-serif`;ctx.fillText("LOGOTIPO DA LOJA",x+w/2,y+h/2+6*s);}
  } else if (type === "custom") {
    const img = slot === 1 ? logo1Image : logo2Image;
    if (img) drawImageContain(img,x,y,w,h);
    else {ctx.fillStyle="#7b868d";ctx.textAlign="center";ctx.font=`800 ${Math.max(11,17*s)}px sans-serif`;ctx.fillText("SUA IMAGEM",x+w/2,y+h/2+6*s);}
  } else {
    const brand = safe(value("manufacturer"), "MARCA");
    const key = brand.toLocaleLowerCase("pt-BR");
    const palette = key.includes("realme") ? ["#ffd51f","#111"] : key.includes("samsung") ? ["#0c4da2","#fff"] : key.includes("motorola") ? ["#e6e8ea","#111"] : key.includes("xiaomi") ? ["#ff6900","#fff"] : key.includes("apple") ? ["#111","#fff"] : ["#10202c","#fff"];
    roundedRect(x + 8*s,y + 30*s,w - 16*s,h - 60*s,10,palette[0]);
    const size=fitText(upper(brand),w-40*s,Math.max(12,34*s),"sans-serif","900",Math.max(10,12*s));ctx.fillStyle=palette[1];ctx.textAlign="center";ctx.font=`900 ${size}px sans-serif`;ctx.fillText(upper(brand),x+w/2,y+h/2+11*s);
  }
  ctx.restore();ctx.textAlign="left";
}

function renderPoster(finalMode = false) {
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,W,H);
  ctx.setTransform(W / DESIGN_W,0,0,H / DESIGN_H,0,0);
  ctx.fillStyle = "#fffefb"; ctx.fillRect(0,0,DESIGN_W,DESIGN_H);
  ctx.strokeStyle = "#1f4ea1"; ctx.lineWidth = 5; ctx.strokeRect(12,12,DESIGN_W-24,DESIGN_H-24);

  // Logotipo da loja: retangular, centralizado no topo
  if (headerLogo) drawImageContain(headerLogo,HEADER_LOGO.x,HEADER_LOGO.y,HEADER_LOGO.w,HEADER_LOGO.h);
  else {
    roundedRect(HEADER_LOGO.x,HEADER_LOGO.y,HEADER_LOGO.w,HEADER_LOGO.h,10,"#f5f3ed","#c8ced1",2);
    const cx=HEADER_LOGO.x+HEADER_LOGO.w/2, cy=HEADER_LOGO.y+HEADER_LOGO.h/2;
    ctx.fillStyle="#7b868d";ctx.textAlign="center";ctx.font="800 20px sans-serif";ctx.fillText("SUA LOGO",cx,cy-2);ctx.font="700 13px sans-serif";ctx.fillText("Formato retangular · 3:1",cx,cy+22);ctx.textAlign="left";
  }

  // Warranty seal
  ctx.save();ctx.translate(760,91);ctx.rotate(.08);ctx.beginPath();ctx.arc(0,0,68,0,Math.PI*2);ctx.fillStyle="#ffad13";ctx.fill();
  ctx.fillStyle="#10202c";ctx.textAlign="center";ctx.font="900 18px sans-serif";ctx.fillText("GARANTIA",0,-12);
  const warranty=value("warrantyQty")&&value("warrantyUnit")?`${value("warrantyQty")} ${upper(value("warrantyUnit"))}`:"—";
  ctx.font="900 29px sans-serif";ctx.fillText(warranty,0,22);ctx.restore();ctx.textAlign="left";

  const title = upper(`${value("manufacturer")} ${value("model")}`.trim());
  const titleSize = fitText(safe(title,"APARELHO"), 790, 70, "sans-serif", "900");
  ctx.fillStyle="#f05a22";ctx.font=`900 ${titleSize}px sans-serif`;ctx.fillText(safe(title,"APARELHO"),55,240);
  ctx.fillStyle="#31475b";ctx.font="800 31px sans-serif";ctx.fillText(upper(safe(value("storage"),"ARMAZENAMENTO")),57,279);

  drawPricing(activeMode);

  drawLowerSection(finalMode);
}

function drawPricing(mode) {
  roundedRect(55,307,790,61,10,"#1f4ea1");
  ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="900 34px sans-serif";ctx.fillText("PROMOÇÃO",450,349);ctx.textAlign="left";
  if (mode === 1) drawModeOne();
  if (mode === 2) drawModeTwo();
  if (mode === 3) drawModeThree();
}

function drawCashHeadline(y = 410) {
  ctx.fillStyle="#66727c";ctx.font="800 18px sans-serif";ctx.fillText("VALOR À VISTA",58,y);
  ctx.fillStyle="#f05a22";ctx.font="900 47px sans-serif";ctx.fillText("R$",57,y+79);
  const cash = money(value("cashPrice"));
  const size=fitText(cash,625,100,"sans-serif","900");ctx.font=`900 ${size}px sans-serif`;ctx.fillText(cash,137,y+81);
}

function drawInstallmentBox(count, total, x, y, w, h, highlighted = false, caption = "") {
  roundedRect(x,y,w,h,10,highlighted?"#fff0e8":"#f5f3ed",highlighted?"#f05a22":"#d5d9db",highlighted?3:2);
  ctx.fillStyle=highlighted?"#f05a22":"#1f4ea1";ctx.font="900 35px sans-serif";ctx.fillText(`${count}×`,x+18,y+40);
  ctx.fillStyle="#65737d";ctx.font="800 14px sans-serif";ctx.fillText("DE",x+19,y+66);

  // Valor da parcela (calculado a partir do total informado)
  const installment = installmentValue(total, count);
  const priceText=`R$ ${money(installment)}`;
  const size=fitText(priceText,w-36,44,"sans-serif","900");ctx.fillStyle="#183247";ctx.font=`900 ${size}px sans-serif`;ctx.fillText(priceText,x+18,y+112);

  // Valor total logo abaixo da parcela
  ctx.fillStyle=highlighted?"#f4c3ad":"#d5d9db";ctx.fillRect(x+18,y+126,w-36,1.5);
  ctx.fillStyle="#65737d";ctx.font="800 13px sans-serif";ctx.fillText("TOTAL",x+18,y+150);
  const labelW=ctx.measureText("TOTAL").width+8;
  const totalText=`R$ ${money(hasValue(total)?total:"")}`;
  const totalSize=fitText(totalText,w-36-labelW,22,"sans-serif","800",11);
  ctx.fillStyle="#31475b";ctx.font=`800 ${totalSize}px sans-serif`;ctx.fillText(totalText,x+18+labelW,y+150);

  if(caption){ctx.fillStyle="#65737d";ctx.font="800 12px sans-serif";ctx.fillText(caption,x+18,y+h-14);}
}

function drawModeOne() {
  drawCashHeadline(403);
  ctx.fillStyle="#10202c";ctx.font="900 17px sans-serif";ctx.fillText("CONDIÇÕES PARCELADAS",57,522);
  drawInstallmentBox(5,value("total5"),55,538,250,178);
  drawInstallmentBox(10,value("total10"),325,538,250,178);
  drawInstallmentBox(18,value("total18"),595,538,250,178,true);
}

function drawModeTwo() {
  drawCashHeadline(410);
  ctx.fillStyle="#10202c";ctx.font="900 17px sans-serif";ctx.fillText("ESCOLHA UMA CONDIÇÃO PARCELADA",57,529);
  drawInstallmentBox(5,value("total5"),55,545,385,178);
  drawInstallmentBox(10,value("total10"),460,545,385,178,true);
}

function drawModeThree() {
  drawCashHeadline(397);
  ctx.fillStyle="#10202c";ctx.font="900 17px sans-serif";ctx.fillText("CONDIÇÕES PARCELADAS",57,510);
  // 5x: o total é o próprio valor à vista; a parcela é calculada em cima dele
  drawInstallmentBox(5,value("cashPrice"),55,526,385,198,false,"MESMO PREÇO DO VALOR À VISTA");
  drawInstallmentBox(10,value("total10"),460,526,385,198,true,"CONDIÇÃO INDEPENDENTE");
}

function drawLowerSection(finalMode) {
  ctx.fillStyle="#10202c";ctx.fillRect(55,746,790,4);
  ctx.font="900 27px sans-serif";ctx.fillStyle="#f05a22";ctx.fillText("FICHA TÉCNICA",56,792);

  // Logotipos 1 e 2: colados um no outro (sem espaço entre eles), ao longo do
  // lado direito da ficha técnica, centralizados na altura da seção.
  const sectionTop = 800, sectionBottom = 1216;
  const logoW = 160, logoH = 160;
  const logoX = 845 - logoW;
  const logoY1 = sectionTop + (sectionBottom - sectionTop - logoH * 2) / 2;
  const logoY2 = logoY1 + logoH;
  drawLogo(value("logo1"),1,logoX,logoY1,logoW,logoH);
  drawLogo(value("logo2"),2,logoX,logoY2,logoW,logoH);

  const specs = [
    ["CONDIÇÃO", value("condition")], ["DISPLAY", value("display")], ["FPS", value("refresh")],
    ["PROCESSADOR", value("processor")], ["MEMÓRIA RAM", value("ram")],
    ["C. TRASEIRA", value("rearCamera")], ["C. FRONTAL", value("frontCamera")],
    ["SISTEMA", value("android")], ["REDE", value("network")], ["BATERIA", value("battery")]
  ];

  // Coluna única com rótulo e valor na mesma linha, ocupando toda a largura
  // disponível ao lado dos logotipos, com fontes bem maiores — pensada para
  // continuar legível quando a imagem é reduzida no Word.
  const specsRightEdge = logoX - 22;
  const colX = 55;
  const colW = specsRightEdge - colX;
  const rows = specs.length;
  const rowH = (sectionBottom - sectionTop) / rows;

  const pillH = rowH * 0.62;
  const pillFont = Math.round(pillH * 0.46);
  ctx.font = `900 ${pillFont}px sans-serif`;
  const pillPadX = pillH * 0.42;
  const pillW = Math.max(...specs.map(([label]) => ctx.measureText(label).width)) + pillPadX * 2;

  specs.forEach(([label, text], index) => {
    const rowCenterY = sectionTop + index * rowH + rowH / 2;
    const pillX = colX, pillY = rowCenterY - pillH / 2;
    roundedRect(pillX, pillY, pillW, pillH, pillH / 2, "#f05a22");
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = `900 ${pillFont}px sans-serif`;
    ctx.fillText(label, pillX + pillW / 2, rowCenterY + pillFont * 0.34);
    ctx.textAlign = "left";

    const valueX = pillX + pillW + 18;
    const valueMaxW = colW - (valueX - colX);
    const size = fitText(safe(text), valueMaxW, 27, "sans-serif", "800", 18);
    ctx.fillStyle = "#183247"; ctx.font = `800 ${size}px sans-serif`;
    ctx.fillText(safe(text), valueX, rowCenterY + size * 0.34);

    if (index < rows - 1) { ctx.fillStyle = "#e7e5df"; ctx.fillRect(colX, sectionTop + (index + 1) * rowH - 2, colW, 1.3); }
  });

  // Footer
  ctx.fillStyle="#10202c";ctx.fillRect(55,1227,790,2);
  ctx.font="900 18px sans-serif";ctx.fillStyle="#66727c";ctx.fillText("ÚLTIMA ATUALIZAÇÃO",56,1263);
  ctx.textAlign="right";ctx.fillStyle="#10202c";ctx.font="900 28px sans-serif";ctx.fillText(monthYear(),842,1267);ctx.textAlign="left";
  if (finalMode) {
    ctx.fillStyle="#a8b0b5";ctx.font="700 10px sans-serif";ctx.fillText("GERADO DIGITALMENTE",56,1293);
  }
}

function updateInstallmentHints() {
  [[5,"total5","calc5"],[10,"total10","calc10"],[18,"total18","calc18"]].forEach(([count,input,hint]) => {
    const parcela = installmentValue(value(input), count);
    $("#" + hint).textContent = parcela === "" ? "" : `${count}× de R$ ${money(parcela)}`;
  });
}

function markDirty() {
  updateInstallmentHints();
  renderPoster(false);
  if (generatedUrl) { URL.revokeObjectURL(generatedUrl); generatedUrl = ""; }
  $("#downloadBtn").disabled = true;
  $("#actionStatus").textContent = "Alterações aplicadas à prévia. Gere novamente para baixar.";
  saveDraft();
}

function saveDraft() {
  const draft = {activeMode, headerLogoData, logo1ImageData, logo2ImageData};
  fieldIds.forEach(id => draft[id] = value(id));
  try { localStorage.setItem("vitrine-manual-v2", JSON.stringify(draft)); } catch (_) {}
}

function restoreDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem("vitrine-manual-v2") || "null");
    if (!draft) return;
    fieldIds.forEach(id => { if (draft[id] !== undefined) $("#" + id).value = draft[id]; });
    if ([1,2,3].includes(Number(draft.activeMode))) activeMode = Number(draft.activeMode);
    if (draft.headerLogoData) setHeaderLogo(draft.headerLogoData, false);
    if (draft.logo1ImageData) setLogoImage(1, draft.logo1ImageData, false);
    if (draft.logo2ImageData) setLogoImage(2, draft.logo2ImageData, false);
    updateLogoUploadVisibility();
  } catch (_) {}
}

function showToast(message) {
  const toast = $("#toast"); toast.textContent = message; toast.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function setHeaderLogo(dataUrl, persist = true) {
  const img = new Image();
  img.onload = () => {
    headerLogo = img; headerLogoData = dataUrl;
    $("#headerLogoPreview").src = dataUrl;
    $("#headerLogoPreview").parentElement.classList.add("has-image");
    if (persist) { markDirty(); showToast("Logotipo principal carregado"); }
    else renderPoster(false);
  };
  img.onerror=()=>showToast("Não foi possível carregar este logotipo");
  img.src = dataUrl;
}

function handleHeaderLogo(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) { showToast("Escolha um arquivo de imagem válido"); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const source = new Image();
    source.onload = () => {
      // Mantém a proporção original (retangular); só reduz se for muito grande
      const scale=Math.min(1,1024/source.naturalWidth,1024/source.naturalHeight);
      const temp=document.createElement("canvas");
      temp.width=Math.max(1,Math.round(source.naturalWidth*scale));temp.height=Math.max(1,Math.round(source.naturalHeight*scale));
      temp.getContext("2d").drawImage(source,0,0,temp.width,temp.height);
      setHeaderLogo(temp.toDataURL("image/png"));
    };
    source.onerror=()=>showToast("Arquivo de imagem inválido");
    source.src = reader.result;
  };
  reader.onerror=()=>showToast("Não foi possível ler o arquivo");
  reader.readAsDataURL(file);
}

function setLogoImage(slot, dataUrl, persist = true) {
  const img = new Image();
  img.onload = () => {
    if (slot === 1) { logo1Image = img; logo1ImageData = dataUrl; }
    else { logo2Image = img; logo2ImageData = dataUrl; }
    const preview = $(`#logo${slot}UploadPreview`);
    preview.src = dataUrl;
    preview.parentElement.classList.add("has-image");
    if (persist) { markDirty(); showToast(`Imagem do logotipo ${slot} carregada`); }
    else renderPoster(false);
  };
  img.onerror = () => showToast("Não foi possível carregar esta imagem");
  img.src = dataUrl;
}

function handleLogoUpload(slot, file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) { showToast("Escolha um arquivo de imagem válido"); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const source = new Image();
    source.onload = () => {
      const temp = document.createElement("canvas"); temp.width = 512; temp.height = 512;
      const tempCtx = temp.getContext("2d");
      const scale = Math.min(472 / source.naturalWidth, 472 / source.naturalHeight);
      const width = source.naturalWidth * scale, height = source.naturalHeight * scale;
      tempCtx.drawImage(source, (512 - width) / 2, (512 - height) / 2, width, height);
      setLogoImage(slot, temp.toDataURL("image/png"));
    };
    source.onerror = () => showToast("Arquivo de imagem inválido");
    source.src = reader.result;
  };
  reader.onerror = () => showToast("Não foi possível ler o arquivo");
  reader.readAsDataURL(file);
}

function updateLogoUploadVisibility() {
  [1, 2].forEach(slot => {
    const isCustom = value(`logo${slot}`) === "custom";
    $(`#logo${slot}UploadField`).hidden = !isCustom;
  });
}

function selectMode(mode) {
  activeMode = Number(mode);
  updateModeUI(); markDirty();
  showToast(`Modelo ${activeMode} selecionado`);
}

function updateModeUI() {
  const inactiveLabels={1:"Todos os valores",2:"Três condições",3:"Duas condições"};
  document.querySelectorAll(".tab").forEach(tab => {
    const selected=Number(tab.dataset.mode)===activeMode;
    tab.classList.toggle("active",selected);tab.setAttribute("aria-pressed",String(selected));
    tab.querySelector("small").textContent=selected?"Selecionado":inactiveLabels[tab.dataset.mode];
  });
  const rules = {
    1:"Aba 1: à vista, 5x, 10x e 18x. Informe o valor TOTAL de cada parcelamento: o sistema calcula a parcela e mostra o total abaixo dela.",
    2:"Aba 2: à vista, 5x ou 10x. Informe o valor TOTAL de cada parcelamento: o sistema calcula a parcela e mostra o total abaixo dela.",
    3:"Aba 3: o total do 5x é o valor à vista (parcela = à vista ÷ 5). Informe o valor TOTAL do 10x: o sistema calcula a parcela e mostra o total abaixo dela."
  };
  $("#pricingRule").textContent = rules[activeMode];
  $("#total18").closest("label").hidden = activeMode !== 1;
  $("#total5").closest("label").hidden = activeMode === 3;
}

function generateImage() {
  renderPoster(true);
  $("#generateBtn").disabled = true;
  $("#generateBtn").textContent = "Gerando…";
  canvas.toBlob(blob => {
    $("#generateBtn").disabled = false; $("#generateBtn").textContent = "Gerar imagem";
    if (!blob) { showToast("Não foi possível gerar a imagem"); return; }
    if (generatedUrl) URL.revokeObjectURL(generatedUrl);
    generatedUrl = URL.createObjectURL(blob); $("#downloadBtn").disabled = false;
    $("#actionStatus").textContent = "Imagem final pronta em alta resolução.";
    showToast("Imagem gerada com sucesso");
  }, "image/png", 1);
}

function downloadImage() {
  if (!generatedUrl) return;
  const name = [value("manufacturer"), value("model"), value("storage"), `modelo-${activeMode}`].filter(Boolean).join("-").replace(/\s+/g,"-").replace(/[^\wÀ-ÿ-]/g,"");
  const link = document.createElement("a"); link.href = generatedUrl; link.download = `${name || "destaque"}.png`; document.body.append(link); link.click(); link.remove();
  showToast("Download iniciado");
}

function resetEditor() {
  if (!confirm("Deseja restaurar os dados de exemplo?")) return;
  localStorage.removeItem("vitrine-manual-v2");localStorage.removeItem("vitrine18x-draft");location.reload();
}

fieldIds.forEach(id => $("#" + id).addEventListener("input", markDirty));
document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => selectMode(tab.dataset.mode)));
$("#headerLogo").addEventListener("change", event => {handleHeaderLogo(event.target.files[0]);event.target.value="";});
$("#logo1Upload").addEventListener("change", event => {handleLogoUpload(1, event.target.files[0]);event.target.value="";});
$("#logo2Upload").addEventListener("change", event => {handleLogoUpload(2, event.target.files[0]);event.target.value="";});
$("#logo1").addEventListener("change", updateLogoUploadVisibility);
$("#logo2").addEventListener("change", updateLogoUploadVisibility);
$("#generateBtn").addEventListener("click", generateImage);
$("#downloadBtn").addEventListener("click", downloadImage);
$("#resetBtn").addEventListener("click", resetEditor);

restoreDraft();
updateLogoUploadVisibility();
updateModeUI();
updateInstallmentHints();
$("#dateLabel").textContent = monthYear();
renderPoster(false);
