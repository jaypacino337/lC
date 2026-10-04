/* CLAWSIFIED — static, no dependencies.
 * ---------------------------------------------------------------
 * LAUNCH CONFIG: fill these in after you launch. Empty = "soon".
 * Never paste anything here except the real pump.fun mint.
 */
const CONFIG = {
  ticker: "CLAWSF",
  ca: "",          // e.g. the pump.fun mint address, once live
  x: "",           // https://x.com/yourhandle
  telegram: "",    // https://t.me/yourgroup
  pump: "",        // https://pump.fun/coin/<mint>
  dex: "",         // https://dexscreener.com/solana/<pair>
  site: ""         // https://yourdomain (used in the share text)
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- toast ---------- */
const toast = (() => {
  const el = document.createElement("div");
  el.className = "toast"; el.setAttribute("role", "status");
  document.body.appendChild(el);
  let t;
  return msg => { el.textContent = msg; el.classList.add("show"); clearTimeout(t); t = setTimeout(() => el.classList.remove("show"), 2200); };
})();

/* ---------- CA + socials ---------- */
function copy(text) {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand("copy"); } finally { ta.remove(); }
  return Promise.resolve();
}
function initCA() {
  const live = CONFIG.ca.trim().length > 0;
  $$("[data-ca]").forEach(b => {
    b.textContent = live ? `$${CONFIG.ticker} · ${CONFIG.ca.slice(0, 4)}…${CONFIG.ca.slice(-4)} · copy` : b.textContent;
    b.addEventListener("click", () => live ? copy(CONFIG.ca).then(() => toast("CA copied. Verify it on our X before buying.")) : toast("The file is sealed. CA drops at launch, here and on X."));
  });
  if (live) {
    $("#caValue").textContent = CONFIG.ca;
    const btn = $("#caCopy"); btn.disabled = false;
    btn.addEventListener("click", () => copy(CONFIG.ca).then(() => toast("CA copied.")));
  }
  const s = $("#socials");
  [["X", CONFIG.x], ["Telegram", CONFIG.telegram], ["pump.fun", CONFIG.pump], ["DexScreener", CONFIG.dex]].forEach(([name, url]) => {
    const el = document.createElement(url ? "a" : "span");
    el.textContent = url ? name + " ↗" : name + " · soon";
    if (url) { el.href = url; el.target = "_blank"; el.rel = "noopener"; }
    s.appendChild(el);
  });
}

/* ---------- redaction bars ---------- */
document.addEventListener("click", e => {
  const r = e.target.closest(".redact");
  if (r) r.classList.toggle("open");
});
document.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("redact")) { e.preventDefault(); e.target.classList.toggle("open"); }
});

/* ---------- ticker tape ---------- */
function initTape() {
  const bits = ["EYES ONLY", "AGENT 00PAW IS WATCHING", "MONEY MOVED IS NOT MONEY EARNED", "$" + CONFIG.ticker, "TOP 10 · EVERY NIGHT · 12 AM ET", "NO WALLET CONNECT REQUIRED", "THE CATS KEEP THE FILE", "CA: COMING SOON"];
  const line = bits.join("  ✦  ") + "  ✦  ";
  $("#tape").textContent = line + line;
}

/* ---------- squad ---------- */
function catHead({ fur, inner, eye, acc }) {
  const accs = {
    magnifier: `<circle cx="70" cy="58" r="13" fill="rgba(255,255,255,.35)" stroke="#3b3a3f" stroke-width="4"/><path d="M79 68 L92 84" stroke="#3b3a3f" stroke-width="6" stroke-linecap="round"/>`,
    specs: `<circle cx="37" cy="52" r="10" fill="none" stroke="#c8a24a" stroke-width="3"/><circle cx="63" cy="52" r="10" fill="none" stroke="#c8a24a" stroke-width="3"/><path d="M47 52 h6" stroke="#c8a24a" stroke-width="3"/>`,
    headset: `<path d="M16 50 q34 -48 68 0" stroke="#3b3a3f" stroke-width="5" fill="none"/><rect x="10" y="46" width="10" height="16" rx="4" fill="#c8102e"/><rect x="80" y="46" width="10" height="16" rx="4" fill="#c8102e"/><path d="M86 62 q0 16 -22 16" stroke="#3b3a3f" stroke-width="3" fill="none"/>`,
    patch: `<path d="M22 40 L78 62" stroke="#111" stroke-width="3"/><ellipse cx="63" cy="52" rx="11" ry="9" fill="#111"/>`,
    bowtie: `<path d="M38 90 l12 -6 l12 6 v-12 l-12 6 l-12 -6z" fill="#c8102e"/>`
  };
  const eyes = acc === "patch"
    ? `<ellipse cx="37" cy="52" rx="5" ry="6" fill="${eye}"/><rect x="35.5" y="48" width="3" height="8" rx="1.5" fill="#111"/>`
    : `<ellipse cx="37" cy="52" rx="5" ry="6" fill="${eye}"/><ellipse cx="63" cy="52" rx="5" ry="6" fill="${eye}"/><rect x="35.5" y="48" width="3" height="8" rx="1.5" fill="#111"/><rect x="61.5" y="48" width="3" height="8" rx="1.5" fill="#111"/>`;
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <path d="M18 44 L22 12 L42 30Z M82 44 L78 12 L58 30Z" fill="${fur}"/>
    <path d="M24 36 L26 20 L36 30Z M76 36 L74 20 L64 30Z" fill="${inner}"/>
    <ellipse cx="50" cy="56" rx="34" ry="28" fill="${fur}"/>
    ${eyes}
    <path d="M46 64 h8 l-4 4z" fill="#e58aa0"/>
    <path d="M50 68 q-4 5 -9 2 M50 68 q4 5 9 2" stroke="#3b3a3f" stroke-width="2" fill="none" stroke-linecap="round"/>
    <g stroke="${fur === '#f4f1ea' ? '#999' : '#f4f1ea'}" stroke-width="1.5" opacity=".7"><path d="M30 64 L8 60 M30 68 L9 72 M70 64 L92 60 M70 68 L91 72"/></g>
    ${accs[acc] || ""}
  </svg>`;
}
const SQUAD = [
  { name: "SNIFF", role: "Scout · holder discovery", fur: "#d98a3d", inner: "#f2b6a0", eye: "#9bd36a", acc: "magnifier",
    text: "Finds the contenders. Records each holder's first qualifying snapshot and checks they still qualify at the close." },
  { name: "ABACUS", role: "Ledger · trade analysis", fur: "#8c8f98", inner: "#e8b4bf", eye: "#f2c14e", acc: "specs",
    text: "Rebuilds the buys, sells, fees and cost basis. Transfers do not become profit." },
  { name: "TWITCH", role: "Signal · performance", fur: "#5b4636", inner: "#e0a99a", eye: "#6ac7d3", acc: "headset",
    text: "Weighs PNL and open-position change against the field. Checks that every price used is a reliable mark." },
  { name: "HISS", role: "Auditor · integrity", fur: "#26221f", inner: "#d98a9a", eye: "#f2d24e", acc: "patch",
    text: "Flags wash trades, missing evidence and anything that smells off. Nothing ranks until HISS signs." },
  { name: "THE DIRECTOR", role: "Director · the nightly brief", fur: "#f4f1ea", inner: "#f2b6c4", eye: "#6aa3d3", acc: "bowtie",
    text: "Explains the evidence behind the final ranking. Cannot change a score. Cannot authorize a payout." }
];
function initSquad() {
  $("#squadGrid").innerHTML = SQUAD.map((o, i) => `
    <article class="op">
      ${catHead(o)}
      <div>
        <span class="op-no">OPERATIVE 0${i + 1}</span>
        <h3>${o.name}</h3>
        <p class="role">${o.role}</p>
        <p>${o.text}</p>
      </div>
    </article>`).join("");
}

/* ---------- empty board ---------- */
function initBoard() {
  const widths = [72, 58, 80, 64, 50, 76, 60, 68, 54, 70];
  $("#board").innerHTML = widths.map((w, i) => `<li><span>${String(i + 1).padStart(2, "0")}</span><span class="bar" style="width:${w}%"></span><span class="bar" style="width:${40 + (w % 40)}%"></span></li>`).join("");
}

/* ---------- dossier generator (deterministic, local only) ---------- */
function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { return () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (r, a) => a[Math.floor(r() * a.length)];
const DATA = {
  adj: ["Velvet", "Midnight", "Silent", "Copper", "Tuxedo", "Shadow", "Calico", "Static", "Ginger", "Phantom", "Marble", "Smoky", "Neon", "Crooked", "Lucky"],
  noun: ["Paw", "Whisker", "Tail", "Claw", "Purr", "Pounce", "Mittens", "Kitten", "Hairball", "Meowstrom", "Nine", "Tabby", "Prowl", "Catnap"],
  clearance: ["Level 1 · Cardboard Box", "Level 2 · Windowsill", "Level 3 · Top Shelf", "Level 4 · Behind the Fridge", "Level 5 · The Warm Laptop", "Level 9 · Nine Lives"],
  mission: [
    "Tail a whale for 24 hours without being noticed. Do not knock anything off the table.",
    "Infiltrate a dev's Telegram. Report back on whether they are, in fact, cooking.",
    "Find the wallet that bought the top. Offer it emotional support.",
    "Identify which holder sold at 2 AM and why. Bring snacks.",
    "Sit on the keyboard of a jeeter until they reconsider.",
    "Locate the red dot. Report its position. Do not chase it.",
    "Audit a 'fair launch'. Count the bundled wallets twice.",
    "Go undercover as a dog. Hold for one full day. Do not blow your cover."
  ],
  quirk: ["sleeps 18 hours, trades in the other 6", "has never paper-handed a sunbeam", "bribable with tuna", "refuses to use the door, only windows", "knocks charts off tables", "trusts no candle", "purrs when green", "hisses at limit orders"],
  status: ["ACTIVE", "DEEP COVER", "ON A STAKEOUT", "NAPPING (ON DUTY)", "UNDER REVIEW BY HISS"]
};
function openFile(raw) {
  const handle = raw.trim().replace(/^@+/, "").slice(0, 24) || "anon";
  const key = handle.toLowerCase();
  const r = rng(hash(key));
  const name = `${pick(r, DATA.adj)} ${pick(r, DATA.noun)}`;
  const no = String(hash(key) % 9000 + 1000);
  const handler = pick(r, SQUAD);
  const f = {
    name, no, handler: handler.name,
    clearance: pick(r, DATA.clearance), mission: pick(r, DATA.mission),
    quirk: pick(r, DATA.quirk), status: pick(r, DATA.status)
  };
  const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const file = $("#file");
  file.classList.remove("shredding");
  $("#fNo").textContent = f.no;
  $("#fBody").innerHTML = `
    <p class="codename">AGENT ${esc(f.name.toUpperCase())}</p>
    <dl>
      <div class="file-row"><dt>Real name</dt><dd><span class="redact" tabindex="0">@${esc(handle)}</span></dd></div>
      <div class="file-row"><dt>Clearance</dt><dd>${f.clearance}</dd></div>
      <div class="file-row"><dt>Handler</dt><dd>${f.handler}</dd></div>
      <div class="file-row"><dt>Mission</dt><dd><span class="redact" tabindex="0">${f.mission}</span></dd></div>
      <div class="file-row"><dt>Known quirk</dt><dd><span class="redact" tabindex="0">${f.quirk}</span></dd></div>
      <div class="file-row"><dt>Status</dt><dd>${f.status}</dd></div>
    </dl>`;
  $$(".stamp-sm", file).forEach(s => s.remove());
  const st = document.createElement("div"); st.className = "stamp-sm"; st.textContent = "CLAWSIFIED"; $(".codename", file).after(st);
  $("#fActions").hidden = false;
  const text = `My CLAWSIFIED file just leaked.\n\nCodename: AGENT ${f.name.toUpperCase()}\nClearance: ${f.clearance}\nHandler: ${f.handler}\n\nThe cats are watching. $${CONFIG.ticker}`;
  const url = CONFIG.site ? `&url=${encodeURIComponent(CONFIG.site)}` : "";
  $("#shareX").href = `https://x.com/intent/post?text=${encodeURIComponent(text)}${url}`;
}
function initDossier() {
  $("#dossierForm").addEventListener("submit", e => { e.preventDefault(); openFile($("#handle").value); });
  $("#revealAll").addEventListener("click", () => $$("#fBody .redact").forEach(r => r.classList.add("open")));
  $("#shred").addEventListener("click", () => {
    const file = $("#file"); file.classList.add("shredding");
    setTimeout(() => {
      file.classList.remove("shredding");
      $("#fBody").innerHTML = `<p class="file-empty">File shredded. Nothing was ever here.</p>`;
      $("#fNo").textContent = "——"; $("#fActions").hidden = true;
          }, 700);
  });
}

initCA(); initTape(); initSquad(); initBoard(); initDossier();
