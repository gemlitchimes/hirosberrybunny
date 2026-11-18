// Hiro's Berry Bunny — content script for aistudio.google.com
(() => {
  if (window.__berryBunny) return;
  window.__berryBunny = true;

  const Chime = globalThis.BerryChime;
  const root = document.documentElement;
  let S = { ...Chime.DEFAULTS };
  root.classList.add("berry-on"); // paint immediately; corrected once settings load

  // ---------------------------------------------------------------- settings
  chrome.storage.sync.get(Chime.DEFAULTS, (v) => { S = { ...Chime.DEFAULTS, ...v }; apply(true); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const k in changes) S[k] = changes[k].newValue;
    apply(false);
  });
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "berry-intro" && S.enabled) whenBody(() => intro(true));
  });

  function apply(first) {
    root.classList.toggle("berry-on", !!S.enabled);
    root.classList.toggle("berry-nodecal", !S.decal);
    if (!S.enabled) { resetTurns(); return; }
    whenBody(() => {
      mountDecal();
      clearShell();
      if (first && S.intro) intro(false);
    });
  }

  function whenBody(fn) {
    if (document.body) fn();
    else document.addEventListener("DOMContentLoaded", fn, { once: true });
  }

  // ---------------------------------------------------------------- bunny decal
  function mountDecal() {
    if (document.getElementById("berry-decal")) return;
    const img = document.createElement("img");
    img.id = "berry-decal";
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    img.src = chrome.runtime.getURL("img/bunny.png");
    // lives outside <body> so the page's own framework never removes it
    root.appendChild(img);
  }

  // ---------------------------------------------------------------- intro
  function intro(force) {
    if (!force) {
      try { if (sessionStorage.getItem("berry_intro")) return; sessionStorage.setItem("berry_intro", "1"); } catch (_) { return; }
    }
    document.getElementById("berry-intro")?.remove();
    const w = document.createElement("div");
    w.id = "berry-intro";
    w.setAttribute("role", "presentation");
    w.innerHTML =
      `<img class="bunny" alt="" src="${chrome.runtime.getURL("img/bunny.png")}">` +
      '<svg viewBox="0 0 1000 170"><text x="500" y="125" text-anchor="middle">Hiro\u2019s Berry Bunny</text></svg>' +
      '<p class="credit">created by <b>Poesía of the Gemlit Chimes</b></p>';
    root.appendChild(w);

    // Browsers only allow sound after the page has been clicked once.
    let rang = false;
    const ringIntro = () => {
      if (rang || !S.sound) return;
      rang = true;
      Chime.play("done", S.volume);
      setTimeout(() => Chime.play("medium", S.volume * 0.7), 1400);
      setTimeout(() => Chime.play("medium", S.volume * 0.6), 2600);
    };
    if (navigator.userActivation?.hasBeenActive) ringIntro();

    let gone = false;
    const leave = () => {
      if (gone) return;
      gone = true;
      w.classList.add("out");
      setTimeout(() => w.remove(), 950);
    };
    w.addEventListener("pointerdown", () => { ringIntro(); leave(); });
    setTimeout(leave, 5000);
  }

  // ---------------------------------------------------------------- page shell
  // Find large opaque wrappers AI Studio paints over the whole window and make them see-through.
  function clearShell() {
    if (!S.enabled || !document.body) return;
    const vw = innerWidth, vh = innerHeight, area = vw * vh;
    const points = [[0.5, 0.5], [0.3, 0.4], [0.7, 0.6], [0.5, 0.85], [0.5, 0.15]];
    const keep = "ms-navbar, mat-sidenav, mat-drawer, ms-run-settings, ms-right-side-panel, ms-chat-turn, ms-prompt-input-wrapper, ms-prompt-box, .cdk-overlay-container, #berry-intro, #berry-decal, pre, ms-code-block";
    for (const [fx, fy] of points) {
      for (const el of document.elementsFromPoint(vw * fx, vh * fy)) {
        if (el === root || el.closest(keep)) continue;
        const r = el.getBoundingClientRect();
        if (r.width * r.height < area * 0.35) continue;
        const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/);
        const alpha = m ? (m[1].split(",")[3] ?? "1") : "0";
        if (parseFloat(alpha) > 0.05) el.classList.add("berry-clear");
      }
    }
    alignTurns();
  }

  // Line every framed chat turn up with the prompt box: same left and right edge.
  const TURN_SEL = 'ms-chat-turn .chat-turn-container, ms-chat-turn [class*="chat-turn-container"]';
  const PROMPT_SEL = "ms-prompt-input-wrapper .prompt-input-wrapper, ms-prompt-box, .prompt-input-wrapper, .prompt-box-container";
  const innermost = (sel) => [...document.querySelectorAll(sel)].filter((el) => !el.querySelector(sel));
  function resetTurns() {
    for (const el of document.querySelectorAll("[data-berry-aligned]")) {
      for (const p of ["margin-left", "margin-right", "width", "box-sizing"]) el.style.removeProperty(p);
      el.removeAttribute("data-berry-aligned");
    }
  }
  function alignTurns() {
    resetTurns();
    if (!S.enabled) return;
    const prompt = innermost(PROMPT_SEL).map((el) => el.getBoundingClientRect()).find((r) => r.width > 200);
    if (!prompt) return;
    const turns = innermost(TURN_SEL);
    const rects = turns.map((el) => el.getBoundingClientRect()); // read everything first, then write
    turns.forEach((el, i) => {
      const r = rects[i];
      if (r.width < 100 || r.right < prompt.left || r.left > prompt.right) return;
      const ml = prompt.left - r.left;
      const mr = r.right - prompt.right;
      if (Math.abs(ml) < 0.5 && Math.abs(mr) < 0.5) return;
      if (Math.abs(ml) > 120 || Math.abs(mr) > 120) return; // a different column — leave it alone
      const cs = getComputedStyle(el);
      el.style.setProperty("box-sizing", "border-box", "important");
      el.style.setProperty("width", `${r.width - ml - mr}px`, "important");
      el.style.setProperty("margin-left", `${parseFloat(cs.marginLeft) + ml}px`, "important");
      el.style.setProperty("margin-right", `${parseFloat(cs.marginRight)}px`, "important");
      el.setAttribute("data-berry-aligned", "");
    });
  }
  let clearTimer = 0;
  const scheduleClear = () => { clearTimeout(clearTimer); clearTimer = setTimeout(clearShell, 400); };
  whenBody(() => {
    new MutationObserver(scheduleClear).observe(document.body, { childList: true, subtree: true });
    addEventListener("resize", scheduleClear);
    [800, 2000, 4000, 8000].forEach((ms) => setTimeout(clearShell, ms));
  });

  // ---------------------------------------------------------------- sparkles on the Run button
  const RUN_SEL = "ms-run-button button, button.run-button";
  let lastSpark = 0;
  document.addEventListener("pointerover", (e) => {
    if (!S.enabled || !(e.target instanceof Element)) return;
    const btn = e.target.closest(RUN_SEL);
    if (!btn || btn.disabled || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const now = performance.now();
    if (now - lastSpark < 700) return;
    lastSpark = now;
    const r = btn.getBoundingClientRect();
    for (let i = 0; i < 6; i++) {
      const s = document.createElement("span");
      s.className = "berry-spark";
      s.textContent = i % 3 === 2 ? "🍓" : "✨";
      const a = (i / 6) * Math.PI * 2 + Math.random() * 0.6;
      s.style.left = `${r.left + r.width / 2}px`;
      s.style.top = `${r.top + r.height / 2}px`;
      s.style.setProperty("--dx", `${Math.cos(a) * (r.width / 2 + 22)}px`);
      s.style.setProperty("--dy", `${Math.sin(a) * (r.height / 2 + 22)}px`);
      root.appendChild(s);
      setTimeout(() => s.remove(), 950);
    }
  }, true);

  // ---------------------------------------------------------------- toast
  let toastEl, toastTimer = 0;
  function toast(msg) {
    if (!toastEl || !toastEl.isConnected) {
      toastEl = document.createElement("div");
      toastEl.id = "berry-toast";
      toastEl.setAttribute("role", "status");
      root.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    requestAnimationFrame(() => toastEl.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

  // ---------------------------------------------------------------- sounds
  const ring = (len) => { if (S.enabled && S.sound) Chime.play(len, S.volume); };
  const RUN_RE = /^\s*(run|send|chạy|gửi)\b/i;
  function isRunButton(el) {
    if (el.closest("ms-run-button") || el.classList.contains("run-button")) return true;
    return RUN_RE.test(el.getAttribute("aria-label") || el.textContent || "");
  }
  document.addEventListener("pointerdown", (e) => {
    const el = e.target instanceof Element
      ? e.target.closest('button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="option"], mat-option, .mat-mdc-chip')
      : null;
    if (!el || el.disabled || el.getAttribute("aria-disabled") === "true") return;
    ring(isRunButton(el) ? "long" : Chime.lengthFor(el));
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.target instanceof HTMLTextAreaElement) ring("long");
  }, true);

  // ---------------------------------------------------------------- "answer finished" chime
  function isGenerating() {
    const btn = document.querySelector(RUN_SEL);
    if (!btn) return false;
    const label = `${btn.getAttribute("aria-label") || ""} ${btn.textContent || ""}`;
    return /\b(stop|dừng)\b/i.test(label) || btn.classList.contains("stoppable");
  }
  let wasGenerating = false;
  setInterval(() => {
    const now = isGenerating();
    if (wasGenerating && !now && S.enabled && S.doneChime) {
      if (S.sound) Chime.play("done", S.volume);
      toast("🍓 Bé thỏ trả lời xong rồi nè");
    }
    wasGenerating = now;
  }, 600);
})();
