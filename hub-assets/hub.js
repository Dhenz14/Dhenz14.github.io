import {
  GALAXY_LENS_PROFILES,
  buildGalaxyGeometry,
  galaxyDivisionVisualRadius,
  galaxyPointerPolicy,
  galaxyRenderState,
  placeCanvasLabel,
  projectGalaxyPoint,
  resolveGalaxySelection,
  selectGalaxyHit,
  snapshotFreshness,
  snapshotResponseCanCommit,
  validSnapshot,
} from "./galaxy-core.mjs?v=stark-command-v9";
import {
  humanInstallerBytes,
  validateIdeReleaseLatest,
} from "./ide-release-core.mjs?v=stark-command-v9";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let toastTimer = 0;

function showToast(message) {
  const toast = $("[data-toast]");
  if (!toast) return;
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function safeStorageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Preference persistence is optional; the control still works this visit.
  }
}

function wireMotionToggle() {
  const button = $("[data-motion-toggle]");
  if (!button) return;
  let userPaused = safeStorageGet("hive-hub-motion") === "paused";

  const apply = (announce = false) => {
    const systemReduced = reduceMotion.matches;
    const effectivePaused = systemReduced || userPaused;
    document.body.classList.toggle("motion-paused", effectivePaused);
    button.setAttribute("aria-pressed", String(effectivePaused));
    button.disabled = systemReduced;
    button.setAttribute("aria-disabled", String(systemReduced));
    button.textContent = systemReduced ? "System motion reduced" : effectivePaused ? "Resume motion" : "Pause motion";
    button.title = systemReduced ? "Your operating-system reduced-motion preference is active." : "";
    window.dispatchEvent(new CustomEvent("hive:motion", { detail: { paused: effectivePaused } }));
    if (announce) showToast(effectivePaused ? "Ambient motion paused." : "Ambient motion resumed.");
  };

  apply();
  button.addEventListener("click", () => {
    userPaused = !userPaused;
    safeStorageSet("hive-hub-motion", userPaused ? "paused" : "active");
    apply(true);
  });
  reduceMotion.addEventListener?.("change", () => apply());
}

function wireSceneActivity() {
  const scenes = $$('[data-motion-scene]');
  if (!scenes.length || !("IntersectionObserver" in window)) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => entry.target.classList.toggle("motion-scene-paused", !entry.isIntersecting));
  }, { rootMargin: "140px 0px", threshold: 0.01 });
  scenes.forEach((scene) => observer.observe(scene));
}

function wireTopbar() {
  const topbar = $("[data-topbar]");
  if (!topbar) return;
  const sync = () => topbar.classList.toggle("is-scrolled", window.scrollY > 24);
  sync();
  window.addEventListener("scroll", sync, { passive: true });
}

function wireReveal() {
  const items = $$('[data-reveal]');
  if (!items.length) return;
  if (reduceMotion.matches || !("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("is-visible"));
    return;
  }
  try {
    items.forEach((item) => item.classList.add("reveal-ready"));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8%", threshold: 0.08 });
    items.forEach((item) => observer.observe(item));
  } catch (error) {
    items.forEach((item) => item.classList.remove("reveal-ready"));
    console.warn("Section reveals were disabled safely:", error);
  }
}

function wireSectionNav() {
  const links = $$(".primary-nav a[href^='#']");
  if (!links.length) return;
  const topbar = $("[data-topbar]");
  const sections = links
    .map((link) => document.getElementById(link.hash.slice(1)))
    .filter(Boolean);
  const byId = new Map(links.map((link) => [link.hash.slice(1), link]));
  let scheduled = false;
  const sync = () => {
    scheduled = false;
    const marker = (topbar?.offsetHeight || 0) + 64;
    const visible = sections.find((section) => {
      const rect = section.getBoundingClientRect();
      return rect.top <= marker && rect.bottom > marker;
    });
    links.forEach((link) => link.removeAttribute("aria-current"));
    if (visible) byId.get(visible.id)?.setAttribute("aria-current", "true");
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(sync);
  };
  sync();
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
}

const COMMAND_CYCLE_STEPS = Object.freeze([
  {
    stage: "SEE · SOURCE BOUND",
    title: "See the living body.",
    copy: "The atlas opens on a validated Hive-AI commit. Geometry stays stable while current facts update.",
    proof: "READ ONLY",
  },
  {
    stage: "UNDERSTAND · GRAPH CONTEXT",
    title: "Understand why each signal exists.",
    copy: "Purpose, family, organ, typed reach, blockers, and evidence turn a point of light into an explainable system capability.",
    proof: "EXPLAINED",
  },
  {
    stage: "SELECT · ADVISORY",
    title: "Select the next bounded move.",
    copy: "Self-scan compares proof readiness, leverage, body coverage, risk, and active-work collisions without authorizing execution.",
    proof: "NO AUTHORITY",
  },
  {
    stage: "DISPATCH · HUMAN GATE",
    title: "Prepare, review, then confirm exact intent.",
    copy: "Mission Control freezes the recommendation, owner, destination, proof gate, collision digest, and planned effects before authenticated confirmation.",
    proof: "EXPLICIT INTENT",
  },
  {
    stage: "VERIFY · MISSION BOUND",
    title: "Make the outcome earn its glow.",
    copy: "Immutable receipts, independent verification, landed lineage, and guarded state transitions prevent activity from masquerading as proof.",
    proof: "RECEIPTS",
  },
  {
    stage: "WATCH · ABSORBED",
    title: "Watch the organism change truthfully.",
    copy: "After the work lands, the compiler absorbs current Git truth, the public snapshot converges, and the body re-renders without inventing liveness.",
    proof: "GIT BOUND",
  },
]);

function wireCommandCycle() {
  const root = $("[data-command-cycle]");
  if (!root) return;
  const rows = $$('[data-command-step]', root);
  const walkthrough = $("[data-command-walkthrough]", root);
  const walkthroughLabel = $("[data-command-walkthrough-label]", root);
  const flightdeck = $("[data-command-flightdeck]", root);
  const flightdeckLabel = $("[data-command-flightdeck-label]", root);
  const previousButton = $("[data-command-prev]", root);
  const nextButton = $("[data-command-next]", root);
  const resetButton = $("[data-command-reset]", root);
  const sourceCanvas = $("[data-galaxy-canvas]");
  const echoCanvas = $("[data-command-echo]", root);
  let echoContext = null;
  try {
    echoContext = echoCanvas?.getContext("2d", { alpha: true, desynchronized: true }) || null;
  } catch {
    echoCanvas?.closest(".command-cycle-viewport")?.classList.add("is-unavailable");
  }
  const progress = $("[data-command-progress]", root);
  let current = 0;
  let timer = 0;
  let absorbedTimer = 0;
  let echoRaf = 0;
  let echoBursts = [];
  let running = false;
  let flightdeckReturnFocus = null;

  const paintEcho = () => {
    if (!sourceCanvas || !echoCanvas || !echoContext || !sourceCanvas.width || !sourceCanvas.height) return;
    const width = Math.max(1, Math.round(echoCanvas.clientWidth * Math.min(window.devicePixelRatio || 1, 2)));
    const height = Math.max(1, Math.round(echoCanvas.clientHeight * Math.min(window.devicePixelRatio || 1, 2)));
    if (echoCanvas.width !== width || echoCanvas.height !== height) {
      echoCanvas.width = width;
      echoCanvas.height = height;
    }
    echoContext.clearRect(0, 0, width, height);
    echoContext.drawImage(sourceCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height, 0, 0, width, height);
  };

  const scheduleEcho = () => {
    window.cancelAnimationFrame(echoRaf);
    echoBursts.forEach((id) => window.clearTimeout(id));
    echoBursts = [];
    echoRaf = window.requestAnimationFrame(paintEcho);
    [90, 260, 620, 1100].forEach((delay) => echoBursts.push(window.setTimeout(paintEcho, delay)));
  };

  const select = (index, announce = true) => {
    current = Math.max(0, Math.min(COMMAND_CYCLE_STEPS.length - 1, Number(index) || 0));
    const step = COMMAND_CYCLE_STEPS[current];
    rows.forEach((row, rowIndex) => {
      row.classList.toggle("is-current", rowIndex === current);
      row.classList.toggle("is-complete", rowIndex < current);
      $("button", row)?.setAttribute("aria-pressed", String(rowIndex === current));
    });
    setText("[data-command-stage-index]", String(current + 1).padStart(2, "0"), root);
    setText("[data-command-stage]", step.stage, root);
    setText("[data-command-title]", step.title, root);
    setText("[data-command-copy]", step.copy, root);
    setText("[data-command-proof]", step.proof, root);
    setText("[data-command-position]", String(current + 1), root);
    setText("[data-command-viewport-stage]", step.stage.split(" · ")[0], root);
    if (previousButton) previousButton.disabled = current === 0;
    if (nextButton) nextButton.disabled = current === COMMAND_CYCLE_STEPS.length - 1;
    if (progress) progress.style.width = `${(current / Math.max(COMMAND_CYCLE_STEPS.length - 1, 1)) * 100}%`;
    window.hiveCommandStage = current;
    window.dispatchEvent(new CustomEvent("hive:command-stage", { detail: { index: current, step } }));
    root.dataset.commandVisual = String(current);
    scheduleEcho();
    if (announce) showToast(`${step.stage.split(" · ")[0]} — ${step.title}`);
  };

  const stop = (announce = false) => {
    window.clearInterval(timer);
    timer = 0;
    running = false;
    walkthrough?.setAttribute("aria-pressed", "false");
    if (walkthroughLabel) walkthroughLabel.textContent = current === COMMAND_CYCLE_STEPS.length - 1 ? "Walk command cycle again" : "Run command cycle";
    if (root.dataset.commandState === "walking") root.dataset.commandState = "idle";
    if (announce) showToast("Command-cycle walkthrough paused.");
  };

  const setFlightdeck = (active, announce = true) => {
    const enabled = Boolean(active);
    if (enabled && document.activeElement instanceof HTMLElement) flightdeckReturnFocus = document.activeElement;
    root.classList.toggle("is-flightdeck", enabled);
    document.body.classList.toggle("command-flightdeck-open", enabled);
    flightdeck?.setAttribute("aria-pressed", String(enabled));
    if (enabled) {
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-modal", "true");
      root.setAttribute("aria-label", "Living command cycle flightdeck");
    } else {
      root.removeAttribute("role");
      root.removeAttribute("aria-modal");
      root.removeAttribute("aria-label");
    }
    if (flightdeckLabel) flightdeckLabel.textContent = enabled ? "Exit flightdeck" : "Enter flightdeck";
    if (enabled) {
      root.classList.remove("motion-scene-paused");
      scheduleEcho();
      flightdeck?.focus({ preventScroll: true });
    } else if (flightdeckReturnFocus?.isConnected) {
      flightdeckReturnFocus.focus({ preventScroll: true });
    }
    if (announce) showToast(enabled ? "Projector flightdeck online. Arrow keys move between stages; Escape exits." : "Projector flightdeck closed.");
  };

  const start = () => {
    window.clearTimeout(absorbedTimer);
    stop();
    root.dataset.commandState = "walking";
    running = true;
    walkthrough?.setAttribute("aria-pressed", "true");
    if (walkthroughLabel) walkthroughLabel.textContent = "Pause command cycle";
    select(0, false);
    timer = window.setInterval(() => {
      if (current >= COMMAND_CYCLE_STEPS.length - 1) {
        stop();
        showToast("Cycle complete. Open the command body to perform the guarded workflow.");
        return;
      }
      select(current + 1, false);
    }, 1500);
  };

  walkthrough?.addEventListener("click", () => {
    if (reduceMotion.matches || document.body.classList.contains("motion-paused")) {
      stop();
      root.dataset.commandState = "manual";
      select(current >= COMMAND_CYCLE_STEPS.length - 1 ? 0 : current + 1);
      if (walkthroughLabel) walkthroughLabel.textContent = current === COMMAND_CYCLE_STEPS.length - 1 ? "Restart command cycle" : "Next command stage";
      return;
    }
    if (running) stop(true);
    else start();
  });

  rows.forEach((row, rowIndex) => {
    $("button", row)?.addEventListener("click", () => {
      stop();
      root.dataset.commandState = "manual";
      select(rowIndex);
    });
  });

  previousButton?.addEventListener("click", () => {
    stop();
    root.dataset.commandState = "manual";
    select(current - 1);
  });

  nextButton?.addEventListener("click", () => {
    stop();
    root.dataset.commandState = "manual";
    select(current + 1);
  });

  resetButton?.addEventListener("click", () => {
    stop();
    root.dataset.commandState = "idle";
    select(0, false);
    showToast("Command cycle recovered to the source-bound overview.");
  });

  flightdeck?.addEventListener("click", () => setFlightdeck(!root.classList.contains("is-flightdeck")));

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || (event.shiftKey && event.key !== "Tab")) return;
    const target = event.target;
    const editable = target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    const interactive = target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(target.tagName));
    if (event.key === "Tab" && root.classList.contains("is-flightdeck")) {
      const focusable = $$('button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])', root)
        .filter((node) => !node.hasAttribute("hidden") && node.getClientRects().length > 0);
      if (focusable.length) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
      return;
    }
    if (event.key === "Escape" && root.classList.contains("is-flightdeck")) {
      event.preventDefault();
      setFlightdeck(false);
      return;
    }
    if (!editable && event.key.toLowerCase() === "c") {
      event.preventDefault();
      walkthrough?.click();
      return;
    }
    if (!editable && event.key.toLowerCase() === "f") {
      event.preventDefault();
      setFlightdeck(!root.classList.contains("is-flightdeck"));
      return;
    }
    if (!editable && root.classList.contains("is-flightdeck") && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      stop();
      root.dataset.commandState = "manual";
      select(current + (event.key === "ArrowRight" ? 1 : -1));
      return;
    }
    if (interactive) return;
  });

  window.addEventListener("hive:motion", (event) => {
    if (event.detail?.paused && running) stop();
  });

  window.addEventListener("hive:snapshot", (event) => {
    const snapshot = event.detail?.snapshot;
    const previous = event.detail?.previous;
    const sourceCommit = snapshot?.hiveAi?.sourceCommit;
    if (sourceCommit) setText("[data-command-source]", sourceCommit.slice(0, 8), root);
    scheduleEcho();
    if (!previous || previous.hiveAi?.sourceCommit === sourceCommit) return;
    stop();
    window.clearTimeout(absorbedTimer);
    root.dataset.commandState = "absorbed";
    select(COMMAND_CYCLE_STEPS.length - 1, false);
    setText("[data-command-title]", "New source truth absorbed.", root);
    setText("[data-command-copy]", `${previous.hiveAi.sourceCommit.slice(0, 8)} → ${sourceCommit.slice(0, 8)}. The validated snapshot changed; no runtime state was inferred.`, root);
    setText("[data-command-proof]", "SOURCE CHANGED", root);
    showToast(`Living galaxy absorbed Hive-AI ${sourceCommit.slice(0, 8)}.`);
    absorbedTimer = window.setTimeout(() => {
      if (root.dataset.commandState === "absorbed") root.dataset.commandState = "idle";
    }, 8000);
  });

  window.addEventListener("hive:snapshot-error", () => {
    setText("[data-command-source]", "unavailable", root);
  });

  window.addEventListener("resize", scheduleEcho, { passive: true });
  window.addEventListener("pagehide", () => {
    stop();
    setFlightdeck(false, false);
    window.cancelAnimationFrame(echoRaf);
    echoBursts.forEach((id) => window.clearTimeout(id));
  });

  select(0, false);
}

const LENSES = Object.freeze({
  mastery: {
    index: "01",
    code: "BODY",
    eyebrow: "Organization",
    title: "Body lens",
    copy: "Stable authored geometry reveals 640 neurons through sixteen divisions and sixty-four families.",
    statA: "640",
    labelA: "neurons",
    statB: "16",
    labelB: "divisions",
    boundary: "Topology only. The public atlas does not project mastery or Twitch truth.",
  },
  artifact: {
    index: "02",
    code: "ART",
    eyebrow: "Durable structure",
    title: "Artifacts make work inspectable.",
    copy: "Mapped components become navigable when paths, ownership, and generated graph bindings stay explicit.",
    statA: "—",
    labelA: "components",
    statB: "—",
    labelB: "organs",
    boundary: "A visible artifact is not automatically current, approved, or releasable.",
  },
  evidence: {
    index: "03",
    code: "EVD",
    eyebrow: "Provenance",
    title: "Evidence gives every edge a reason.",
    copy: "The source-generated graph records typed provenance links without exposing private corpus contents.",
    statA: "—",
    labelA: "typed links",
    statB: "—",
    labelB: "mapped nodes",
    boundary: "Graph presence is context—not proof that a claim is true or a service is healthy.",
  },
  runtime: {
    index: "04",
    code: "RUN",
    eyebrow: "Local state",
    title: "Runtime truth stays with the runtime.",
    copy: "Chat, queues, health, models, and credentials remain on the local Hive-AI surface. This static page deliberately shows no invented live counters.",
    statA: "LOCAL",
    labelA: "chat boundary",
    statB: "0",
    labelB: "public prompts",
    boundary: "Start and authenticate Hive-AI locally before treating any runtime surface as available.",
  },
  product: {
    index: "05",
    code: "PRD",
    eyebrow: "User journey",
    title: "The product joins intelligence to proof.",
    copy: "Hive-AI, HivePoA, NeuraChain, Hive IDE, the second brain, and pooled compute form distinct organs in one operator-governed loop.",
    statA: "6",
    labelA: "primary organs",
    statB: "1",
    labelB: "shared body",
    boundary: "Product architecture does not make Pages a backend or a release trust root.",
  },
});

function setText(selector, value, root = document) {
  const node = $(selector, root);
  if (node) node.textContent = value;
}

function selectLens(name, focusNode = false) {
  const lens = LENSES[name];
  if (!lens) return;
  const map = $("[data-anatomy-map]");
  if (map) map.dataset.lensView = name;
  $$('[data-lens]').forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.lens === name));
  });
  $$('[data-node]').forEach((node) => node.classList.toggle("is-active", node.dataset.node === name));
  setText("[data-lens-code]", lens.code);
  setText("[data-lens-eyebrow]", lens.eyebrow);
  setText("[data-lens-title]", lens.title);
  setText("[data-lens-copy]", lens.copy);
  setText("[data-lens-stat-a]", lens.statA);
  setText("[data-lens-label-a]", lens.labelA);
  setText("[data-lens-stat-b]", lens.statB);
  setText("[data-lens-label-b]", lens.labelB);
  setText("[data-lens-boundary]", lens.boundary);
  window.dispatchEvent(new CustomEvent("hive:lens", { detail: { name } }));
  if (focusNode) $(`[data-lens="${name}"]`)?.focus();
}

function wireLenses() {
  $$('[data-lens]').forEach((button, index, buttons) => {
    button.disabled = false;
    button.addEventListener("click", () => selectLens(button.dataset.lens));
    button.addEventListener("keydown", (event) => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % buttons.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + buttons.length) % buttons.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = buttons.length - 1;
      selectLens(buttons[next].dataset.lens, true);
    });
  });
}

const SNAPSHOT_REFRESH_MS = 60_000;
let snapshotRefreshTimer = 0;
let snapshotRefreshStarted = false;
let snapshotRequestGeneration = 0;
let snapshotRequestController = null;

function setSourceBadge(state, label, title) {
  const badge = $(".source-badge");
  if (!badge) return;
  if (state) badge.dataset.state = state;
  else badge.removeAttribute("data-state");
  badge.title = title;
  const textNode = badge.lastChild;
  if (textNode) textNode.textContent = ` ${label}`;
}

async function loadSourceSnapshot() {
  const requestGeneration = ++snapshotRequestGeneration;
  snapshotRequestController?.abort();
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  snapshotRequestController = controller;
  try {
    const response = await fetch("/hub-assets/hub-facts.json", {
      cache: "no-store",
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!response.ok) throw new Error(`snapshot HTTP ${response.status}`);
    const snapshot = await response.json();
    if (!await validSnapshot(snapshot)) throw new Error("snapshot contract rejected");
    if (!snapshotResponseCanCommit({
      requestGeneration,
      currentGeneration: snapshotRequestGeneration,
      aborted: Boolean(controller?.signal.aborted),
    })) return false;
    const facts = snapshot.hiveAi;
    const values = {
      neurons: facts.neurons,
      twitches: facts.twitches,
      pmOnly: facts.pmOnly,
      components: facts.components,
      nodes: facts.nodes.toLocaleString("en-US"),
      edges: facts.edges.toLocaleString("en-US"),
      moons: facts.moons,
      divisions: facts.divisions,
    };
    Object.entries(values).forEach(([key, value]) => {
      $$(`[data-fact="${key}"]`).forEach((node) => { node.textContent = String(value); });
    });
    Object.assign(LENSES.mastery, {
      copy: `Stable authored geometry reveals ${facts.neurons} neurons through ${facts.divisions} divisions and ${facts.families} families.`,
      statA: String(facts.neurons),
      statB: String(facts.divisions),
    });
    Object.assign(LENSES.artifact, {
      copy: `${facts.components} mapped components become navigable when paths, ownership, and generated graph bindings stay explicit.`,
      statA: String(facts.components),
      statB: String(facts.organs),
    });
    Object.assign(LENSES.evidence, {
      copy: `The source-generated graph records ${facts.edges.toLocaleString("en-US")} typed links across ${facts.nodes.toLocaleString("en-US")} nodes. The public view exposes structure, not private corpus contents.`,
      statA: facts.edges.toLocaleString("en-US"),
      statB: facts.nodes.toLocaleString("en-US"),
    });
    const activeLens = $('[data-lens][aria-pressed="true"]')?.dataset.lens;
    if (activeLens) selectLens(activeLens);
    const captured = new Date(snapshot.capturedAt);
    const captureLabel = Number.isNaN(captured.getTime())
      ? "source-bound"
      : new Intl.DateTimeFormat("en-GB", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false,
      }).format(captured).replace(",", "") + " UTC";
    setText("[data-source-stamp]", `Hive-AI main @ ${facts.sourceCommit.slice(0, 7)} · ${captureLabel}`);
    setText("[data-graph-hash]", facts.graphHash.slice(0, 8));
    const previous = window.hivePublicSnapshot;
    window.hivePublicSnapshot = snapshot;
    document.body.classList.remove("snapshot-unavailable");
    const freshness = snapshotFreshness(snapshot.capturedAt);
    if (!snapshot.refresh?.automaticBridgeEnabled) {
      setSourceBadge("stale", "Source-bound snapshot", `Exact Hive-AI ${facts.sourceCommit.slice(0, 12)} snapshot; automatic convergence is not currently active.`);
    } else if (freshness.state === "critical") {
      setSourceBadge("stale", "Sync delayed · last good", `The last validated snapshot is more than one hour old (${snapshot.capturedAt}); no counters were reset.`);
    } else if (freshness.state === "delayed") {
      setSourceBadge("stale", "Last-good snapshot", `Automatic convergence is delayed; retaining the validated snapshot captured ${snapshot.capturedAt}.`);
    } else {
      setSourceBadge("", "Living main snapshot", `Exact published view of Hive-AI main captured ${snapshot.capturedAt}; not runtime telemetry.`);
    }
    if (!previous
      || previous.hiveAi?.sourceCommit !== snapshot.hiveAi.sourceCommit
      || previous.galaxy?.projectionHash !== snapshot.galaxy.projectionHash) {
      window.dispatchEvent(new CustomEvent("hive:snapshot", { detail: { snapshot, previous } }));
    }
    return true;
  } catch (error) {
    if (error?.name === "AbortError" || requestGeneration !== snapshotRequestGeneration) return false;
    if (window.hivePublicSnapshot) {
      setSourceBadge("stale", "Last-good snapshot", "The latest same-origin refresh failed; retaining the last validated source snapshot and retrying.");
    } else {
      document.body.classList.add("snapshot-unavailable");
      setSourceBadge("blocked", "Snapshot unavailable", "No validated source snapshot is available.");
      setText("[data-source-stamp]", "Snapshot unavailable — embedded fallback only");
      window.dispatchEvent(new CustomEvent("hive:snapshot-error"));
    }
    console.warn("Hive source snapshot could not be refreshed:", error);
    return false;
  } finally {
    if (snapshotRequestController === controller) snapshotRequestController = null;
  }
}

function scheduleSnapshotRefresh() {
  window.clearTimeout(snapshotRefreshTimer);
  snapshotRefreshTimer = 0;
  if (document.hidden) return;
  snapshotRefreshTimer = window.setTimeout(() => {
    void loadSourceSnapshot().finally(() => {
      if (!document.hidden) scheduleSnapshotRefresh();
    });
  }, SNAPSHOT_REFRESH_MS);
}

function startSnapshotRefresh() {
  if (snapshotRefreshStarted) return;
  snapshotRefreshStarted = true;
  document.addEventListener("visibilitychange", () => {
    window.clearTimeout(snapshotRefreshTimer);
    snapshotRefreshTimer = 0;
    if (document.hidden) {
      snapshotRequestGeneration += 1;
      snapshotRequestController?.abort();
      return;
    }
    void loadSourceSnapshot().finally(scheduleSnapshotRefresh);
  });
  scheduleSnapshotRefresh();
}

function humanBytes(value) {
  const bytes = Number(value);
  if (!Number.isSafeInteger(bytes) || bytes < 1) return "—";
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function platformLabel(platform, architecture) {
  const labels = { linux: "Linux", windows: "Windows", darwin: "macOS" };
  return `${labels[platform] || platform} / ${architecture}`;
}

function quorumLabel(value) {
  const match = /^(\d+)-of-(\d+)-hive-api$/.exec(value || "");
  return match ? `${match[1]} of ${match[2]} endpoints` : value;
}

function blockedRelease(reason) {
  const consoleNode = $("[data-release-console]");
  if (consoleNode) consoleNode.dataset.state = "blocked";
  setText("[data-release-status]", `No package authorized — ${reason}`);
  setText("[data-poa-mini-state]", "Signed index unavailable");
  setText("[data-policy-credit]", "—");
  setText("[data-policy-quorum]", "—");
  const firstStep = $("[data-release-path-index]");
  if (firstStep) {
    firstStep.dataset.state = "blocked";
    setText("small", "Index verification failed; no package is authorized.", firstStep);
  }
  const indexEvidence = $("[data-release-evidence-index]");
  if (indexEvidence) {
    indexEvidence.dataset.state = "blocked";
    setText("strong", "Unavailable", indexEvidence);
  }
  const download = $("[data-release-download]");
  if (download) {
    download.classList.add("is-disabled");
    download.setAttribute("aria-disabled", "true");
    download.setAttribute("tabindex", "-1");
    download.removeAttribute("href");
  }
}

function renderRelease(authorization) {
  const release = authorization.release;
  const policy = release.testerNetwork;
  const digest = release.artifactDigests?.[release.primaryArtifact];
  const consoleNode = $("[data-release-console]");
  if (consoleNode) consoleNode.dataset.state = "verified";
  setText("[data-release-status]", "Signed release index verified");
  setText("[data-release-sequence]", `Release sequence ${release.releaseSequence}`);
  setText("[data-release-version]", release.version);
  setText("[data-release-artifact]", release.primaryArtifact);
  setText("[data-release-platform]", platformLabel(release.platform, release.architecture));
  setText("[data-release-bytes]", humanBytes(release.bytes));
  setText("[data-release-workers]", `${policy.bootstrap.minimumWorkers} distinct`);
  setText("[data-release-entropy]", quorumLabel(policy.proofPolicy.irreversibleEntropyQuorum));
  setText("[data-release-credit]", `${policy.creditPolicy.amountPerAcceptedProof} test credits`);
  setText("[data-release-replay]", `${policy.creditPolicy.replayAward} credits`);
  setText("[data-release-sha]", digest);
  setText("[data-release-cid]", release.primaryArtifactCid);
  setText("[data-poa-mini-state]", `Index verified · release ${release.releaseSequence}`);
  setText("[data-poa-credit-mini]", `${policy.creditPolicy.amountPerAcceptedProof} test credits`);
  setText("[data-policy-credit]", String(policy.creditPolicy.amountPerAcceptedProof));
  const quorum = /^(\d+)-of-(\d+)-hive-api$/.exec(policy.proofPolicy.irreversibleEntropyQuorum || "");
  setText("[data-policy-quorum]", quorum ? `${quorum[1]} / ${quorum[2]}` : "Verified");
  setText("[data-release-path-workers]", `Run ${policy.bootstrap.minimumWorkers} enrolled workers`);
  setText(
    "[data-release-path-credit]",
    `Expected: ${policy.creditPolicy.amountPerAcceptedProof} test-only credits; replay: ${policy.creditPolicy.replayAward}.`,
  );
  const firstStep = $("[data-release-path-index]");
  if (firstStep) {
    firstStep.dataset.state = "verified";
    setText("small", "Pinned signature and fixed policy verified.", firstStep);
  }
  const indexEvidence = $("[data-release-evidence-index]");
  if (indexEvidence) {
    indexEvidence.dataset.state = "verified";
    setText("strong", "Verified", indexEvidence);
  }

  const download = $("[data-release-download]");
  if (download) {
    download.classList.remove("is-disabled");
    download.removeAttribute("aria-disabled");
    download.removeAttribute("tabindex");
    download.setAttribute("href", "/HivePoA/download/");
  }

  const values = { sha: digest, cid: release.primaryArtifactCid };
  $$('[data-copy-release]').forEach((button) => {
    const kind = button.dataset.copyRelease;
    button.disabled = !values[kind];
    button.dataset.copyValue = values[kind] || "";
  });
}

async function loadAuthorizedRelease() {
  if (!$("[data-release-console]")) return;
  try {
    const [{ verifyAuthorizedTesterNetworkIndex, PINNED_CHANNEL_INDEX_PUBLIC_KEY_SHA256 }, response] = await Promise.all([
      import("/HivePoA/distribution-assets/tester-network-authorization.js"),
      fetch("/HivePoA/", { cache: "no-store", headers: { Accept: "text/html" } }),
    ]);
    setText("[data-release-key-fingerprint]", PINNED_CHANNEL_INDEX_PUBLIC_KEY_SHA256);
    if (!response.ok) throw new Error(`HivePoA HTTP ${response.status}`);
    const html = await response.text();
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const fixture = parsed.getElementById("release-index-fixture");
    if (!fixture?.textContent) throw new Error("signed index fixture missing");
    const index = JSON.parse(fixture.textContent);
    const authorization = await verifyAuthorizedTesterNetworkIndex(index);
    if (!authorization.ok) throw new Error(authorization.reason || "authorization rejected");
    renderRelease(authorization);
  } catch (error) {
    blockedRelease(error instanceof Error ? error.message : "verification failed");
  }
}

function blockIdeRelease(reason = "release feed unavailable") {
  const root = $("[data-ide-release]");
  if (!root) return;
  root.dataset.state = "blocked";
  setText("[data-ide-status]", "Download not published");
  setText("[data-ide-version]", "Hive IDE public tester");
  setText("[data-ide-channel]", "Fail-closed");
  setText("[data-ide-size]", "Unavailable");
  setText("[data-ide-source]", "Unavailable");
  setText("[data-ide-sha]", "Unavailable until the release feed validates");
  const detail = $("[data-ide-status-detail]");
  if (detail) {
    detail.textContent = "The page did not authorize a download. Try again later or inspect the source repository.";
    detail.title = reason;
  }
  for (const selector of ["[data-ide-download]", "[data-ide-start-here]", "[data-ide-manifest]", "[data-ide-release-page]"]) {
    for (const link of $$(selector)) {
      link.classList.add("is-disabled");
      link.setAttribute("aria-disabled", "true");
      link.setAttribute("tabindex", "-1");
      link.removeAttribute("href");
    }
  }
  const copy = $("[data-copy-ide-sha]");
  if (copy) {
    copy.disabled = true;
    copy.dataset.copyValue = "";
  }
}

function renderIdeRelease(latest) {
  const root = $("[data-ide-release]");
  if (!root) return;
  root.dataset.state = "ready";
  const signed = latest.publisherAuthenticated;
  setText("[data-ide-status]", signed ? "Publisher-authenticated tester ready" : "Unsigned public tester ready");
  setText("[data-ide-status-detail]", signed
    ? "The exact Windows installer is published with a verified publisher signature."
    : "The exact Windows installer is published over HTTPS and bound to the SHA-256 below. Windows may show a warning.");
  setText("[data-ide-version]", `Hive IDE ${latest.version}`);
  setText("[data-ide-channel]", signed ? "Publisher authenticated" : "Unsigned tester");
  setText("[data-ide-size]", humanInstallerBytes(latest.installerSizeBytes));
  setText("[data-ide-source]", latest.sourceCommit.slice(0, 12));
  setText("[data-ide-sha]", latest.installerSha256);
  setText("[data-ide-warning]", signed
    ? "Publisher signature verified by the release contract. SmartScreen reputation can still take time."
    : "Windows may say “Windows protected your PC.” Choose More info → Run anyway only after matching this SHA-256.");

  const download = $("[data-ide-download]");
  if (download) {
    download.href = latest.installerUrl;
    download.classList.remove("is-disabled");
    download.removeAttribute("aria-disabled");
    download.removeAttribute("tabindex");
  }
  const startHereUrl = new URL("START-HERE.txt", latest.installerUrl).href;
  for (const startHere of $$("[data-ide-start-here]")) {
    startHere.href = startHereUrl;
    startHere.classList.remove("is-disabled");
    startHere.removeAttribute("aria-disabled");
    startHere.removeAttribute("tabindex");
  }
  const manifest = $("[data-ide-manifest]");
  if (manifest) {
    manifest.href = latest.manifestUrl;
    manifest.classList.remove("is-disabled");
    manifest.removeAttribute("aria-disabled");
    manifest.removeAttribute("tabindex");
  }
  const releasePage = $("[data-ide-release-page]");
  if (releasePage) {
    releasePage.href = `https://github.com/Dhenz14/Dhenz14.github.io/releases/tag/${latest.releaseTag}`;
    releasePage.classList.remove("is-disabled");
    releasePage.removeAttribute("aria-disabled");
    releasePage.removeAttribute("tabindex");
  }
  const copy = $("[data-copy-ide-sha]");
  if (copy) {
    copy.disabled = false;
    copy.dataset.copyValue = latest.installerSha256;
  }
}

async function loadIdeRelease() {
  if (!$("[data-ide-release]")) return;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch("/downloads/hive-ide/latest.json", {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Hive IDE feed HTTP ${response.status}`);
    const declaredBytes = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredBytes) && declaredBytes > 64 * 1024) {
      throw new Error("Hive IDE feed exceeded its declared size bound");
    }
    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > 64 * 1024) {
      throw new Error("Hive IDE feed exceeded its body size bound");
    }
    renderIdeRelease(validateIdeReleaseLatest(JSON.parse(body)));
  } catch (error) {
    blockIdeRelease(error instanceof Error ? error.message : "release feed unavailable");
  } finally {
    window.clearTimeout(timeout);
  }
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("copy command rejected");
}

function wireCopyButtons() {
  $$('[data-copy-release]').forEach((button) => {
    button.addEventListener("click", async () => {
      const value = button.dataset.copyValue;
      if (!value) return;
      const original = button.textContent;
      try {
        await copyText(value);
        button.textContent = "Copied";
        showToast(button.dataset.copyRelease === "cid" ? "IPFS CID copied." : "SHA-256 digest copied.");
      } catch {
        button.textContent = "Copy failed";
        showToast("Clipboard access was refused. Select the value manually.");
      }
      window.setTimeout(() => { button.textContent = original; }, 2200);
    });
  });
}

function wireIdeReleaseCopy() {
  const button = $("[data-copy-ide-sha]");
  if (!button) return;
  button.addEventListener("click", async () => {
    const value = button.dataset.copyValue;
    if (!value) return;
    const original = button.textContent;
    try {
      await copyText(value);
      button.textContent = "Copied";
      showToast("Hive IDE SHA-256 copied.");
    } catch {
      button.textContent = "Copy failed";
      showToast("Clipboard access was refused. Select the digest manually.");
    }
    window.setTimeout(() => { button.textContent = original; }, 2200);
  });
}

function wireLocalChatNotice() {
  $$('[href^="http://127.0.0.1:"]').forEach((link) => {
    link.addEventListener("click", () => {
      showToast("Opening a local Hive-AI surface. Availability is not checked; if it is offline, the new tab will stay unavailable.");
    });
  });
}

class FieldRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: true });
    if (!this.context) return;
    this.nodes = [];
    this.pointer = { x: 0.5, y: 0.5, active: false };
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.raf = 0;
    this.paused = reduceMotion.matches || document.body.classList.contains("motion-paused");
    this.intersecting = true;
    this.documentVisible = !document.hidden;
    this.visible = this.documentVisible;
    this.seed = 0x48495645;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(document.documentElement);
    window.addEventListener("pointermove", (event) => {
      this.pointer.x = event.clientX / Math.max(window.innerWidth, 1);
      this.pointer.y = event.clientY / Math.max(window.innerHeight, 1);
      this.pointer.active = true;
    }, { passive: true });
    window.addEventListener("pointerout", (event) => {
      if (!event.relatedTarget) this.pointer.active = false;
    }, { passive: true });
    document.addEventListener("visibilitychange", () => {
      this.documentVisible = !document.hidden;
      this.visible = this.documentVisible && this.intersecting;
      this.syncLoop();
    });
    window.addEventListener("hive:motion", (event) => {
      this.paused = Boolean(event.detail?.paused) || reduceMotion.matches;
      this.syncLoop();
    });
    if ("IntersectionObserver" in window) {
      this.intersectionObserver = new IntersectionObserver(([entry]) => {
        this.intersecting = Boolean(entry?.isIntersecting);
        this.visible = this.documentVisible && this.intersecting;
        this.syncLoop();
      });
      this.intersectionObserver.observe(canvas);
    }
    this.resize();
  }

  random() {
    this.seed = (1664525 * this.seed + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.max(1, Math.round(this.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(this.height * this.dpr));
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const target = Math.max(28, Math.min(72, Math.round(this.width / 22)));
    if (this.nodes.length !== target) {
      this.nodes = [];
      this.seed = 0x48495645;
      while (this.nodes.length < target) this.nodes.push(this.createNode());
    }
    this.draw();
    this.syncLoop();
  }

  createNode() {
    const cyan = this.random() > 0.24;
    return {
      x: this.random(),
      y: this.random(),
      drift: this.random() * 2.6 + 0.4,
      r: this.random() * 1.15 + 0.45,
      color: cyan ? "104, 228, 255" : "175, 123, 255",
      phase: this.random() * Math.PI * 2,
    };
  }

  syncLoop() {
    window.cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.paused || !this.visible) {
      this.draw();
      return;
    }
    this.raf = window.requestAnimationFrame((time) => this.frame(time));
  }

  frame(time) {
    this.draw(time);
    this.raf = window.requestAnimationFrame((next) => this.frame(next));
  }

  draw(time = 0) {
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    const parallaxX = this.pointer.active ? (this.pointer.x - 0.5) * 9 : 0;
    const parallaxY = this.pointer.active ? (this.pointer.y - 0.5) * 7 : 0;
    const positions = this.nodes.map((node) => ({
      ...node,
      px: node.x * this.width + Math.cos(time * 0.00008 + node.phase) * node.drift - parallaxX * (0.3 + node.r * 0.12),
      py: node.y * this.height + Math.sin(time * 0.00007 + node.phase) * node.drift - parallaxY * (0.3 + node.r * 0.12),
    }));
    const linkDistance = this.width < 700 ? 88 : 125;
    const linkSquared = linkDistance * linkDistance;
    for (let i = 0; i < positions.length; i += 1) {
      const a = positions[i];
      for (let j = i + 1; j < positions.length; j += 1) {
        const b = positions[j];
        const dx = a.px - b.px;
        const dy = a.py - b.py;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared > linkSquared) continue;
        const alpha = (1 - distanceSquared / linkSquared) * 0.105;
        context.strokeStyle = `rgba(${a.color}, ${alpha})`;
        context.lineWidth = 0.55;
        context.beginPath();
        context.moveTo(a.px, a.py);
        context.lineTo(b.px, b.py);
        context.stroke();
      }
    }
    positions.forEach((node) => {
      const shimmer = 0.5 + Math.sin(time * 0.0007 + node.phase) * 0.22;
      context.fillStyle = `rgba(${node.color}, ${shimmer})`;
      context.shadowColor = `rgba(${node.color}, 0.55)`;
      context.shadowBlur = 8;
      context.beginPath();
      context.arc(node.px, node.py, node.r, 0, Math.PI * 2);
      context.fill();
    });
    context.shadowBlur = 0;
  }
}

const GALAXY_PALETTES = Object.freeze({
  mastery: [[104, 228, 255], [175, 123, 255], [109, 159, 255], [116, 229, 207]],
  artifact: [[109, 141, 255], [175, 123, 255], [101, 202, 213], [157, 174, 255]],
  evidence: [[185, 245, 255], [104, 228, 255], [122, 172, 255], [200, 169, 255]],
  runtime: [[113, 246, 188], [104, 228, 255], [80, 197, 190], [111, 158, 255]],
  product: [[240, 121, 207], [175, 123, 255], [104, 228, 255], [111, 158, 255]],
});

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const titleCase = (value) => String(value || "").replace(/\b\w/g, (letter) => letter.toUpperCase());

function roundedRectPath(context, x, y, width, height, radius) {
  context.beginPath();
  if (typeof context.roundRect === "function") {
    context.roundRect(x, y, width, height, radius);
    return;
  }
  const r = Math.min(radius, width / 2, height / 2);
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

class GalaxyAtlas {
  constructor(canvas) {
    this.canvas = canvas;
    this.stage = canvas.closest("[data-anatomy-map]");
    try {
      this.context = canvas.getContext("2d", { alpha: true, desynchronized: true });
    } catch {
      this.context = null;
    }
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.divisions = [];
    this.divisionGeometry = [];
    this.familyGeometry = [];
    this.neurons = [];
    this.projectedDivisions = [];
    this.projectedFamilies = [];
    this.projectedNeurons = [];
    this.rotationX = -0.08;
    this.rotationY = -0.32;
    this.targetRotationX = this.rotationX;
    this.targetRotationY = this.rotationY;
    this.zoom = 1.08;
    this.targetZoom = this.zoom;
    this.activeDivision = 0;
    this.hoverDivision = -1;
    this.activeFamily = -1;
    this.hoverFamily = -1;
    this.activeNeuron = -1;
    this.hoverNeuron = -1;
    this.lens = "mastery";
    this.commandStage = Number.isSafeInteger(window.hiveCommandStage) ? window.hiveCommandStage : 0;
    this.dragging = false;
    this.dragMoved = false;
    this.engaged = false;
    this.pointer = { x: 0, y: 0, startX: 0, startY: 0, rotationX: 0, rotationY: 0 };
    this.ambientStars = Array.from({ length: 108 }, (_, index) => {
      const seedX = Math.sin((index + 1) * 12.9898) * 43758.5453;
      const seedY = Math.sin((index + 1) * 78.233) * 24634.6345;
      const seedPhase = Math.sin((index + 1) * 41.731) * 15937.721;
      return {
        x: seedX - Math.floor(seedX),
        y: seedY - Math.floor(seedY),
        phase: (seedPhase - Math.floor(seedPhase)) * Math.PI * 2,
        tier: index % 3,
      };
    });
    this.raf = 0;
    this.lastTime = 0;
    this.intersecting = true;
    this.documentVisible = !document.hidden;
    this.visible = this.documentVisible;
    this.paused = reduceMotion.matches || document.body.classList.contains("motion-paused");
    this.forcedColors = window.matchMedia("(forced-colors: active)");
    this.baseRenderAvailable = galaxyRenderState({
      hasContext: Boolean(this.context),
      hasResizeObserver: "ResizeObserver" in window,
      forcedColorsActive: false,
    }).baseAvailable;
    this.renderAvailable = false;

    window.addEventListener("hive:snapshot", (event) => this.setSnapshot(event.detail?.snapshot));
    window.addEventListener("hive:snapshot-error", () => {
      this.loadError = true;
      this.draw(performance.now());
    });
    window.addEventListener("hive:lens", (event) => {
      if (!GALAXY_PALETTES[event.detail?.name]) return;
      this.lens = event.detail.name;
      this.draw(performance.now());
    });
    window.addEventListener("hive:command-stage", (event) => this.presentCommandStage(event.detail?.index));
    this.setEngaged(false);
    if (!this.baseRenderAvailable) {
      this.applyRenderAvailability(this.forcedColors.matches);
      return;
    }

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.stage || canvas);
    this.wireInteraction();
    this.wireControls();
    if ("IntersectionObserver" in window) {
      this.intersectionObserver = new IntersectionObserver(([entry]) => {
        this.intersecting = Boolean(entry?.isIntersecting);
        this.visible = this.documentVisible && this.intersecting;
        this.syncLoop();
      }, { rootMargin: "180px" });
      this.intersectionObserver.observe(canvas);
    }
    document.addEventListener("visibilitychange", () => {
      this.documentVisible = !document.hidden;
      this.visible = this.documentVisible && this.intersecting;
      this.syncLoop();
    });
    window.addEventListener("hive:motion", (event) => {
      this.paused = Boolean(event.detail?.paused) || reduceMotion.matches;
      this.syncLoop();
    });
    const onForcedColorsChange = (event) => this.applyRenderAvailability(Boolean(event.matches));
    if (typeof this.forcedColors.addEventListener === "function") {
      this.forcedColors.addEventListener("change", onForcedColorsChange);
    } else if (typeof this.forcedColors.addListener === "function") {
      this.forcedColors.addListener(onForcedColorsChange);
    }
    this.applyRenderAvailability(this.forcedColors.matches);
  }

  setSnapshot(snapshot) {
    if (!Array.isArray(snapshot?.galaxy?.divisions)) return;
    const previousDivisionCode = this.divisions[this.activeDivision]?.code;
    const previousFamilyCode = this.activeFamily >= 0
      ? this.divisions[this.familyGeometry[this.activeFamily]?.divisionIndex]?.families?.[this.familyGeometry[this.activeFamily]?.familyIndex]?.code
      : null;
    const previousNeuronId = this.activeNeuron >= 0 ? this.neurons[this.activeNeuron]?.id : null;
    this.divisions = snapshot.galaxy.divisions;
    this.buildGeometry();

    const selection = resolveGalaxySelection({
      divisions: this.divisions,
      familyGeometry: this.familyGeometry,
      neurons: this.neurons,
      neuronIndexById: this.neuronIndexById,
      previousDivisionCode,
      previousFamilyCode,
      previousNeuronId,
    });
    this.activeDivision = selection.activeDivision;
    this.activeFamily = selection.activeFamily;
    this.activeNeuron = selection.activeNeuron;
    this.buildDivisionIndex();
    this.showDivision(this.activeDivision, false, true);
    this.presentCommandStage(this.commandStage);
    this.draw(performance.now());
    this.syncLoop();
  }

  buildGeometry() {
    const geometry = buildGalaxyGeometry(this.divisions);
    this.divisionGeometry = geometry.divisionGeometry;
    this.familyGeometry = geometry.familyGeometry;
    this.neurons = geometry.neurons;
    this.neuronIndexById = geometry.neuronIndexById;
  }

  buildDivisionIndex() {
    const root = $("[data-galaxy-index-list]");
    if (!root) return;
    const focusedDivisionCode = document.activeElement?.dataset?.divisionCode;
    root.replaceChildren();
    this.divisions.forEach((division, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.divisionCode = division.code;
      button.textContent = division.code;
      button.title = `Division ${division.code}: ${titleCase(division.name)}`;
      button.setAttribute("aria-label", button.title);
      button.setAttribute("aria-pressed", String(index === this.activeDivision));
      button.addEventListener("click", () => this.focusDivision(index));
      root.appendChild(button);
    });
    if (focusedDivisionCode) {
      root.querySelector(`[data-division-code="${focusedDivisionCode}"]`)?.focus({ preventScroll: true });
    }
  }

  setFocusDetail(level, title, detail) {
    setText("[data-galaxy-focus-level]", level);
    setText("[data-galaxy-focus-title]", title);
    setText("[data-galaxy-focus-detail]", detail);
  }

  hideNeuronRoster() {
    const roster = $("[data-galaxy-neuron-roster]");
    if (roster) roster.hidden = true;
  }

  renderNeuronRoster(familyGeometryIndex) {
    const geometry = this.familyGeometry[familyGeometryIndex];
    const roster = $("[data-galaxy-neuron-roster]");
    const list = $("[data-galaxy-neuron-list]");
    if (!geometry || !roster || !list) {
      this.hideNeuronRoster();
      return;
    }
    const family = this.divisions[geometry.divisionIndex]?.families?.[geometry.familyIndex];
    if (!family) {
      this.hideNeuronRoster();
      return;
    }
    roster.hidden = false;
    roster.setAttribute("aria-label", `${family.code} neuron roster`);
    const focusedNeuronId = document.activeElement?.dataset?.neuronId;
    list.replaceChildren(...family.neuronIds.map((neuronId) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = neuronId;
      button.dataset.neuronId = neuronId;
      button.setAttribute("aria-label", `Focus neuron ${neuronId} in family ${family.code}`);
      const neuronIndex = this.neuronIndexById.get(neuronId);
      button.setAttribute("aria-pressed", String(neuronIndex === this.activeNeuron));
      button.addEventListener("click", () => this.focusNeuron(neuronIndex));
      return button;
    }));
    if (focusedNeuronId) {
      list.querySelector(`[data-neuron-id="${focusedNeuronId}"]`)?.focus({ preventScroll: true });
    }
  }

  showFamilyFocus(familyGeometryIndex) {
    const geometry = this.familyGeometry[familyGeometryIndex];
    if (!geometry) return;
    const family = this.divisions[geometry.divisionIndex]?.families?.[geometry.familyIndex];
    if (!family) return;
    this.setFocusDetail(
      `Family ${family.code}`,
      titleCase(family.name),
      `${family.neuronIds.length} stable neuron identities. Select the family to open its roster, then choose a neuron.`,
    );
  }

  showNeuronFocus(neuronIndex) {
    const neuron = this.neurons[neuronIndex];
    if (!neuron) return;
    const family = this.divisions[neuron.divisionIndex]?.families?.[neuron.familyIndex];
    this.setFocusDetail(
      "Neuron identity",
      neuron.id,
      `Member of ${family?.code || "its family"} · ${titleCase(family?.name)}. Public topology only—open the local map for status, evidence, and missions.`,
    );
  }

  restoreActiveFocus() {
    if (this.activeNeuron >= 0) this.showNeuronFocus(this.activeNeuron);
    else if (this.activeFamily >= 0) this.showFamilyFocus(this.activeFamily);
    else {
      const division = this.divisions[this.activeDivision];
      if (division) this.setFocusDetail("Division focus", `Division ${division.code}`, "Hover or select a family to resolve its ten-neuron roster.");
    }
  }

  showDivision(index, updateButtons = true, updateAccessibleName = updateButtons) {
    const division = this.divisions[index];
    if (!division) return;
    setText("[data-galaxy-index]", `Division ${division.code} / ${this.divisions.length}`);
    setText("[data-galaxy-code]", `${division.code} · CONSTELLATION`);
    setText("[data-galaxy-title]", titleCase(division.name));
    setText("[data-galaxy-copy]", `This district contains ${division.neuronCount} stable neuron positions across ${division.families.length} purpose families. Dive closer to resolve the individual stars.`);
    setText("[data-galaxy-neurons]", String(division.neuronCount));
    setText("[data-galaxy-families]", String(division.families.length));
    const familyList = $("[data-galaxy-families-list]");
    if (familyList) {
      const focusedFamilyIndex = document.activeElement?.dataset?.familyGeometryIndex;
      familyList.replaceChildren(...division.families.map((family, familyIndex) => {
        const familyGeometryIndex = index * 4 + familyIndex;
        const item = document.createElement("li");
        item.className = "is-interactive";
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.familyGeometryIndex = String(familyGeometryIndex);
        button.setAttribute("aria-pressed", String(familyGeometryIndex === this.activeFamily));
        button.setAttribute("aria-label", `Focus family ${family.code}: ${family.name}`);
        button.addEventListener("click", () => this.focusFamily(familyGeometryIndex));
        const code = document.createElement("span");
        code.textContent = family.code;
        button.append(code, document.createTextNode(family.name));
        item.appendChild(button);
        return item;
      }));
      if (focusedFamilyIndex !== undefined) {
        familyList.querySelector(`[data-family-geometry-index="${focusedFamilyIndex}"]`)?.focus({ preventScroll: true });
      }
    }
    if (updateButtons) {
      $$('[data-galaxy-index-list] button').forEach((button, buttonIndex) => {
        button.setAttribute("aria-pressed", String(buttonIndex === index));
      });
    }
    if (updateAccessibleName) {
      this.canvas.setAttribute(
        "aria-label",
        `Interactive public-safe atlas of 640 Hive-AI neurons. Division ${division.code}, ${division.name}, is selected. Engage controls first; then use arrow keys to orbit and plus or minus to zoom.`,
      );
    }
    if (index === this.activeDivision && this.activeFamily >= 0) {
      this.renderNeuronRoster(this.activeFamily);
      this.restoreActiveFocus();
    } else {
      this.hideNeuronRoster();
      this.setFocusDetail("Division focus", `Division ${division.code}`, "Hover or select a family to resolve its ten-neuron roster.");
    }
  }

  focusPoint(center, minimumZoom) {
    this.targetRotationY = Math.atan2(center.x, center.z);
    this.targetRotationX = -Math.atan2(center.y, Math.hypot(center.x, center.z)) * 0.72;
    this.targetZoom = Math.max(this.targetZoom, minimumZoom);
  }

  presentCommandStage(index) {
    this.commandStage = Math.max(0, Math.min(COMMAND_CYCLE_STEPS.length - 1, Number(index) || 0));
    if (this.stage) this.stage.dataset.commandStage = String(this.commandStage);
    const scenes = [
      { lens: "mastery", reset: true },
      { lens: "evidence", division: 3 },
      { lens: "artifact", neuron: "N121" },
      { lens: "runtime", neuron: "N401" },
      { lens: "evidence", neuron: "N561" },
      { lens: "product", reset: true },
    ];
    const scene = scenes[this.commandStage];
    if (!scene) return;
    selectLens(scene.lens);
    if (!this.divisions.length) return;
    if (scene.reset) this.resetCamera();
    else if (scene.neuron && this.neuronIndexById?.has(scene.neuron)) this.focusNeuron(this.neuronIndexById.get(scene.neuron));
    else if (Number.isSafeInteger(scene.division)) this.focusDivision(scene.division);
    this.draw(performance.now());
  }

  focusDivision(index) {
    const center = this.divisionGeometry[index];
    if (!center) return;
    this.activeDivision = index;
    this.hoverDivision = -1;
    this.activeFamily = -1;
    this.hoverFamily = -1;
    this.activeNeuron = -1;
    this.hoverNeuron = -1;
    this.focusPoint(center, 1.18);
    this.showDivision(index);
    this.syncLoop();
  }

  focusFamily(familyGeometryIndex) {
    const center = this.familyGeometry[familyGeometryIndex];
    if (!center) return;
    this.activeDivision = center.divisionIndex;
    this.activeFamily = familyGeometryIndex;
    this.activeNeuron = -1;
    this.hoverDivision = -1;
    this.hoverFamily = -1;
    this.hoverNeuron = -1;
    this.focusPoint(center, 1.58);
    this.showDivision(this.activeDivision, true, false);
    this.showFamilyFocus(familyGeometryIndex);
    const family = this.divisions[center.divisionIndex].families[center.familyIndex];
    this.canvas.setAttribute("aria-label", `Interactive Hive-AI atlas. Family ${family.code}, ${family.name}, is selected with ${family.neuronIds.length} neurons. Press Escape to release controls.`);
    this.syncLoop();
  }

  focusNeuron(neuronIndex) {
    const neuron = this.neurons[neuronIndex];
    if (!neuron) return;
    this.activeDivision = neuron.divisionIndex;
    this.activeFamily = neuron.familyGeometryIndex;
    this.activeNeuron = neuronIndex;
    this.hoverDivision = -1;
    this.hoverFamily = -1;
    this.hoverNeuron = -1;
    this.focusPoint(neuron, 2.15);
    this.showDivision(this.activeDivision, true, false);
    this.showNeuronFocus(neuronIndex);
    this.canvas.setAttribute("aria-label", `Interactive Hive-AI atlas. Neuron ${neuron.id} is selected. Public topology only; press Escape to release controls.`);
    this.syncLoop();
  }

  setCameraControlsAvailable(available, reason = "") {
    $$('[data-galaxy-engage], [data-galaxy-zoom], [data-galaxy-reset]').forEach((button) => {
      button.disabled = !available;
      button.setAttribute("aria-disabled", String(!available));
      button.title = available ? "" : reason;
    });
    this.canvas.setAttribute("tabindex", available ? "0" : "-1");
    this.canvas.setAttribute("aria-disabled", String(!available));
  }

  applyRenderAvailability(forcedColorsActive) {
    const state = galaxyRenderState({
      hasContext: Boolean(this.context),
      hasResizeObserver: "ResizeObserver" in window,
      forcedColorsActive,
    });
    this.renderAvailable = state.renderAvailable;
    const fallback = !state.renderAvailable;
    this.stage?.classList.toggle("galaxy-static-fallback", fallback);
    this.canvas.closest("#galaxy")?.classList.toggle("galaxy-fallback-active", fallback);
    if (fallback) this.setEngaged(false);
    const reason = state.reasonCode === "FORCED_COLORS"
      ? "Camera controls are hidden in forced-colors mode; use the semantic division and family controls."
      : "Canvas rendering is unavailable; use the semantic division and family controls.";
    this.setCameraControlsAvailable(state.renderAvailable, reason);
    window.cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (state.renderAvailable) {
      this.resize();
      this.syncLoop();
    }
  }

  wireControls() {
    $$('[data-galaxy-zoom]').forEach((button) => {
      button.addEventListener("click", () => {
        const factor = button.dataset.galaxyZoom === "in" ? 1.22 : 1 / 1.22;
        this.targetZoom = clamp(this.targetZoom * factor, 0.68, 2.65);
        this.syncLoop();
      });
    });
    $("[data-galaxy-reset]")?.addEventListener("click", () => this.resetCamera());
    $("[data-galaxy-engage]")?.addEventListener("click", () => {
      this.setEngaged(!this.engaged, true);
      if (this.engaged) this.canvas.focus({ preventScroll: true });
    });
  }

  setEngaged(engaged, announce = false) {
    this.engaged = Boolean(engaged);
    this.stage?.classList.toggle("is-engaged", this.engaged);
    const button = $("[data-galaxy-engage]");
    if (button) {
      button.setAttribute("aria-pressed", String(this.engaged));
      button.textContent = this.engaged ? "Release controls" : "Engage controls";
    }
    setText("[data-galaxy-hint-state]", this.engaged ? "Scroll" : "Engage");
    setText("[data-galaxy-hint-copy]", this.engaged ? "to dive" : "controls");
    if (announce) showToast(this.engaged ? "Galaxy controls engaged. Press Escape to release page scroll." : "Galaxy controls released. Page scroll restored.");
  }

  resetCamera() {
    this.activeDivision = 0;
    this.hoverDivision = -1;
    this.activeFamily = -1;
    this.hoverFamily = -1;
    this.activeNeuron = -1;
    this.hoverNeuron = -1;
    this.targetRotationX = -0.08;
    this.targetRotationY = -0.32;
    this.targetZoom = 1.08;
    this.showDivision(0);
    this.syncLoop();
  }

  updatePointer(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = event.clientX - rect.left;
    this.pointer.y = event.clientY - rect.top;
  }

  wireInteraction() {
    this.canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      this.updatePointer(event);
      this.hitTest();
      const pointerPolicy = galaxyPointerPolicy(event.pointerType, this.engaged);
      this.pointer.orbitAllowed = pointerPolicy.orbitAllowed;
      if (pointerPolicy.engage) this.setEngaged(true);
      if (pointerPolicy.focusCanvas) this.canvas.focus({ preventScroll: true });
      this.dragging = true;
      this.dragMoved = false;
      this.pointer.startX = event.clientX;
      this.pointer.startY = event.clientY;
      this.pointer.rotationX = this.targetRotationX;
      this.pointer.rotationY = this.targetRotationY;
      this.canvas.setPointerCapture(event.pointerId);
      this.stage?.classList.add("is-dragging");
    });
    this.canvas.addEventListener("pointermove", (event) => {
      this.updatePointer(event);
      if (this.dragging) {
        const dx = event.clientX - this.pointer.startX;
        const dy = event.clientY - this.pointer.startY;
        this.dragMoved ||= Math.hypot(dx, dy) > 4;
        if (!this.pointer.orbitAllowed) return;
        this.targetRotationY = this.pointer.rotationY + dx * 0.006;
        this.targetRotationX = clamp(this.pointer.rotationX + dy * 0.0048, -1.15, 1.15);
        this.syncLoop();
        return;
      }
      this.hitTest();
    }, { passive: true });
    const release = (event, cancelled = false) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.stage?.classList.remove("is-dragging");
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
      if (cancelled) {
        this.setEngaged(false);
        this.hoverDivision = -1;
        this.hoverFamily = -1;
        this.hoverNeuron = -1;
        this.restoreActiveFocus();
        this.draw(performance.now());
        return;
      }
      this.updatePointer(event);
      this.hitTest();
      if (!this.dragMoved && this.hoverNeuron >= 0) this.focusNeuron(this.hoverNeuron);
      else if (!this.dragMoved && this.hoverFamily >= 0) this.focusFamily(this.hoverFamily);
      else if (!this.dragMoved && this.hoverDivision >= 0) this.focusDivision(this.hoverDivision);
    };
    this.canvas.addEventListener("pointerup", (event) => release(event, false));
    this.canvas.addEventListener("pointercancel", (event) => release(event, true));
    this.canvas.addEventListener("pointerleave", () => {
      if (this.dragging) return;
      this.hoverDivision = -1;
      this.hoverFamily = -1;
      this.hoverNeuron = -1;
      this.showDivision(this.activeDivision, false, false);
      this.restoreActiveFocus();
      this.draw(performance.now());
    });
    this.canvas.addEventListener("wheel", (event) => {
      const atMinimum = this.targetZoom <= 0.681 && event.deltaY > 0;
      const atMaximum = this.targetZoom >= 2.649 && event.deltaY < 0;
      if (!this.engaged || atMinimum || atMaximum) return;
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.00105);
      this.targetZoom = clamp(this.targetZoom * factor, 0.68, 2.65);
      this.syncLoop();
    }, { passive: false });
    this.canvas.addEventListener("keydown", (event) => {
      if (!this.engaged) {
        if (!["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        this.setEngaged(true, true);
        return;
      }
      const handled = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "_", "Home", "0"];
      if (!handled.includes(event.key)) return;
      event.preventDefault();
      if (event.key === "ArrowLeft") this.targetRotationY -= 0.16;
      if (event.key === "ArrowRight") this.targetRotationY += 0.16;
      if (event.key === "ArrowUp") this.targetRotationX = clamp(this.targetRotationX - 0.12, -1.15, 1.15);
      if (event.key === "ArrowDown") this.targetRotationX = clamp(this.targetRotationX + 0.12, -1.15, 1.15);
      if (["+", "="].includes(event.key)) this.targetZoom = clamp(this.targetZoom * 1.18, 0.68, 2.65);
      if (["-", "_"].includes(event.key)) this.targetZoom = clamp(this.targetZoom / 1.18, 0.68, 2.65);
      if (["Home", "0"].includes(event.key)) this.resetCamera();
      this.syncLoop();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !this.engaged) return;
      event.preventDefault();
      this.setEngaged(false, true);
      $("[data-galaxy-engage]")?.focus({ preventScroll: true });
    });
  }

  hitTest() {
    if (!this.projectedDivisions.length) return;
    const hit = selectGalaxyHit({
      pointer: this.pointer,
      zoom: this.zoom,
      lens: this.lens,
      projectedDivisions: this.projectedDivisions,
      projectedFamilies: this.projectedFamilies,
      projectedNeurons: this.projectedNeurons,
      activeDivision: this.activeDivision,
      activeFamily: this.activeFamily,
      activeNeuron: this.activeNeuron,
      hoverDivision: this.hoverDivision,
      hoverFamily: this.hoverFamily,
      hoverNeuron: this.hoverNeuron,
    });
    const nearestDivision = hit.divisionIndex;
    const nearestFamily = hit.familyIndex;
    const nearestNeuron = hit.neuronIndex;
    if (nearestDivision === this.hoverDivision && nearestFamily === this.hoverFamily && nearestNeuron === this.hoverNeuron) return;
    this.hoverDivision = nearestDivision;
    this.hoverFamily = nearestFamily;
    this.hoverNeuron = nearestNeuron;
    if (nearestNeuron >= 0) this.showNeuronFocus(nearestNeuron);
    else if (nearestFamily >= 0) this.showFamilyFocus(nearestFamily);
    else if (nearestDivision >= 0) this.showDivision(nearestDivision, false, false);
    else {
      this.showDivision(this.activeDivision, false, false);
      this.restoreActiveFocus();
    }
    this.draw(performance.now());
  }

  resize() {
    if (!this.context || !this.renderAvailable) return;
    const rect = (this.stage || this.canvas).getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    this.canvas.width = Math.max(1, Math.round(this.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(this.height * this.dpr));
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.draw(performance.now());
  }

  project(point) {
    return projectGalaxyPoint(point, {
      rotationX: this.rotationX,
      rotationY: this.rotationY,
      zoom: this.zoom,
      width: this.width,
      height: this.height,
    });
  }

  paletteColor(index) {
    const palette = GALAXY_PALETTES[this.lens] || GALAXY_PALETTES.mastery;
    return palette[index % palette.length];
  }

  drawAmbientStars(context, time) {
    context.save();
    context.globalCompositeOperation = "lighter";
    for (let tier = 0; tier < 3; tier += 1) {
      const driftX = this.rotationY * (5 + tier * 4);
      const driftY = this.rotationX * (3 + tier * 3);
      const pulse = this.paused ? 0.82 : 0.76 + Math.sin(time * 0.00038 + tier * 1.7) * 0.1;
      context.fillStyle = `rgba(${tier === 2 ? "151, 205, 255" : "104, 228, 255"}, ${(0.045 + tier * 0.025) * pulse})`;
      context.beginPath();
      this.ambientStars.forEach((star) => {
        if (star.tier !== tier) return;
        const x = ((star.x * this.width + driftX + this.width) % this.width);
        const y = ((star.y * this.height + driftY + this.height) % this.height);
        const shimmer = this.paused ? 1 : 0.82 + Math.sin(time * 0.0009 + star.phase) * 0.18;
        const radius = (0.38 + tier * 0.24) * shimmer;
        context.moveTo(x + radius, y);
        context.arc(x, y, radius, 0, Math.PI * 2);
      });
      context.fill();
    }
    context.restore();
  }

  draw(time = 0) {
    if (!this.context || !this.renderAvailable) return;
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    if (!this.divisions.length) {
      context.fillStyle = this.loadError ? "rgba(255, 141, 154, 0.82)" : "rgba(168, 182, 202, 0.72)";
      context.font = '700 12px "SFMono-Regular", Consolas, monospace';
      context.textAlign = "center";
      context.fillText(this.loadError ? "SOURCE SNAPSHOT UNAVAILABLE" : "LOADING SOURCE-BOUND GALAXY", this.width / 2, this.height / 2);
      return;
    }

    const background = context.createRadialGradient(
      this.width * 0.5,
      this.height * 0.48,
      0,
      this.width * 0.5,
      this.height * 0.48,
      Math.max(this.width, this.height) * 0.58,
    );
    background.addColorStop(0, "rgba(31, 112, 150, 0.2)");
    background.addColorStop(0.38, "rgba(24, 48, 91, 0.12)");
    background.addColorStop(0.7, "rgba(31, 20, 74, 0.045)");
    background.addColorStop(1, "rgba(2, 5, 11, 0)");
    context.fillStyle = background;
    context.fillRect(0, 0, this.width, this.height);
    this.drawAmbientStars(context, time);

    const profile = GALAXY_LENS_PROFILES[this.lens] || GALAXY_LENS_PROFILES.mastery;
    this.projectedDivisions = this.divisionGeometry.map((point) => this.project(point));
    this.projectedFamilies = this.familyGeometry.map((point) => this.project(point));
    this.projectedNeurons = this.neurons.map((point) => this.project(point));
    const center = this.project({ x: 0, y: 0, z: 0 });

    context.save();
    context.globalCompositeOperation = "lighter";
    this.projectedDivisions.forEach((point, index) => {
      const color = this.paletteColor(index);
      const active = index === this.activeDivision || index === this.hoverDivision;
      const depth = clamp((point.z + 2.7) / 5.4, 0, 1);
      context.strokeStyle = `rgba(${color.join(",")}, ${(active ? 0.34 : 0.065 + depth * 0.055) * profile.links})`;
      context.lineWidth = active ? 1.45 : 0.58 + depth * 0.25;
      context.beginPath();
      context.moveTo(center.x, center.y);
      const controlX = (center.x + point.x) / 2 + (point.y - center.y) * 0.07;
      const controlY = (center.y + point.y) / 2 - (point.x - center.x) * 0.07;
      context.quadraticCurveTo(controlX, controlY, point.x, point.y);
      context.stroke();

      const next = this.projectedDivisions[(index + 1) % this.projectedDivisions.length];
      context.strokeStyle = `rgba(${color.join(",")}, ${(active ? 0.24 : 0.045 + depth * 0.035) * profile.links})`;
      context.beginPath();
      context.moveTo(point.x, point.y);
      context.lineTo(next.x, next.y);
      context.stroke();
    });

    this.projectedDivisions.forEach((point, index) => {
      const color = this.paletteColor(index);
      const active = index === this.activeDivision || index === this.hoverDivision;
      const radius = galaxyDivisionVisualRadius(point, this.zoom, profile, active);
      const halo = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
      halo.addColorStop(0, `rgba(${color.join(",")}, ${(active ? 0.29 : 0.12) * profile.divisions})`);
      halo.addColorStop(0.5, `rgba(${color.join(",")}, ${(active ? 0.095 : 0.038) * profile.divisions})`);
      halo.addColorStop(0.78, `rgba(${color.join(",")}, ${(active ? 0.035 : 0.012) * profile.divisions})`);
      halo.addColorStop(1, `rgba(${color.join(",")}, 0)`);
      context.fillStyle = halo;
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = `rgba(${color.join(",")}, ${active ? 0.66 : 0.17})`;
      context.lineWidth = active ? 1.15 : 0.65;
      context.beginPath();
      context.arc(point.x, point.y, radius * 0.64, 0, Math.PI * 2);
      context.stroke();
      context.save();
      context.setLineDash(active ? [5, 9] : [2, 8]);
      context.lineDashOffset = this.paused ? index * -2 : -(time * (active ? 0.018 : 0.008) + index * 3.5);
      context.strokeStyle = `rgba(${color.join(",")}, ${active ? 0.52 : 0.12})`;
      context.lineWidth = active ? 1.1 : 0.55;
      context.beginPath();
      const arcStart = index * 0.63 + time * (this.paused ? 0 : 0.00008);
      context.arc(point.x, point.y, radius * 0.82, arcStart, arcStart + Math.PI * (active ? 1.42 : 0.78));
      context.stroke();
      context.restore();
    });

    if (this.zoom > profile.familyThreshold) {
      this.projectedFamilies.forEach((family, familyGeometryIndex) => {
        if (family.divisionIndex !== this.activeDivision && family.divisionIndex !== this.hoverDivision) return;
        const divisionPoint = this.projectedDivisions[family.divisionIndex];
        const color = this.paletteColor(family.divisionIndex);
        const selected = familyGeometryIndex === this.activeFamily || familyGeometryIndex === this.hoverFamily;
        context.strokeStyle = `rgba(${color.join(",")}, ${(selected ? 0.58 : 0.28) * profile.families})`;
        context.lineWidth = selected ? 1.25 : 0.75;
        context.beginPath();
        context.moveTo(divisionPoint.x, divisionPoint.y);
        context.lineTo(family.x, family.y);
        context.stroke();
        const radius = clamp((selected ? 17 : 11) * family.perspective * Math.sqrt(this.zoom) * profile.families, 7, selected ? 34 : 22);
        const familyHalo = context.createRadialGradient(family.x, family.y, 0, family.x, family.y, radius);
        familyHalo.addColorStop(0, `rgba(${color.join(",")}, ${selected ? 0.31 : 0.15})`);
        familyHalo.addColorStop(1, `rgba(${color.join(",")}, 0)`);
        context.fillStyle = familyHalo;
        context.beginPath();
        context.arc(family.x, family.y, radius, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = `rgba(${color.join(",")}, ${selected ? 0.7 : 0.3})`;
        context.beginPath();
        context.arc(family.x, family.y, radius * 0.58, 0, Math.PI * 2);
        context.stroke();
      });
    }

    this.projectedNeurons
      .slice()
      .sort((left, right) => left.z - right.z)
      .forEach((point) => {
        const color = this.paletteColor(point.divisionIndex);
        const selectedFamily = this.hoverFamily >= 0 ? this.hoverFamily : this.activeFamily;
        const activeDivision = point.divisionIndex === this.activeDivision || point.divisionIndex === this.hoverDivision;
        const active = activeDivision && (selectedFamily < 0 || point.familyGeometryIndex === selectedFamily);
        const depth = clamp((point.z + 2.7) / 5.4, 0, 1);
        const shimmer = this.paused ? 0.86 : 0.78 + Math.sin(time * 0.0015 + point.phase) * 0.16;
        const alpha = clamp((active ? 0.88 : 0.28 + depth * 0.44) * shimmer * profile.neurons, 0.16, 1);
        const depthScale = 0.72 + depth * 0.72;
        const radius = clamp((active ? 2.05 : 1.28) * point.perspective * Math.sqrt(this.zoom) * Math.sqrt(profile.neurons) * depthScale, 0.82, 4.8);
        context.fillStyle = `rgba(${color.join(",")}, ${alpha * (active ? 0.16 : 0.08)})`;
        context.beginPath();
        context.arc(point.x, point.y, radius * (active ? 3.3 : 2.45), 0, Math.PI * 2);
        context.fill();
        context.fillStyle = `rgba(${color.join(",")}, ${alpha})`;
        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fill();
        const neuronIndex = this.neuronIndexById.get(point.id);
        if (this.zoom > 1.35 && (neuronIndex === this.activeNeuron || neuronIndex === this.hoverNeuron)) {
          const focusRadius = Math.max(7, radius * 3.5);
          context.strokeStyle = `rgba(${color.join(",")}, 0.68)`;
          context.lineWidth = 1;
          context.beginPath();
          context.arc(point.x, point.y, focusRadius, 0, Math.PI * 2);
          context.stroke();
          context.strokeStyle = `rgba(225, 251, 255, ${0.35 + depth * 0.28})`;
          context.lineWidth = 0.65;
          context.beginPath();
          context.moveTo(point.x - focusRadius * 1.6, point.y);
          context.lineTo(point.x + focusRadius * 1.6, point.y);
          context.moveTo(point.x, point.y - focusRadius * 1.6);
          context.lineTo(point.x, point.y + focusRadius * 1.6);
          context.stroke();
        }
      });

    const reactorRadius = clamp(28 * this.zoom, 20, 58);
    const reactorGlow = context.createRadialGradient(center.x, center.y, 0, center.x, center.y, reactorRadius * 1.75);
    reactorGlow.addColorStop(0, "rgba(220, 253, 255, 0.74)");
    reactorGlow.addColorStop(0.12, "rgba(104, 228, 255, 0.34)");
    reactorGlow.addColorStop(0.46, "rgba(66, 144, 219, 0.11)");
    reactorGlow.addColorStop(1, "rgba(30, 71, 145, 0)");
    context.fillStyle = reactorGlow;
    context.beginPath();
    context.arc(center.x, center.y, reactorRadius * 1.75, 0, Math.PI * 2);
    context.fill();

    context.save();
    context.setLineDash([4, 7]);
    context.lineDashOffset = this.paused ? -3 : -time * 0.018;
    context.strokeStyle = "rgba(104, 228, 255, 0.48)";
    context.lineWidth = 0.9;
    context.beginPath();
    context.arc(center.x, center.y, reactorRadius, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([1.5, 9]);
    context.lineDashOffset = this.paused ? 2 : time * 0.012;
    context.strokeStyle = "rgba(175, 123, 255, 0.36)";
    context.beginPath();
    context.arc(center.x, center.y, reactorRadius * 1.35, 0, Math.PI * 2);
    context.stroke();
    context.restore();

    context.strokeStyle = "rgba(104, 228, 255, 0.2)";
    context.lineWidth = 0.6;
    for (let ray = 0; ray < 8; ray += 1) {
      const angle = ray * Math.PI / 4 + (this.paused ? 0 : time * 0.00004);
      context.beginPath();
      context.moveTo(center.x + Math.cos(angle) * reactorRadius * 0.55, center.y + Math.sin(angle) * reactorRadius * 0.55);
      context.lineTo(center.x + Math.cos(angle) * reactorRadius * 1.55, center.y + Math.sin(angle) * reactorRadius * 1.55);
      context.stroke();
    }

    context.fillStyle = "rgba(225, 253, 255, 0.96)";
    context.beginPath();
    context.arc(center.x, center.y, clamp(4.2 * this.zoom, 3.4, 8.5), 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "rgba(104, 228, 255, 0.54)";
    context.lineWidth = 1;
    context.beginPath();
    context.arc(center.x, center.y, reactorRadius * 0.62, 0, Math.PI * 2);
    context.stroke();
    context.restore();

    const occupiedLabels = [];
    const focusedNeuron = this.hoverNeuron >= 0 ? this.hoverNeuron : this.activeNeuron;
    if (focusedNeuron >= 0 && this.zoom > 1.52) {
      this.drawNeuronLabel(context, this.projectedNeurons[focusedNeuron], focusedNeuron, occupiedLabels);
    }
    const availableLabels = this.projectedDivisions
      .map((point, index) => ({ point, index }))
      .filter(({ point, index }) => point.z > -0.7 || index === this.activeDivision || index === this.hoverDivision)
      .sort((left, right) => right.point.z - left.point.z);
    const labelLimit = this.zoom > 1.7 ? 2 : this.zoom > 1.35 ? 4 : 7;
    const priority = [this.hoverDivision, this.activeDivision].filter((index, position, values) => index >= 0 && values.indexOf(index) === position);
    const labelCandidates = priority
      .map((index) => availableLabels.find((candidate) => candidate.index === index))
      .filter(Boolean);
    availableLabels.forEach((candidate) => {
      if (labelCandidates.length >= labelLimit || labelCandidates.some(({ index }) => index === candidate.index)) return;
      labelCandidates.push(candidate);
    });
    labelCandidates.forEach(({ point, index }) => this.drawDivisionLabel(context, point, index, occupiedLabels));
    if (this.zoom > profile.familyThreshold) {
      this.projectedFamilies
        .map((point, index) => ({ point, index }))
        .filter(({ point }) => point.divisionIndex === this.activeDivision || point.divisionIndex === this.hoverDivision)
        .sort((left, right) => {
          const leftSelected = left.index === this.activeFamily || left.index === this.hoverFamily;
          const rightSelected = right.index === this.activeFamily || right.index === this.hoverFamily;
          return Number(rightSelected) - Number(leftSelected) || right.point.z - left.point.z;
        })
        .forEach(({ point, index }) => this.drawFamilyLabel(context, point, index, occupiedLabels));
    }
  }

  drawDivisionLabel(context, point, index, occupied) {
    const division = this.divisions[index];
    const active = index === this.activeDivision || index === this.hoverDivision;
    const hovered = index === this.hoverDivision;
    const fullName = titleCase(division.name);
    const nameLimit = this.width < 520 ? 23 : 34;
    const compactName = fullName.length > nameLimit ? `${fullName.slice(0, nameLimit - 1).trimEnd()}…` : fullName;
    const expansive = hovered && this.width >= 620;
    const label = expansive ? `${division.code} · ${compactName}` : division.code;
    context.save();
    context.font = `${active ? 800 : 700} ${expansive ? 13 : 11}px "SFMono-Regular", "Cascadia Code", Consolas, monospace`;
    const width = context.measureText(label).width + (expansive ? 18 : 12);
    const height = expansive ? 29 : 23;
    const calloutGap = clamp(36 * point.perspective * this.zoom, 30, 64);
    const desiredX = expansive
      ? (point.x >= this.width / 2 ? point.x - width - calloutGap : point.x + calloutGap)
      : point.x - width / 2;
    const desiredY = expansive
      ? point.y - height / 2 - clamp(18 * point.perspective * this.zoom, 10, 32)
      : point.y - clamp(52 * point.perspective * this.zoom, 34, 82);
    const box = placeCanvasLabel(width, height, desiredX, desiredY, this.width, this.height, occupied, active);
    if (!box) {
      context.restore();
      return;
    }
    if (expansive) {
      context.strokeStyle = "rgba(104, 228, 255, 0.34)";
      context.lineWidth = 0.75;
      context.beginPath();
      context.moveTo(point.x, point.y - 4);
      context.lineTo(
        point.x < box.x ? box.x : point.x > box.x + width ? box.x + width : clamp(point.x, box.x + 7, box.x + width - 7),
        point.y < box.y ? box.y : point.y > box.y + height ? box.y + height : box.y + height / 2,
      );
      context.stroke();
      context.shadowColor = "rgba(104, 228, 255, 0.24)";
      context.shadowBlur = 12;
    }
    context.fillStyle = active ? "rgba(5, 11, 20, 0.9)" : "rgba(5, 10, 18, 0.72)";
    context.strokeStyle = active ? "rgba(104, 228, 255, 0.5)" : "rgba(169, 195, 224, 0.16)";
    context.lineWidth = 0.7;
    roundedRectPath(context, box.x, box.y, width, height, 5);
    context.fill();
    context.stroke();
    context.fillStyle = active ? "rgba(214, 249, 255, 0.96)" : "rgba(168, 182, 202, 0.78)";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, box.x + width / 2, box.y + height / 2 + 0.5);
    context.restore();
  }

  drawFamilyLabel(context, point, familyGeometryIndex, occupied) {
    const geometry = this.familyGeometry[familyGeometryIndex];
    const family = this.divisions[geometry.divisionIndex]?.families?.[geometry.familyIndex];
    if (!family) return;
    const selected = familyGeometryIndex === this.activeFamily || familyGeometryIndex === this.hoverFamily;
    if (!selected && this.zoom < 1.24) return;
    const familyName = titleCase(family.name);
    const nameLimit = this.width < 520 ? 14 : 20;
    const compactName = familyName.length > nameLimit ? `${familyName.slice(0, nameLimit - 1).trimEnd()}…` : familyName;
    const label = selected ? `${family.code} · ${compactName}` : family.code;
    context.save();
    context.font = `${selected ? 800 : 700} ${selected ? 11 : 10}px "SFMono-Regular", "Cascadia Code", Consolas, monospace`;
    const width = context.measureText(label).width + (selected ? 16 : 10);
    const height = selected ? 24 : 20;
    const box = placeCanvasLabel(width, height, point.x - width / 2, point.y + 10, this.width, this.height, occupied, selected);
    if (!box) {
      context.restore();
      return;
    }
    const color = this.paletteColor(geometry.divisionIndex);
    if (selected) {
      context.strokeStyle = `rgba(${color.join(",")}, 0.34)`;
      context.lineWidth = 0.65;
      context.beginPath();
      context.moveTo(point.x, point.y + 3);
      context.lineTo(clamp(point.x, box.x + 6, box.x + width - 6), box.y);
      context.stroke();
      context.shadowColor = `rgba(${color.join(",")}, 0.2)`;
      context.shadowBlur = 10;
    }
    context.fillStyle = "rgba(4, 9, 17, 0.88)";
    context.strokeStyle = `rgba(${color.join(",")}, ${selected ? 0.48 : 0.2})`;
    context.lineWidth = 0.7;
    roundedRectPath(context, box.x, box.y, width, height, 5);
    context.fill();
    context.stroke();
    context.fillStyle = selected ? "rgba(222, 250, 255, 0.96)" : "rgba(177, 202, 226, 0.8)";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, box.x + width / 2, box.y + height / 2 + 0.5);
    context.restore();
  }

  drawNeuronLabel(context, point, neuronIndex, occupied) {
    const neuron = this.neurons[neuronIndex];
    if (!point || !neuron) return;
    context.save();
    context.font = '800 11px "SFMono-Regular", "Cascadia Code", Consolas, monospace';
    const width = context.measureText(neuron.id).width + 14;
    const height = 22;
    const box = placeCanvasLabel(width, height, point.x + 8, point.y - 28, this.width, this.height, occupied, true);
    if (!box) {
      context.restore();
      return;
    }
    const color = this.paletteColor(neuron.divisionIndex);
    context.fillStyle = "rgba(3, 8, 15, 0.94)";
    context.strokeStyle = `rgba(${color.join(",")}, 0.62)`;
    roundedRectPath(context, box.x, box.y, width, height, 5);
    context.fill();
    context.stroke();
    context.fillStyle = "rgba(224, 252, 255, 0.98)";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(neuron.id, box.x + width / 2, box.y + height / 2 + 0.5);
    context.restore();
  }

  syncLoop() {
    window.cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (!this.context || !this.renderAvailable) return;
    if (this.paused || !this.visible) {
      this.rotationX = this.targetRotationX;
      this.rotationY = this.targetRotationY;
      this.zoom = this.targetZoom;
      this.draw(performance.now());
      return;
    }
    this.raf = window.requestAnimationFrame((time) => this.frame(time));
  }

  frame(time) {
    const elapsed = this.lastTime ? Math.min(40, time - this.lastTime) : 16;
    this.lastTime = time;
    if (!this.dragging && this.hoverDivision < 0) this.targetRotationY += elapsed * 0.000018;
    const rotationDamping = 1 - Math.exp(-elapsed / 145);
    const zoomDamping = 1 - Math.exp(-elapsed / 125);
    this.rotationX += (this.targetRotationX - this.rotationX) * rotationDamping;
    this.rotationY += (this.targetRotationY - this.rotationY) * rotationDamping;
    this.zoom += (this.targetZoom - this.zoom) * zoomDamping;
    this.draw(time);
    this.raf = window.requestAnimationFrame((next) => this.frame(next));
  }
}

function startGalaxy() {
  const canvas = $("[data-galaxy-canvas]");
  if (!canvas) return;
  const atlas = new GalaxyAtlas(canvas);
  if (window.hivePublicSnapshot) atlas.setSnapshot(window.hivePublicSnapshot);
}

function startField() {
  const canvas = $("[data-field-canvas]");
  if (!canvas || !("ResizeObserver" in window)) return;
  new FieldRenderer(canvas);
}

function runSafely(label, start) {
  try {
    start();
  } catch (error) {
    console.warn(`${label} enhancement disabled safely:`, error);
  }
}

runSafely("Motion controls", wireMotionToggle);
runSafely("Top navigation", wireTopbar);
runSafely("Section reveals", wireReveal);
runSafely("Section navigation", wireSectionNav);
runSafely("Offscreen scene control", wireSceneActivity);
runSafely("Living command cycle", wireCommandCycle);
runSafely("Galaxy lenses", wireLenses);
runSafely("Release copy controls", wireCopyButtons);
runSafely("Hive IDE release copy", wireIdeReleaseCopy);
runSafely("Local route notices", wireLocalChatNotice);
runSafely("Ambient field", startField);
runSafely("Living Anatomy galaxy", startGalaxy);
if ($("[data-source-stamp], [data-galaxy-canvas]")) {
  void loadSourceSnapshot().finally(startSnapshotRefresh);
}
void loadAuthorizedRelease();
void loadIdeRelease();
