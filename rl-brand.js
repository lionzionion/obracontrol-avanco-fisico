/* Identidade RL Engenharia aplicada a todas as páginas do ObraControl.
   Apenas interface — não interfere no Supabase nem nos lançamentos. */
(() => {
  "use strict";
  const logo = "./assets/rl-logo.svg";
  const makeLogo = (className, alt = "RL Engenharia — Fazendo Acontecer") => {
    const img = document.createElement("img");
    img.src = logo;
    img.alt = alt;
    img.className = className;
    img.decoding = "async";
    return img;
  };

  document.title = "RL Engenharia | Controle Físico de Obras";
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.content = "RL Engenharia — gestão de produção, medição física e registros fotográficos de obras em nuvem.";

  const sidebarLogo = document.querySelector(".sidebar .logo");
  if (sidebarLogo) {
    const subtitle = document.createElement("span");
    subtitle.className = "rl-brand-description";
    subtitle.textContent = "SISTEMA DE ACOMPANHAMENTO FÍSICO";
    sidebarLogo.replaceChildren(makeLogo("rl-brand-logo"), subtitle);
  }

  const sidebarCard = document.querySelector(".sidebar .sidecard");
  if (sidebarCard) {
    const title = sidebarCard.querySelector("b");
    const desc = sidebarCard.querySelector("p");
    if (title) title.textContent = "RL ENGENHARIA • AMBEV";
    if (desc) desc.textContent = "Itapissuma/PE · Produção por serviço, evidências fotográficas e medição física.";
  }

  const sidebarFoot = document.querySelector(".sidebar .sidefoot");
  if (sidebarFoot) {
    const oldLogout = sidebarFoot.querySelector("#logoutButton");
    const user = sidebarFoot.querySelector("#cloudUser");
    sidebarFoot.replaceChildren();
    const wordmark = document.createElement("div");
    wordmark.style.cssText = "font-size:11px;font-weight:850;color:#bce866;letter-spacing:.3px;margin-bottom:6px";
    wordmark.textContent = "RL ENGENHARIA · FAZENDO ACONTECER";
    sidebarFoot.append(wordmark);
    if (user) sidebarFoot.append(user);
    sidebarFoot.append(document.createElement("br"));
    if (oldLogout) sidebarFoot.append(oldLogout);
  }

  const auth = document.querySelector(".authPanel");
  if (auth) {
    const eyebrow = auth.querySelector(".eyebrow");
    if (eyebrow) {
      eyebrow.textContent = "RL ENGENHARIA • GESTÃO DE OBRAS";
      eyebrow.before(makeLogo("rl-loginLogo"));
    } else auth.prepend(makeLogo("rl-loginLogo"));
    const title = auth.querySelector("h1");
    if (title) title.textContent = "Controle Físico de Obras";
    const intro = auth.querySelector("h1 + p");
    if (intro) {
      intro.classList.add("rl-authIntro");
      intro.textContent = "Avanço de serviços, medições e fotografias da obra AMBEV Itapissuma — tudo sincronizado na nuvem.";
    }
    const submit = auth.querySelector("#authButton");
    if (submit) submit.textContent = "Acessar sistema RL";
  }

  const main = document.querySelector(".main");
  if (main) {
    const top = main.querySelector(":scope > .eyebrow");
    if (top) top.textContent = "RL ENGENHARIA  /  CONTROLE FÍSICO DE OBRAS";
    const heading = main.querySelector(":scope > .heading h1");
    if (heading) heading.innerHTML = '<span class="rl-highlight">RL Engenharia</span> | ObraControl';
    const headingDesc = main.querySelector(":scope > .heading p");
    if (headingDesc) headingDesc.textContent = "AMBEV • Itapissuma/PE — acompanhamento físico, medições e registros fotográficos";
    const mobile = document.createElement("div");
    mobile.className = "rl-mobileBrand";
    const caption = document.createElement("small");
    caption.textContent = "FAZENDO ACONTECER · EM TEMPO REAL";
    mobile.append(makeLogo("rl-brand-logo"), caption);
    main.prepend(mobile);
  }

  const sections = [
    ["dashboard", "GESTÃO DA OBRA", "Painel de avanço físico"],
    ["launch", "APONTAMENTOS EM CAMPO", "Lançamento diário de produção"],
    ["items", "CATÁLOGO DE SERVIÇOS", "Itens e evidências fotográficas"],
    ["measure", "CONTROLE DE MEDIÇÕES", "Medições físicas aprovadas"],
    ["history", "REGISTROS DA OBRA", "Histórico, exportações e segurança"]
  ];
  for (const [key, kickerText, labelText] of sections) {
    const screen = document.querySelector('.screen[data-screen="' + key + '"]');
    if (!screen) continue;
    const bar = document.createElement("div");
    bar.className = "rl-page-banner";
    const details = document.createElement("div");
    const kicker = document.createElement("div");
    kicker.className = "kicker";
    kicker.textContent = kickerText;
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = labelText;
    details.append(kicker, label);
    bar.append(details, makeLogo("rl-brand-logo", ""));
    screen.prepend(bar);
  }

  for (const id of ["detailDialog", "configDialog"]) {
    const dialog = document.getElementById(id);
    const root = dialog?.querySelector(".dialogInner");
    if (!root) continue;
    const strip = document.createElement("div");
    strip.className = "rl-dialogBrand";
    const word = document.createElement("span");
    word.textContent = "RL ENGENHARIA • FAZENDO ACONTECER";
    strip.append(makeLogo("rl-brand-logo", ""), word);
    root.prepend(strip);
  }

  const lightbox = document.getElementById("lightboxDialog");
  if (lightbox) {
    const title = document.createElement("div");
    title.className = "rl-dialogBrand";
    const word = document.createElement("span");
    word.textContent = "RL ENGENHARIA · REGISTRO FOTOGRÁFICO";
    title.append(makeLogo("rl-brand-logo", ""), word);
    lightbox.prepend(title);
  }

  const footer = document.querySelector(".main .footer");
  if (footer) {
    const line = document.createElement("div");
    line.className = "rl-footerBrand";
    line.append(makeLogo("rl-brand-logo", ""));
    const copy = document.createElement("span");
    copy.textContent = "© RL Engenharia • Fazendo Acontecer • Acompanhamento físico de obras";
    line.append(copy);
    footer.replaceChildren(line);
    const legal = document.createElement("div");
    legal.style.cssText = "margin-top:7px;font-size:11px;color:#91afc3";
    legal.textContent = "AMBEV Itapissuma/PE · Metas físicas baseadas nas propostas de 13/11/2026 · Sem valores monetários.";
    footer.append(legal);
  }

  const connection = document.getElementById("connectionBadge");
  if (connection && !connection.textContent?.includes("ONLINE")) connection.textContent = "☁ RL CLOUD";
})();
