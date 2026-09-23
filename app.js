"use strict";

const $ = (selector) => document.querySelector(selector);
const canvas = $("#poster");
const ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;
const DESIGN_W = 900, DESIGN_H = 1311;

const fieldIds = ["manufacturer","model","storage","ram","warrantyQty","warrantyUnit","cashPrice","price5","price10","price18","condition","display","refresh","processor","specRam","rearCamera","frontCamera","android","network","battery","logo1","logo2"];
let generatedUrl = "";
let toastTimer;
let activeMode = 1;
let headerLogo = null;
let headerLogoData = "";

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

function fitText(text, maxWidth, startSize, family = "Georgia", weight = "700") {
  let size = startSize;
  do { ctx.font = `${weight} ${size}px ${family}`; size -= 1; }
  while (ctx.measureText(text).width > maxWidth && size > 18);
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
  return moneyNumber(input).toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});
}

function installmentTotal(input, count) { return money(moneyNumber(input) * count); }

function drawImageContain(img, x, y, w, h) {
  const sourceW = img.naturalWidth || img.width, sourceH = img.naturalHeight || img.height;
  const scale = Math.min(w / sourceW, h / sourceH);
  const dw = sourceW * scale, dh = sourceH * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function drawLogo(type, x, y, w, h) {
  if (type === "none") return;
  ctx.save();
  if (type === "anatel") {
    ctx.translate(x + w / 2, y + h / 2 - 8);
    ctx.lineWidth = 18;ctx.lineCap = "round";
    ctx.strokeStyle="#ffdc2c";ctx.beginPath();ctx.arc(8,0,70,-1.15,1.15);ctx.stroke();
    ctx.strokeStyle="#2f65ad";ctx.beginPath();ctx.arc(-25,15,38,-1.25,1.25);ctx.stroke();
    ctx.fillStyle="#2ea85e";ctx.textAlign="center";ctx.font="italic 900 28px sans-serif";ctx.fillText("ANATEL",0,76);
  } else if (type === "store") {
    roundedRect(x + 10,y + 18,w - 20,h - 36,12,"#fff","#cdd3d6",2);
    if (headerLogo) drawImageContain(headerLogo,x+22,y+29,w-44,h-58);
    else {ctx.fillStyle="#7b868d";ctx.textAlign="center";ctx.font="800 17px sans-serif";ctx.fillText("LOGOTIPO DA LOJA",x+w/2,y+h/2+6);}
  } else {
    const brand = safe(value("manufacturer"), "MARCA");
    const key = brand.toLocaleLowerCase("pt-BR");
    const palette = key.includes("realme") ? ["#ffd51f","#111"] : key.includes("samsung") ? ["#0c4da2","#fff"] : key.includes("motorola") ? ["#e6e8ea","#111"] : key.includes("xiaomi") ? ["#ff6900","#fff"] : key.includes("apple") ? ["#111","#fff"] : ["#10202c","#fff"];
    roundedRect(x + 8,y + 30,w - 16,h - 60,10,palette[0]);
    const size=fitText(upper(brand),w-40,34,"sans-serif","900");ctx.fillStyle=palette[1];ctx.textAlign="center";ctx.font=`900 ${size}px sans-serif`;ctx.fillText(upper(brand),x+w/2,y+h/2+11);
  }
  ctx.restore();ctx.textAlign="left";
}

function renderPoster(finalMode = false) {
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,W,H);
  ctx.setTransform(W / DESIGN_W,0,0,H / DESIGN_H,0,0);
  ctx.fillStyle = "#fffefb"; ctx.fillRect(0,0,DESIGN_W,DESIGN_H);
  ctx.strokeStyle = "#1f4ea1"; ctx.lineWidth = 5; ctx.strokeRect(12,12,DESIGN_W-24,DESIGN_H-24);

  // Uploaded store logo
  if (headerLogo) drawImageContain(headerLogo,48,42,500,105);
  else {
    roundedRect(55,55,370,78,8,"#f5f3ed","#c8ced1",2);
    ctx.fillStyle="#7b868d";ctx.textAlign="center";ctx.font="800 19px sans-serif";ctx.fillText("CARREGUE O LOGOTIPO DA LOJA",240,101);ctx.textAlign="left";
  }

  // Warranty seal
  ctx.save();ctx.translate(760,91);ctx.rotate(.08);ctx.beginPath();ctx.arc(0,0,68,0,Math.PI*2);ctx.fillStyle="#ffad13";ctx.fill();
  ctx.fillStyle="#10202c";ctx.textAlign="center";ctx.font="900 18px sans-serif";ctx.fillText("GARANTIA",0,-12);
  ctx.font="900 29px sans-serif";ctx.fillText(`${safe(value("warrantyQty"),"0")} ${upper(value("warrantyUnit"))}`,0,22);ctx.restore();ctx.textAlign="left";

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

function drawInstallmentRow(count, priceId, y, highlighted = false) {
  if (highlighted) roundedRect(70,y-32,760,51,7,"#fff0e8");
  ctx.fillStyle=highlighted?"#f05a22":"#1f4ea1";ctx.font="900 25px sans-serif";ctx.fillText(`${count}×`,83,y);
  ctx.fillStyle="#31475b";ctx.font="800 20px sans-serif";ctx.fillText(`de R$ ${money(value(priceId))}`,143,y);
  ctx.textAlign="right";ctx.fillStyle="#66727c";ctx.font="700 16px sans-serif";ctx.fillText(`VALOR TOTAL: R$ ${installmentTotal(value(priceId),count)}`,811,y);ctx.textAlign="left";
}

function drawModeOne() {
  drawCashHeadline(403);
  roundedRect(55,511,790,203,10,"#f5f3ed","#d9d8d2",2);
  ctx.fillStyle="#10202c";ctx.font="900 17px sans-serif";ctx.fillText("CONDIÇÕES PARCELADAS",79,542);
  drawInstallmentRow(5,"price5",581);drawInstallmentRow(10,"price10",635);drawInstallmentRow(18,"price18",689,true);
}

function drawModeTwo() {
  drawCashHeadline(410);
  roundedRect(55,525,790,189,10,"#f5f3ed","#d9d8d2",2);
  ctx.fillStyle="#10202c";ctx.font="900 17px sans-serif";ctx.fillText("ESCOLHA UMA CONDIÇÃO PARCELADA",79,559);
  drawInstallmentRow(5,"price5",613);drawInstallmentRow(10,"price10",681,true);
}

function drawModeThree() {
  ctx.fillStyle="#66727c";ctx.font="800 16px sans-serif";ctx.fillText("CONDIÇÃO 1 • MESMO VALOR TOTAL",58,405);
  roundedRect(55,426,485,288,10,"#f5f3ed","#d9d8d2",2);
  ctx.fillStyle="#f05a22";ctx.font="900 20px sans-serif";ctx.fillText("À VISTA",78,465);
  ctx.font="900 30px sans-serif";ctx.fillText("R$",78,517);const cash=money(value("cashPrice"));const cs=fitText(cash,350,60,"sans-serif","900");ctx.font=`900 ${cs}px sans-serif`;ctx.fillText(cash,126,520);
  ctx.fillStyle="#9aa2a7";ctx.fillRect(78,545,438,2);ctx.textAlign="center";ctx.fillStyle="#1f4ea1";ctx.font="900 17px sans-serif";ctx.fillText("OU",297,575);
  ctx.textAlign="left";ctx.font="900 31px sans-serif";ctx.fillText("5×",79,623);ctx.fillStyle="#31475b";ctx.font="800 21px sans-serif";ctx.fillText(`DE R$ ${money(moneyNumber(value("cashPrice"))/5)}`,145,623);
  ctx.fillStyle="#66727c";ctx.font="700 15px sans-serif";ctx.fillText(`VALOR TOTAL: R$ ${cash}`,79,674);
  ctx.fillStyle="#66727c";ctx.font="800 16px sans-serif";ctx.fillText("CONDIÇÃO 2",573,405);
  roundedRect(558,426,287,288,10,"#10202c");ctx.fillStyle="#d6f34f";ctx.font="900 18px sans-serif";ctx.fillText("PARCELADO",582,466);
  ctx.fillStyle="#fff";ctx.font="900 48px sans-serif";ctx.fillText("10×",582,533);ctx.font="800 18px sans-serif";ctx.fillText("DE R$",584,570);
  const ten=money(value("price10"));const ts=fitText(ten,230,50,"sans-serif","900");ctx.font=`900 ${ts}px sans-serif`;ctx.fillText(ten,582,620);
  ctx.fillStyle="#aeb9bf";ctx.font="700 14px sans-serif";ctx.fillText("VALOR TOTAL",582,661);ctx.fillStyle="#fff";ctx.font="900 21px sans-serif";ctx.fillText(`R$ ${installmentTotal(value("price10"),10)}`,582,690);ctx.textAlign="left";
}

function drawLowerSection(finalMode) {
  ctx.fillStyle="#10202c";ctx.fillRect(55,746,790,4);
  ctx.font="900 21px sans-serif";ctx.fillStyle="#f05a22";ctx.fillText("FICHA TÉCNICA",56,789);
  ctx.fillStyle="#7a858d";ctx.font="700 13px sans-serif";ctx.fillText("INFORMAÇÕES DO APARELHO",224,788);

  const specs = [
    ["CONDIÇÃO", value("condition")], ["DISPLAY", value("display")], ["TELA", value("refresh")],
    ["PROCESSADOR", value("processor")], ["MEMÓRIA RAM", value("specRam") || value("ram")],
    ["CÂMERA TRASEIRA", value("rearCamera")], ["CÂMERA FRONTAL", value("frontCamera")],
    ["SISTEMA", value("android")], ["REDE", value("network")], ["BATERIA", value("battery")]
  ];
  specs.forEach(([label,text], index) => {
    const y = 831 + index * 39;
    ctx.beginPath();ctx.arc(64,y-6,4,0,Math.PI*2);ctx.fillStyle=index===0?"#f05a22":"#1f4ea1";ctx.fill();
    ctx.fillStyle="#596873";ctx.font="900 14px sans-serif";ctx.fillText(label,78,y-10);
    const size = fitText(safe(text),390,24,"sans-serif","800");ctx.fillStyle="#183247";ctx.font=`800 ${size}px sans-serif`;ctx.fillText(safe(text),78,y+14);
    if(index < specs.length-1){ctx.fillStyle="#e7e5df";ctx.fillRect(78,y+20,398,1)}
  });

  // System logo zone
  roundedRect(515,792,310,407,16,"#f4f6f6");
  ctx.save();ctx.beginPath();ctx.roundRect(515,792,310,407,16);ctx.clip();
  ctx.fillStyle="#e9edf0";ctx.beginPath();ctx.arc(740,843,150,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#d6f34f";ctx.beginPath();ctx.arc(799,1102,90,0,Math.PI*2);ctx.fill();
  roundedRect(535,815,270,158,12,"rgba(255,255,255,.94)","#d5dadd",2);
  roundedRect(535,994,270,158,12,"rgba(255,255,255,.94)","#d5dadd",2);
  drawLogo(value("logo1"),542,821,256,146);
  drawLogo(value("logo2"),542,1000,256,146);
  ctx.restore();

  roundedRect(557,1163,226,27,3,"#10202c");ctx.fillStyle="#fff";ctx.font="800 11px sans-serif";ctx.fillText("LOGOTIPOS DO SISTEMA",586,1181);

  // Footer
  ctx.fillStyle="#10202c";ctx.fillRect(55,1227,790,2);
  ctx.font="700 14px sans-serif";ctx.fillStyle="#66727c";ctx.fillText("Destaque válido no mês de emissão • Imagens ilustrativas",56,1263);
  ctx.textAlign="right";ctx.fillStyle="#10202c";ctx.font="900 28px sans-serif";ctx.fillText(monthYear(),842,1267);ctx.textAlign="left";
  if (finalMode) {
    ctx.fillStyle="#a8b0b5";ctx.font="700 10px sans-serif";ctx.fillText("GERADO DIGITALMENTE",56,1293);
  }
}

function markDirty() {
  renderPoster(false);
  if (generatedUrl) { URL.revokeObjectURL(generatedUrl); generatedUrl = ""; }
  $("#downloadBtn").disabled = true;
  $("#actionStatus").textContent = "Alterações aplicadas à prévia. Gere novamente para baixar.";
  saveDraft();
}

function saveDraft() {
  const draft = {activeMode, headerLogoData};
  fieldIds.forEach(id => draft[id] = value(id));
  try { localStorage.setItem("vitrine18x-draft", JSON.stringify(draft)); } catch (_) {}
}

function restoreDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem("vitrine18x-draft") || "null");
    if (!draft) return;
    fieldIds.forEach(id => { if (draft[id] !== undefined) $("#" + id).value = draft[id]; });
    if ([1,2,3].includes(Number(draft.activeMode))) activeMode = Number(draft.activeMode);
    if (draft.headerLogoData) setHeaderLogo(draft.headerLogoData, false);
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
    renderPoster(false);
    if (persist) { saveDraft(); showToast("Logotipo principal carregado"); }
  };
  img.src = dataUrl;
}

function handleHeaderLogo(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) { showToast("Escolha um arquivo de imagem válido"); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const source = new Image();
    source.onload = () => {
      const scale = Math.min(1,1200/source.naturalWidth,360/source.naturalHeight);
      const temp = document.createElement("canvas");temp.width=Math.max(1,Math.round(source.naturalWidth*scale));temp.height=Math.max(1,Math.round(source.naturalHeight*scale));
      temp.getContext("2d").drawImage(source,0,0,temp.width,temp.height);
      setHeaderLogo(temp.toDataURL("image/png"));
    };
    source.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function selectMode(mode) {
  activeMode = Number(mode);
  updateModeUI(); markDirty();
  showToast(`Modelo ${activeMode} selecionado`);
}

function updateModeUI() {
  document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", Number(tab.dataset.mode) === activeMode));
  const rules = {
    1:"Aba 1: apresenta à vista, 5x, 10x e 18x, informando o valor total de cada parcelamento.",
    2:"Aba 2: apresenta à vista, 5x ou 10x, com parcela e valor total claramente separados.",
    3:"Aba 3: à vista e 5x têm o mesmo valor total. A parcela de 5x é calculada automaticamente; 10x pode ter outro total."
  };
  $("#pricingRule").textContent = rules[activeMode];
  $("#price18").closest("label").hidden = activeMode !== 1;
  $("#price5").closest("label").hidden = activeMode === 3;
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
  localStorage.removeItem("vitrine18x-draft"); location.reload();
}

fieldIds.forEach(id => $("#" + id).addEventListener("input", markDirty));
document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => selectMode(tab.dataset.mode)));
$("#headerLogo").addEventListener("change", event => handleHeaderLogo(event.target.files[0]));
$("#generateBtn").addEventListener("click", generateImage);
$("#downloadBtn").addEventListener("click", downloadImage);
$("#resetBtn").addEventListener("click", resetEditor);

restoreDraft();
updateModeUI();
$("#dateLabel").textContent = monthYear();
renderPoster(false);
