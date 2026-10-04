/* HamGPT — static, no dependencies.
 * ---------------------------------------------------------------
 * LAUNCH CONFIG: fill these in after you launch. Empty = "soon".
 * Never paste anything here except the real pump.fun mint.
 */
const CONFIG = {
  ticker: "HAMGPT",
  ca: "",          // the pump.fun mint address, once live
  x: "",           // https://x.com/yourhandle
  telegram: "",    // https://t.me/yourgroup
  pump: "",        // https://pump.fun/coin/<mint>
  dex: "",         // https://dexscreener.com/solana/<pair>
  app: ""          // workspace URL, once the real router exists
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];

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
    if (live) b.textContent = `$${CONFIG.ticker} · ${CONFIG.ca.slice(0, 4)}…${CONFIG.ca.slice(-4)} · copy`;
    b.addEventListener("click", () => live ? copy(CONFIG.ca).then(() => toast("CA copied. Double-check it on our X.")) : toast("Ham hasn't dropped the seed yet. CA comes at launch."));
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

/* ---------- marquee ---------- */
function initMarquee() {
  const bits = ["THE AI THAT NEVER PAYS FOR TOKENS", "$" + CONFIG.ticker, "FREE LANES FIRST", "ONE BALANCE · CHAT + API", "CHEEKS: LOADING", "NO WALLET NEEDED TO TRY", "CA: COMING SOON"];
  const line = bits.join("  🌻  ") + "  🌻  ";
  $("#marquee").textContent = line + line;
}

/* ---------- inline the hamster so its cheeks can puff ---------- */
async function inlineHams() {
  try {
    const svg = await (await fetch("assets/ham.svg")).text();
    $$(".ham").forEach(h => {
      const alt = h.querySelector("img")?.alt || "";
      h.innerHTML = svg;
      const el = h.querySelector("svg");
      el.removeAttribute("width"); el.removeAttribute("height");
      if (alt) { el.setAttribute("role", "img"); el.setAttribute("aria-label", alt); } else el.setAttribute("aria-hidden", "true");
    });
  } catch (_) { /* keep the <img> fallback */ }
}

/* ---------- cheeks ---------- */
let cheek = 0, stashed = 0;
function setCheeks(pct) {
  cheek = Math.max(0, Math.min(100, pct));
  const scale = (1 + cheek / 100 * 0.5).toFixed(3);
  $$(".ham").forEach(h => h.style.setProperty("--cheek", scale));
  $("#cheekPct").textContent = cheek + "%";
  $("#cheekBar").style.width = cheek + "%";
}

/* ---------- demo chat ---------- */
const CHIPS = ["Help me design a Solana app", "Turn my notes into a brief", "Write a tweet for $HAMGPT", "Why is AI so expensive?", "Who are you?"];
const REPLIES = [
  [/solana|app|build|design|code/i, [
    "Ham's Solana app plan: 1) one thing it does, said in one line. 2) a preview that works without a wallet. 3) ship small, tweet often. 4) add a hamster. Non-negotiable.",
    "Start with the screen people see first, then work backwards. Ham builds burrows the same way: entrance first, snack room later."
  ]],
  [/note|brief|summar|tl;?dr/i, [
    "Paste your notes and Ham squishes them into: the goal, three key points, the next step. (The real version lives in the workspace, coming after launch.)",
    "Brief: you have too many notes. Key point: Ham can help. Next step: feed Ham."
  ]],
  [/tweet|post|thread|x\.com/i, [
    "“asked an AI for help. it charged me nothing. it was a hamster.” 🐹 $HAMGPT",
    "“free-tier models, one balance, zero shame. the hamster does the routing.” $HAMGPT"
  ]],
  [/expensive|cost|price of ai|pay|money|cheap|free/i, [
    "Every token costs someone something. Ham's trick: free lanes first, credits only when they run dry. Full cheeks, fuller wallet.",
    "Because big labs pay for big GPUs. Ham pays for nothing. Ham simply knows where the free seeds are."
  ]],
  [/who|what are you|your name|ham\b/i, [
    "I'm Ham: hamster, router, lifestyle. I find free model lanes, run your prompt there and hoard whatever tokens are left.",
    "A hamster in a headset. Some say a genius. Mostly a hamster."
  ]],
  [/wen|moon|pump|price|chart|100x|lambo/i, [
    "Ham doesn't do price predictions. Ham does seeds. 🌻",
    "Wen? When the wheel spins. The wheel is always spinning."
  ]]
];
const FALLBACK = [
  "Ham ran that through a free lane and thought for 0.3 seconds. The answer: start smaller than you think, then ship.",
  "Great question. Ham stuffed it in a cheek for later. (Translation: the real model connects at launch.)",
  "Ham asked three free models. Two were asleep. The third said “it depends”. Ham agrees.",
  "Ham can't answer that for real yet, but Ham found it for free, and that's the whole point.",
  "*spins wheel thoughtfully* …yes."
];
const FULL = ["Mmmph! Mmph mmph mmph. (Ham's cheeks are full. Hit “Empty cheeks”.)", "mmph?? 🐹 (no room. empty the cheeks first.)"];

function addMsg(text, who) {
  const m = document.createElement("div");
  m.className = "msg " + (who === "me" ? "me-msg" : "ham-msg");
  m.textContent = text;
  const log = $("#chatLog"); log.appendChild(m); log.scrollTop = log.scrollHeight;
  return m;
}
function logLine(text, cls = "") {
  const li = document.createElement("li"); li.textContent = text; if (cls) li.className = cls;
  $("#routerLog").appendChild(li);
}
function setFast(on) {
  $("#heroStage").classList.toggle("fast", on);
  $("#miniStage").classList.toggle("fast", on);
}
let busy = false;
async function ask(text) {
  if (busy) return;
  busy = true;
  addMsg(text, "me");
  const typing = addMsg("", "ham"); typing.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  $("#routerLog").innerHTML = "";
  setFast(true);
  $("#heroBubble").textContent = "running! 🏃";

  if (cheek >= 100) {
    logLine("cheeks at capacity → cannot stash", "skip");
    await sleep(700);
  } else {
    const lanes = ["A", "B", "C", "D"].sort(() => Math.random() - .5);
    const fails = rand(1, 2);
    for (let i = 0; i < fails; i++) {
      await sleep(rand(380, 620));
      logLine(`free lane ${lanes[i]} · ${pick(["quota empty", "rate limited", "busy"])} → skip`, "skip");
    }
    await sleep(rand(380, 620));
    const toks = rand(180, 900);
    logLine(`free lane ${lanes[fails]} · ✓ routed · cost $0.00`, "ok");
    stashed += toks;
    logLine(`stashed ~${toks.toLocaleString()} pretend tokens (total ${stashed.toLocaleString()})`);
  }

  let reply;
  if (cheek >= 100) reply = pick(FULL);
  else {
    const hit = REPLIES.find(([re]) => re.test(text));
    reply = pick(hit ? hit[1] : FALLBACK);
  }
  await sleep(300);
  typing.textContent = reply;
  setFast(false);
  setCheeks(cheek + rand(14, 22));
  $("#heroBubble").textContent = cheek >= 100 ? "mmph!! (full)" : pick(["nom.", "more prompts pls", "cheeks: " + cheek + "%", "free tokens?? 👀", "zero dollars spent"]);
  busy = false;
}

function initChat() {
  $("#chips").innerHTML = CHIPS.map(c => `<button type="button">${c}</button>`).join("");
  $("#chips").addEventListener("click", e => { const b = e.target.closest("button"); if (b) ask(b.textContent); });
  $("#chatForm").addEventListener("submit", e => {
    e.preventDefault();
    const v = $("#prompt").value.trim(); if (!v) return;
    $("#prompt").value = ""; ask(v);
  });
  $("#emptyCheeks").addEventListener("click", () => {
    if (cheek === 0) return toast("Cheeks already empty. Ham is hungry.");
    setCheeks(0);
    $("#heroBubble").textContent = "ptooey! 🌻";
    $("#routerLog").innerHTML = '<li class="muted">cheeks emptied into the burrow. ready.</li>';
  });
}

initCA(); initMarquee(); initChat(); setCheeks(0);
inlineHams().then(() => setCheeks(cheek));
