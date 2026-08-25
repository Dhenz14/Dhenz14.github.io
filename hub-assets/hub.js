import {
  GALAXY_OVERLAY_GAP,
  GALAXY_LENS_PROFILES,
  GALAXY_PUBLIC_PALETTES,
  adaptiveGalaxyDpr,
  buildPublicHandoffContext,
  buildGalaxyGeometry,
  depthSortGalaxyPoints,
  exactGalaxyDirectorState,
  galaxyDivisionVisualRadius,
  galaxyFocusCamera,
  galaxyOverviewCamera,
  galaxyGestureCamera,
  galaxyGestureMetrics,
  galaxyMembershipBundleGeometry,
  galaxyPointerPolicy,
  galaxyRenderState,
  galaxyZoomAtPointer,
  placeCanvasLabel,
  productTruthSemanticRelation,
  productTruthSnapshotRelation,
  projectGalaxyPoint,
  resolveGalaxySelection,
  selectGalaxyHit,
  sourceSnapshotPresentation,
  snapshotIdentityChanged,
  snapshotResponseCanCommit,
  validSnapshot,
} from "./galaxy-core.mjs?v=galaxy-stark-v21";
import {
  IDE_RELEASE_LATEST_BYTES,
  IDE_RELEASE_LATEST_MAX_BYTES,
  IDE_RELEASE_LATEST_SHA256,
  IDE_RELEASE_TRUTH_MANIFEST_SHA256,
  IDE_RELEASE_TRUTH_BYTES,
  IDE_RELEASE_TRUTH_MAX_BYTES,
  humanInstallerBytes,
  validateIdeReleaseLatest,
  validateIdeReleaseTruthManifest,
} from "./ide-release-core.mjs?v=galaxy-stark-v21";
import {
  parseJsonStrict,
} from "./strict-json.mjs?v=galaxy-stark-v21";
import { acquireStrictJson } from "./strict-json-fetch.mjs?v=galaxy-stark-v21";

const GALAXY_OVERVIEW_LABEL_LIMIT = 1;
const HUB_FACTS_MAX_BYTES = 512 * 1024;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const GALAXY_LABEL_OVERLAYS = Object.freeze([
  { selector: ".galaxy-depth", edge: "top" },
  { selector: "[data-galaxy-demo-proof]", edge: "top" },
  { selector: "[data-galaxy-exit]", edge: "top" },
  { selector: ".galaxy-stage-bottom", edge: "bottom" },
  { selector: "[data-galaxy-semantic-fallback]", edge: "floating" },
]);
let toastTimer = 0;

function clearToast() {
  window.clearTimeout(toastTimer);
  toastTimer = 0;
  const globalToast = $("[data-toast]");
  const atlasStatus = $("[data-galaxy-atlas-status]");
  globalToast?.classList.remove("is-visible");
  if (globalToast) globalToast.textContent = "";
  if (atlasStatus) atlasStatus.textContent = "";
}

function showToast(message) {
  clearToast();
  const globalToast = $("[data-toast]");
  const atlasStatus = $("[data-galaxy-dialog].is-full-atlas [data-galaxy-atlas-status]");
  const toast = atlasStatus || globalToast;
  if (!toast) return;
  toast.textContent = message;
  if (toast === globalToast) toast.classList.add("is-visible");
  toastTimer = window.setTimeout(clearToast, 2600);
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
    button.textContent = systemReduced ? "Motion reduced" : effectivePaused ? "Resume motion" : "Pause motion";
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
  let fragmentCorrectionArmed = Boolean(window.location.hash);
  let fragmentCorrectionPasses = 0;
  let fragmentFrame = 0;
  const correctFragment = () => {
    fragmentFrame = 0;
    if (!fragmentCorrectionArmed || !window.location.hash) return;
    let fragmentId;
    try {
      fragmentId = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      fragmentCorrectionArmed = false;
      return;
    }
    const target = document.getElementById(fragmentId);
    if (!target) {
      fragmentCorrectionArmed = false;
      return;
    }
    const headerHeight = Math.ceil(topbar.getBoundingClientRect().height);
    const gap = target.getBoundingClientRect().top - headerHeight;
    fragmentCorrectionPasses += 1;
    if (gap < 12 || gap > 28) {
      window.scrollTo({
        top: Math.max(0, window.scrollY + target.getBoundingClientRect().top - headerHeight - 18),
        behavior: "auto",
      });
    }
    const correctedGap = target.getBoundingClientRect().top - headerHeight;
    if ((correctedGap >= 12 && correctedGap <= 28) || fragmentCorrectionPasses >= 3) fragmentCorrectionArmed = false;
    else fragmentFrame = window.requestAnimationFrame(correctFragment);
  };
  const scheduleFragmentCorrection = (reset = false) => {
    if (reset) {
      fragmentCorrectionArmed = Boolean(window.location.hash);
      fragmentCorrectionPasses = 0;
    }
    if (!fragmentCorrectionArmed || fragmentFrame) return;
    fragmentFrame = window.requestAnimationFrame(() => {
      fragmentFrame = window.requestAnimationFrame(correctFragment);
    });
  };
  const measure = () => {
    const height = Math.ceil(topbar.getBoundingClientRect().height);
    if (height > 0) document.documentElement.style.setProperty("--topbar-height", `${height}px`);
    scheduleFragmentCorrection();
  };
  const sync = () => topbar.classList.toggle("is-scrolled", window.scrollY > 24);
  const observer = "ResizeObserver" in window ? new ResizeObserver(measure) : null;
  observer?.observe(topbar);
  window.addEventListener("resize", measure, { passive: true });
  measure();
  sync();
  window.addEventListener("hashchange", () => scheduleFragmentCorrection(true));
  window.addEventListener("load", () => scheduleFragmentCorrection(true), { once: true });
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
    const initialItems = items.filter((item) => item.closest(".hero"));
    const deferredItems = items.filter((item) => !item.closest(".hero"));
    initialItems.forEach((item) => item.classList.add("is-visible"));
    deferredItems.forEach((item) => item.classList.add("reveal-ready"));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8%", threshold: 0.08 });
    deferredItems.forEach((item) => observer.observe(item));
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
  if (window.location.hash) window.requestAnimationFrame(sync);
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
}

const COMMAND_CYCLE_STEPS = Object.freeze([
  {
    stage: "SEE · SOURCE BOUND",
    title: "See the living body.",
    copy: "The atlas opens on a validated Hive-AI commit. Geometry stays stable as validated snapshot facts load; updates require a newly published snapshot.",
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
    title: "Proof lands. The body may absorb new source truth.",
    copy: "Only after accepted work lands may the compiler absorb current Git truth, converge the public snapshot, and re-render the organism. This demonstration causes zero effects.",
    proof: "SOURCE BOUND",
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
    const targetAspect = width / height;
    const sourceAspect = sourceCanvas.width / sourceCanvas.height;
    let sourceWidth = sourceCanvas.width;
    let sourceHeight = sourceCanvas.height;
    if (sourceAspect > targetAspect) {
      sourceWidth = Math.max(1, Math.round(sourceHeight * targetAspect));
    } else {
      sourceHeight = Math.max(1, Math.round(sourceWidth / targetAspect));
    }
    // Pull the crop window out ~20% so division badges near the source
    // edges arrive whole, and bias it upward where those badges sit.
    if (sourceWidth < sourceCanvas.width || sourceHeight < sourceCanvas.height) {
      sourceHeight = Math.min(sourceCanvas.height, Math.round(sourceHeight * 1.2));
      sourceWidth = Math.min(sourceCanvas.width, Math.round(sourceHeight * targetAspect));
      sourceHeight = Math.max(1, Math.round(sourceWidth / targetAspect));
    }
    const sourceX = Math.round((sourceCanvas.width - sourceWidth) / 2);
    const sourceY = Math.round(Math.max(0, (sourceCanvas.height - sourceHeight) * 0.28));
    echoContext.drawImage(sourceCanvas, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
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
    root.classList.toggle("is-climax", current === COMMAND_CYCLE_STEPS.length - 1);
    scheduleEcho();
    // The readout is already one polite aria-live region; a second toast would
    // announce the same stage twice to assistive technology.
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
    if (announce) showToast(enabled ? "Projector flightdeck open. Arrow keys move between stages; Escape exits." : "Projector flightdeck closed.");
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
      root.dataset.commandState = "discrete";
      select(COMMAND_CYCLE_STEPS.length - 1, false);
      if (walkthroughLabel) walkthroughLabel.textContent = "Replay verified-change reveal";
      showToast("Reduced motion: jumped to the discrete verified-change reveal. Demonstration only; zero effects.");
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
  window.addEventListener("hive:manual-galaxy", () => {
    if (!running) return;
    stop();
    root.dataset.commandState = "manual";
  });

  const applyCommandSnapshot = (snapshot, previous = null) => {
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
    showToast(`Source Atlas absorbed Hive-AI ${sourceCommit.slice(0, 8)}.`);
    absorbedTimer = window.setTimeout(() => {
      if (root.dataset.commandState === "absorbed") root.dataset.commandState = "idle";
    }, 8000);
  };

  window.addEventListener("hive:snapshot", (event) => {
    applyCommandSnapshot(event.detail?.snapshot, event.detail?.previous);
  });

  if (window.hivePublicSnapshot) applyCommandSnapshot(window.hivePublicSnapshot);

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
    copy: "This static page deliberately shows no invented live counters. The local :5002 presentation route is unprobed, the distinct :5003 Operator Body is not independently observed, and Chat remains WAIT.",
    statA: "HOLD",
    labelA: "local body",
    statB: "WAIT",
    labelB: "chat",
    boundary: "Local presentation is UNKNOWN_UNPROBED_HOLD. Operator is HOLD_NOT_INDEPENDENTLY_OBSERVED and disabled; it is never aliased to the presentation route.",
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

function syncPlatformTableTabStop() {
  const region = $(".platform-table-scroll");
  if (!region) return;
  region.tabIndex = region.scrollWidth > region.clientWidth + 1 ? 0 : -1;
}

function wirePlatformTableOverflow() {
  const region = $(".platform-table-scroll");
  if (!region) return;
  const observer = "ResizeObserver" in window ? new ResizeObserver(syncPlatformTableTabStop) : null;
  observer?.observe(region);
  const table = $("table", region);
  if (table) observer?.observe(table);
  window.addEventListener("resize", syncPlatformTableTabStop, { passive: true });
  syncPlatformTableTabStop();
}

function selectLens(name, focusNode = false) {
  const lens = LENSES[name];
  if (!lens) return;
  const map = $("[data-anatomy-map]");
  if (map) map.dataset.lensView = name;
  $$('[data-lens]').forEach((button) => {
    const selected = button.dataset.lens === name;
    button.setAttribute("aria-pressed", String(selected));
    button.tabIndex = selected ? 0 : -1;
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
    button.tabIndex = button.getAttribute("aria-pressed") === "true" || (index === 0 && !buttons.some((candidate) => candidate.getAttribute("aria-pressed") === "true")) ? 0 : -1;
    button.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("hive:manual-galaxy"));
      selectLens(button.dataset.lens);
    });
    button.addEventListener("keydown", (event) => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % buttons.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + buttons.length) % buttons.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = buttons.length - 1;
      window.dispatchEvent(new CustomEvent("hive:manual-galaxy"));
      selectLens(buttons[next].dataset.lens, true);
    });
  });
}

const SNAPSHOT_REFRESH_MS = 60_000;
let snapshotRefreshTimer = 0;
let snapshotRefreshStarted = false;
let snapshotRequestGeneration = 0;

function setSourceBadge(state, label, title) {
  const badge = $(".source-badge");
  if (!badge) return;
  if (state) badge.dataset.state = state;
  else badge.removeAttribute("data-state");
  badge.title = title;
  const textNode = badge.lastChild;
  if (textNode) textNode.textContent = ` ${label}`;
}

function enforceLocalHandoffBoundary() {
  $$('[data-local-context-link]').forEach((node) => {
    const allowed = node instanceof HTMLAnchorElement
      && node.protocol === "http:"
      && node.hostname === "127.0.0.1"
      && node.port === "5002"
      && node.pathname === "/constellation/body"
      && node.search === "?presentation=1";
    if (!allowed) {
      ["href", "target", "formaction"].forEach((name) => node.removeAttribute(name));
      node.setAttribute("aria-disabled", "true");
      node.setAttribute("tabindex", "-1");
      node.classList.add("is-disabled");
      if ("disabled" in node) node.disabled = true;
      return;
    }
    node.target = "hive-local-body";
    node.rel = "noopener noreferrer";
    node.removeAttribute("aria-disabled");
    node.removeAttribute("tabindex");
    node.classList.remove("is-disabled");
  });
}

const PRODUCT_TRUTH_SCHEMA = "hive.ecosystem.product-truth.public-projection.v2";
const PRODUCT_TRUTH_PROJECTION_DIGEST = "78ed09843aeaa94eb1053c92c0c13f12ff65591306905baf67f5ae8560a3d8bc";
const PRODUCT_TRUTH_MAX_BYTES = 128 * 1024;
const PRODUCT_TRUTH_SUBJECTS = Object.freeze({
  target_architecture: { label: "Target architecture", kind: "ARCHITECTURE_TARGET", status: "SOURCE_BOUND_DOCTRINE", plane: "TARGET" },
  source_atlas: { label: "Source atlas", kind: "SOURCE_TOPOLOGY", status: "SOURCE_PRESENT_AT_PIN", plane: "SOURCE_PRESENT" },
  tip_influence: { label: "Source-governed influence rows", kind: "SOURCE_GOVERNED_INFLUENCE_ACCOUNTING", status: "SOURCE_GOVERNED_HOLD", plane: "SOURCE_DERIVED" },
  fleet_halos: { label: "Fleet halos", kind: "NEURON_LOCAL_RETRIEVAL_CONTEXT", status: "DECLARED_HARD_OFF", plane: "SOURCE_PRESENT" },
  released_tester_5: { label: "Tester.5 historical remote-byte evidence", kind: "PUBLIC_RELEASE_REMOTE_ARTIFACT_BYTES", status: "EVIDENCE_EXPIRED_HELD", plane: "HISTORICAL_EVIDENCE" },
  candidate_tester_6_publication: { label: "Tester.6 historical publication readback", kind: "PUBLICATION_CANDIDATE", status: "EVIDENCE_EXPIRED_HELD", plane: "HISTORICAL_EVIDENCE" },
  windows_wsl_candidate_design: { label: "Hive IDE Tauri candidate source", kind: "CROSS_REPOSITORY_CANDIDATE_DESIGN", status: "DECLARED_AT_PIN_BY_NON_DURABLE_EXTERNAL_OBSERVATION", plane: "EXTERNAL_SOURCE_OBSERVATION" },
  linux_hive_ide_publication: { label: "Linux Hive IDE publication", kind: "PLATFORM_PUBLICATION", status: "UNKNOWN_NO_ADMISSIBLE_PUBLICATION_OBSERVATION", plane: "UNKNOWN" },
  macos_hive_ide_publication: { label: "macOS Hive IDE publication", kind: "PLATFORM_PUBLICATION", status: "HELD_MISSING_ADMISSIBLE_PUBLICATION_OBSERVATION", plane: "HELD" },
  installed_runtime: { label: "Installed runtime", kind: "LOCAL_INSTALLED_RUNTIME", status: "UNKNOWN", plane: "UNKNOWN" },
  observed_behavior: { label: "Observed behavior", kind: "LIVE_BEHAVIOR_OBSERVATION", status: "UNKNOWN", plane: "UNKNOWN" },
});
const PRODUCT_TRUTH_SUBJECT_BASE_KEYS = Object.freeze([
  "subject_id", "subject_kind", "subject_status", "claim_plane", "evidence", "evidenceRef", "verifiedAt", "validUntil",
  "freshness", "invalidators", "claim", "doesNotProve", "recertification",
]);
// The atlas advances with main; the evidence baseline is where the doctrine files were
// hashed. They are separate planes and may legitimately differ, so each is pinned against
// its own producer rather than being forced equal to the other.
const EVIDENCE_BASELINE_COMMIT = "472131baa2bc212a043966773bd92477c3a8a16c";
const ATLAS_SOURCE_TREE = "1de15a085a7c41788214d5c0d9c0dfaf4f02eb1c";
const CANONICAL_GENESIS_SEMANTIC_SHA256 = "8b567a0f9b56470ef808c54bad51bd7857fa4ce54aa8b4b165e02c996e489791";
const CANONICAL_GENESIS_SHA256 = "9e324cae2a6b8975d0451a1343166d5c802397595fd4b89a8d4af091574b0948";
const CANONICAL_GENESIS_BYTES = 31198;
const CANONICAL_GENESIS_BLOB = "3cc7a08282dedaeb7c07a193dd3cc8a4a34124d6";
const CANONICAL_MANIFEST_SHA256 = "a4a336b47c3a28da3c08c79b07ff2ef92702dc35c09f8a330df74368faf7f056";
const CANONICAL_MANIFEST_BYTES = 49342;
const CANONICAL_MANIFEST_BLOB = "c1036d2fc877e058965688fe8da5097576a37826";
const CANONICAL_LANDED_COMMIT = "0ab04f6c19ffd41bb162bea674e77853fb27cc0e";
const CANONICAL_LANDED_TREE = "1de15a085a7c41788214d5c0d9c0dfaf4f02eb1c";
const TARGET_SERVING_BOUNDARY = "The source-bound target path is hive-runtime: a constellation-local in-process deterministic scaffold. The doctrine has no BYOM product lane, no implicit external-checkpoint fallback, and no local-model product serve path. An explicitly user-directed external agent may be the inbound caller; that is not a hidden Hive-selected backend fallback. None of this attests an installed runtime or observed behavior.";
const ARCHITECTURE_LIVE_BOUNDARY = "The public atlas and this projection describe source-bound architecture. The explicit local presentation handoff at 127.0.0.1:5002 is UNKNOWN_UNPROBED_HOLD. A dedicated Operator Body is expected as a distinct 127.0.0.1:5003 service but is HOLD_NOT_INDEPENDENTLY_OBSERVED and disabled here; it is never aliased to the presentation route. Chat is WAIT. Installed runtime, route availability, observed behavior, and product-live state require independent evidence.";
const CURRENT_LEGACY_BOUNDARY = "BYOM is RETIRED and implicit external-checkpoint fallback is FORBIDDEN in the source-bound target doctrine. At 2026-08-23T18:46:30Z, Electron-removal and Tauri/WebView2 source were observed on the unprotected Hive IDE candidate branch hive/wt/theyc/ide-electron-final-20260822 at f459e85; at that same observation, the candidate was not present at the then-observed default tip. Current landing and current default-tip relation are UNKNOWN/HOLD_PENDING_FRESH_OWNER_REPOSITORY_READBACK. Tester.5 exact package contents are UNKNOWN_NOT_INSPECTED. The prior claim that tester.5 still bundles Electron is SUPERSEDED_REVOKED_UNSUPPORTED. Docker client requirements are NOT_ADJUDICATED_BY_THIS_MANIFEST; tester.6 publication is held.";
const NO_LLM_BOUNDARY = "At the evidence baseline, doctrine permits an authorized external agent such as Codex or Claude to supply fluent generation as the explicit inbound caller while Hive is assigned local retrieval, routing, verification, and proof gating. The declared route is not an implicit outbound fallback selected by Hive, and it is not current runtime or network-egress proof.";
let productTruthManifest = null;
let productTruthLedger = null;
let productTruthSemanticBaseline = null;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}


function parseProductTruthJsonStrict(source) {
  return parseJsonStrict(source, "product truth");
}

async function sha256Text(value) {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto unavailable");
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Bytes(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto unavailable");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

class ProductTruthBrowserError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ProductTruthBrowserError";
    this.code = code;
  }
}

function assertProductTruth(condition, reason, code = "PRODUCT_TRUTH_BROWSER_CONTRACT_VIOLATION") {
  if (!condition) throw new ProductTruthBrowserError(code, reason);
}

function assertProductTruthKeys(value, expected, label) {
  assertProductTruth(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assertProductTruth(actual.length === wanted.length && actual.every((key, index) => key === wanted[index]), `${label} keys rejected`);
}

async function validateProductTruthManifest(manifest, snapshot, ledger, semanticBaseline) {
  assertProductTruth(manifest && typeof manifest === "object" && !Array.isArray(manifest), "manifest root rejected");
  assertProductTruthKeys(manifest, [
    "schema", "version", "status", "evidenceLedger", "canonicalManifest", "what_architecture_am_i", "source", "architecture", "boundaries",
    "truth_subjects", "atlasTesterMatch", "relations", "definitions", "registryClaimCut", "platforms", "integrityBoundary", "bindingDigest",
  ], "manifest root");
  assertProductTruth(manifest.schema === PRODUCT_TRUTH_SCHEMA && manifest.version === "2.0.0", "manifest identity rejected");
  assertProductTruth(manifest.status === "SOURCE_BOUND_TRUTH_WITH_SUBJECT_SCOPED_RUNTIME_UNKNOWNS", "manifest status rejected");
  assertProductTruthKeys(manifest.evidenceLedger, ["schema", "path", "version", "integrityClass", "independentTrustRoot", "authorizedPublicationAttested", "bytes", "sha256", "gitBlobOid", "headEntryId"], "evidence ledger reference");
  assertProductTruth(manifest.evidenceLedger.schema === "hive.ecosystem.product-truth.public-evidence-projection.ref.v2"
    && manifest.evidenceLedger.path === "hub-assets/product-truth-ledger.public.v2.json"
    && manifest.evidenceLedger.version === 2
    && manifest.evidenceLedger.integrityClass === "SELF_BOUND_INTEGRITY"
    && manifest.evidenceLedger.independentTrustRoot === false
    && manifest.evidenceLedger.authorizedPublicationAttested === false
    && manifest.evidenceLedger.bytes === 7181
    && manifest.evidenceLedger.sha256 === "e623836c21581035e9dd4d5fb2e11abfb3a5e18baf30ef16ce527fdfc74c7f24"
    && manifest.evidenceLedger.gitBlobOid === "249276fd196998fa6b2f3de614f550febfc394ce"
    && manifest.evidenceLedger.headEntryId === "current-public-unknown-hold-after-evidence-expiry-v2", "evidence ledger reference rejected");
  assertProductTruth(ledger?.schema === "hive.ecosystem.product-truth.public-evidence-projection.v2"
    && ledger.version === 2
    && ledger.projectionClass === "PUBLIC_SANITIZED_HISTORICAL_EVIDENCE_WITH_CURRENT_HOLD"
    && ledger.sourceLedger?.publicationDisposition === "PRIVATE_NOT_PUBLISHED"
    && ledger.sourceLedger?.path === "hub-assets/product-truth-ledger.v1.json"
    && ledger.sourceLedger?.bytes === 4653
    && ledger.sourceLedger?.sha256 === "8f38db705bf5e819972d8ec18f35815503d1fdb58bb36b1651e240a2875e1259"
    && ledger.sourceLedger?.gitBlobOid === "943db0a4b30bb4dba38de3db62c5898fd9785e5c"
    && ledger.sourceLedger?.projectionAlgorithm === "hive.product-truth.private-v1-to-public-v2.v1"
    && ledger.integrityClass === "SELF_BOUND_INTEGRITY"
    && ledger.independentTrustRoot === false
    && ledger.authorizedPublicationAttested === false
    && Array.isArray(ledger.entries) && ledger.entries.length === 7
    && ledger.entries.at(-1)?.entryId === manifest.evidenceLedger.headEntryId, "evidence ledger rejected");
  const genesisEntry = ledger.entries.find((entry) => entry.entryId === "canonical-candidate-genesis-v1");
  assertProductTruth(genesisEntry?.status === "IMMUTABLE_CONTENT_ADDRESSED_CANDIDATE_GENESIS_PROVENANCE"
    && genesisEntry.reasonCodes?.includes("ORIGINAL_CONTENT_ADDRESSED_CANDIDATE_GENESIS_IDENTITY")
    && genesisEntry.evidence?.semanticSha256 === CANONICAL_GENESIS_SEMANTIC_SHA256
    && genesisEntry.evidence?.physicalSha256 === CANONICAL_GENESIS_SHA256
    && genesisEntry.evidence?.bytes === CANONICAL_GENESIS_BYTES
    && genesisEntry.evidence?.gitBlobOid === CANONICAL_GENESIS_BLOB, "candidate genesis ledger entry rejected");
  const currentLedgerEntry = ledger.entries.at(-1);
  assertProductTruth(currentLedgerEntry?.temporalDisposition === "CURRENT_EFFECTIVE_DISPOSITION"
    && currentLedgerEntry.status === "UNKNOWN_HOLD"
    && currentLedgerEntry.effectiveState?.hiveIdeLanding === "UNKNOWN_HOLD_PENDING_FRESH_OWNER_REPOSITORY_READBACK"
    && currentLedgerEntry.effectiveState?.localBody === "HOLD_REQUIRES_SEPARATE_ATTESTATION"
    && currentLedgerEntry.effectiveState?.operatorBody === "HOLD_REQUIRES_DISTINCT_RUNTIME_ATTESTATION"
    && currentLedgerEntry.effectiveState?.chat === "WAIT_NOT_AVAILABLE"
    && currentLedgerEntry.effectiveState?.publicActionsAuthorized === false
    && !/https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])/i.test(JSON.stringify(ledger))
    && !/127\.0\.0\.1|localhost|\[::1\]|localBodyUrl|operatorBodyExpectedOrigin|localBodyContext|operatorBodyContext|presentationMode/i.test(JSON.stringify(ledger)), "public ledger current HOLD or transport-coordinate sanitization rejected");

  assertProductTruthKeys(manifest.source, ["projectionRole", "currentSnapshotIdentity", "reviewedSemanticBaseline", "allowedSnapshotRelations"], "manifest source");
  assertProductTruthKeys(manifest.source.currentSnapshotIdentity, ["sourceCommit", "graphHash", "snapshotHash", "capturedAt"], "mutable snapshot identity");
  assertProductTruthKeys(manifest.source.reviewedSemanticBaseline, [
    "schema", "path", "reviewedCommit", "bytes", "sha256", "gitBlobOid", "canonicalSemanticDigest",
    "immutableRawReference", "portableVerificationBoundary",
  ], "reviewed semantic baseline reference");
  assertProductTruthKeys(semanticBaseline, [
    "schema", "version", "snapshotVersion", "sourceCommit", "graphHash", "sourceFingerprint", "projectionHash", "geometryHash", "canonicalSemanticDigest",
  ], "reviewed semantic baseline");
  const semanticProjection = {
    snapshotVersion: semanticBaseline.snapshotVersion,
    sourceCommit: semanticBaseline.sourceCommit,
    graphHash: semanticBaseline.graphHash,
    sourceFingerprint: semanticBaseline.sourceFingerprint,
    projectionHash: semanticBaseline.projectionHash,
    geometryHash: semanticBaseline.geometryHash,
  };
  assertProductTruth(semanticBaseline.schema === "hive.ecosystem.product-truth.semantic-baseline.v1"
    && semanticBaseline.version === 1
    && semanticBaseline.canonicalSemanticDigest === await sha256Text(canonicalJson(semanticProjection))
    && manifest.source.reviewedSemanticBaseline.schema === "hive.ecosystem.product-truth.semantic-baseline.ref.v1"
    && manifest.source.reviewedSemanticBaseline.path === "hub-assets/product-truth-semantic-baseline.v1.json"
    && manifest.source.reviewedSemanticBaseline.reviewedCommit === "b542be86ddf256bc767124f92d2b1e66c37236bb"
    && manifest.source.reviewedSemanticBaseline.bytes === 621
    && manifest.source.reviewedSemanticBaseline.sha256 === "31a060917fc5aac5dc964cd2db0465eb44881a4a2eb9b36fc3459f61bbc58155"
    && manifest.source.reviewedSemanticBaseline.gitBlobOid === "1636e500e7d5f53a1cfcda2dabf1510bbd377dbe"
    && manifest.source.reviewedSemanticBaseline.canonicalSemanticDigest === semanticBaseline.canonicalSemanticDigest
    && /not verified by the browser/i.test(manifest.source.reviewedSemanticBaseline.portableVerificationBoundary), "reviewed semantic baseline identity rejected");
  assertProductTruth(manifest.source.currentSnapshotIdentity.sourceCommit === snapshot.hiveAi.sourceCommit
    && manifest.source.currentSnapshotIdentity.graphHash === snapshot.hiveAi.graphHash
    && manifest.source.currentSnapshotIdentity.snapshotHash === snapshot.snapshotHash
    && manifest.source.currentSnapshotIdentity.capturedAt === snapshot.capturedAt, "mutable snapshot identity rejected");
  assertProductTruth(manifest.source.projectionRole === "Commit-bound reviewed semantics are immutable input. The mutable source snapshot may display validated topology but cannot rewrite reviewed semantic, runtime, product, or authority claims without a fresh review.", "projection role rejected");
  assertProductTruth(Array.isArray(manifest.source.allowedSnapshotRelations)
    && manifest.source.allowedSnapshotRelations.join("|") === "EXACT_REVIEWED_BASELINE_MATCH|NEW_SOURCE_SNAPSHOT_UNREVIEWED_HOLD|BRIDGE_INACTIVE_LAST_GOOD_SOURCE|SNAPSHOT_INVALID_BLOCKED", "snapshot relation set rejected");
  const snapshotRelation = await productTruthSnapshotRelation(snapshot, semanticBaseline);
  assertProductTruth(manifest.source.allowedSnapshotRelations.includes(snapshotRelation), "snapshot relation escaped the closed set");
  assertProductTruth(snapshotRelation !== "SNAPSHOT_INVALID_BLOCKED", "source snapshot failed validation");

  const canonicalManifest = manifest.canonicalManifest;
  assertProductTruthKeys(canonicalManifest, [
    "status", "landingStatus", "publicRetrievability", "repository", "path", "evidenceSourceCommit", "evidenceSourceTree",
    "candidateSemanticSha256", "candidateSha256", "candidateBytes", "candidateGitBlobOid",
    "candidateFirstGreenCommit", "candidateLastPrelandingCommit",
    "landedCommit", "landedTree", "landedSha256", "landedBytes", "landedGitBlobOid", "audit",
  ], "canonical manifest custody");
  assertProductTruthKeys(canonicalManifest.audit, ["status", "bindingStatus", "authorityConferred"], "canonical candidate audit");
  // Identity of the manifest content is fixed and independent of whether it has landed.
  assertProductTruth(
    canonicalManifest.repository === "Dhenz14/Hive-AI"
      && canonicalManifest.path === "configs/public/constellation_architecture_v1.json"
      && canonicalManifest.evidenceSourceCommit === EVIDENCE_BASELINE_COMMIT
      && canonicalManifest.evidenceSourceTree === "1910ab8b2bc7bcfe544b2d615f38ce2f9de5ce00"
      && canonicalManifest.candidateSemanticSha256 === CANONICAL_GENESIS_SEMANTIC_SHA256
      && canonicalManifest.candidateSha256 === CANONICAL_GENESIS_SHA256
      && canonicalManifest.candidateBytes === CANONICAL_GENESIS_BYTES
      && canonicalManifest.candidateGitBlobOid === CANONICAL_GENESIS_BLOB
      && canonicalManifest.candidateFirstGreenCommit === "5e3f974c8a80064d2388ea81cb151117555ff6b4"
      && canonicalManifest.candidateLastPrelandingCommit === "ade641d988e933be5441d7f5ec15bea616d2bda7"
      && canonicalManifest.landingStatus === "LANDED_HASH_VERIFIED"
      && canonicalManifest.publicRetrievability === "PRIVATE_SOURCE_NOT_PUBLICLY_RETRIEVABLE"
      && canonicalManifest.audit.status === "PASS"
      && canonicalManifest.audit.bindingStatus === "SOURCE_BOUND_MATCH"
      && canonicalManifest.audit.authorityConferred === false,
    "canonical candidate custody or authority rejected",
  );
  // Custody has exactly two admissible shapes. The landed shape is pinned here in the
  // browser, so a tampered manifest cannot assert a landing this page has not been
  // built to expect; and landing never confers authority.
  if (canonicalManifest.status === "CANDIDATE_NOT_LANDED") {
    assertProductTruth(
      canonicalManifest.landedCommit === null
        && canonicalManifest.landedTree === null
        && canonicalManifest.landedSha256 === null
        && canonicalManifest.landedBytes === null
        && canonicalManifest.landedGitBlobOid === null,
      "unlanded canonical manifest claimed landing evidence",
    );
  } else {
    assertProductTruth(
      canonicalManifest.status === "LANDED_HASH_VERIFIED"
        && canonicalManifest.landedCommit === CANONICAL_LANDED_COMMIT
        && canonicalManifest.landedTree === CANONICAL_LANDED_TREE
        && canonicalManifest.landedSha256 === CANONICAL_MANIFEST_SHA256
        && canonicalManifest.landedBytes === CANONICAL_MANIFEST_BYTES
        && canonicalManifest.landedGitBlobOid === CANONICAL_MANIFEST_BLOB,
      "landed canonical manifest custody rejected",
    );
  }

  const identity = manifest.what_architecture_am_i;
  assertProductTruthKeys(identity, ["question", "answer", "architecture_id", "architecture_version", "identity_material", "identity_sha256", "subject_id", "claim_plane"], "architecture identity");
  assertProductTruth(
    identity.question === "WHAT_ARCHITECTURE_AM_I?"
      && identity.answer === "SOVEREIGN_HIVEBRAIN_CONSTELLATION"
      && identity.architecture_id === "hiveai.sovereign_hivebrain_constellation.v1"
      && identity.architecture_version === "1.0.0"
      && identity.identity_material === "hiveai.sovereign_hivebrain_constellation.v1|1.0.0|472131baa2bc212a043966773bd92477c3a8a16c|1910ab8b2bc7bcfe544b2d615f38ce2f9de5ce00"
      && identity.identity_sha256 === "971437dd8d1474262627881e6c2d4baef9b0d705424d7eb4abd09a5d2baf5b61"
      && identity.subject_id === "target_architecture"
      && identity.claim_plane === "TARGET",
    "architecture identity rejected",
  );

  assertProductTruthKeys(manifest.architecture, ["label", "status", "servingBoundary"], "architecture display");
  assertProductTruth(manifest.architecture.label === "HiveBrain Constellation" && manifest.architecture.status === "SOURCE_BOUND_DOCTRINE" && manifest.architecture.servingBoundary === TARGET_SERVING_BOUNDARY, "architecture boundary rejected");
  assertProductTruthKeys(manifest.boundaries, ["architectureVsLive", "currentVsLegacy", "noLlmClaim"], "claim boundaries");
  assertProductTruthKeys(manifest.boundaries.architectureVsLive, ["status", "claim"], "architecture/live boundary");
  assertProductTruthKeys(manifest.boundaries.currentVsLegacy, ["status", "claim"], "current/legacy boundary");
  assertProductTruthKeys(manifest.boundaries.noLlmClaim, ["status", "claim", "exactBoundary"], "no-LLM boundary");
  assertProductTruth(manifest.boundaries.architectureVsLive.status === "SEPARATE_PLANES" && manifest.boundaries.architectureVsLive.claim === ARCHITECTURE_LIVE_BOUNDARY, "architecture/live boundary rejected");
  assertProductTruth(manifest.boundaries.currentVsLegacy.status === "SUBJECT_SCOPED_DISPOSITIONS" && manifest.boundaries.currentVsLegacy.claim === CURRENT_LEGACY_BOUNDARY, "legacy boundary rejected");
  assertProductTruth(manifest.boundaries.noLlmClaim.status === "HOLD" && manifest.boundaries.noLlmClaim.claim === "This site does not publish a bare 'no LLM' claim." && manifest.boundaries.noLlmClaim.exactBoundary === NO_LLM_BOUNDARY, "no-LLM boundary rejected");

  const subjects = manifest.truth_subjects;
  assertProductTruthKeys(subjects, Object.keys(PRODUCT_TRUTH_SUBJECTS), "truth subject set");
  const subjectSpecificKeys = {
    target_architecture: ["productLaneByom", "legacyApiNamesPresent", "implicitExternalFallback", "outboundCentralizedModelDependency", "externalCheckpointFallback", "localModelProductServePath", "externalAgentIsClientNotBackend", "directPersonClientsSupported", "customNeuralArtifactsExist", "bareNoLlmClaimAllowed", "defaultPath", "inboundGenerationDoctrineAtPin", "publicGenerationExplanation"],
    source_atlas: ["sourceCommit", "sourceTree", "graphHash", "snapshotHash", "neurons", "trainable", "deterministic", "divisions", "families", "rowBackedTwitchProofs"],
    tip_influence: ["matchingRows", "effectiveDisposition", "executeAuthorized", "permanentProductTurnWire", "reason"],
    fleet_halos: ["declared", "admitted", "indexed", "runtime", "served", "productLive"],
    released_tester_5: ["effectiveStatus", "activeDownloadAuthorized", "currentPackageStatus", "currentPublicRetrievability", "currentInstallerUrl", "currentRuntimeStatus", "historicalEvidence"],
    candidate_tester_6_publication: ["tag", "githubReleaseApiStatus", "url", "bytes", "sha256", "signatureStatus", "readbackReceiptSha256"],
    windows_wsl_candidate_design: ["ownerRepository", "repositoryRef", "repositoryCommit", "designTopology", "evidencePersistence"],
    linux_hive_ide_publication: ["platform", "url", "bytes", "sha256", "signatureStatus", "unknownReason"],
    macos_hive_ide_publication: ["platform", "url", "bytes", "sha256", "signatureStatus", "notarizationStatus", "holdReason"],
    installed_runtime: ["runtimeSourceCommit", "installPath", "healthStatus", "attestationRef", "unknownReason"],
    observed_behavior: ["observationId", "runtimeIdentityRef", "behaviorStatus", "receiptRef", "unknownReason"],
  };
  const rfc3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
  Object.entries(PRODUCT_TRUTH_SUBJECTS).forEach(([key, expected]) => {
    const subject = subjects[key];
    assertProductTruthKeys(subject, [...PRODUCT_TRUTH_SUBJECT_BASE_KEYS, ...subjectSpecificKeys[key]], `${key} subject`);
    assertProductTruth(subject.subject_id === key && subject.subject_kind === expected.kind && subject.subject_status === expected.status && subject.claim_plane === expected.plane, `${key} identity/status/plane rejected`);
    assertProductTruth(typeof subject.evidence === "string" && typeof subject.claim === "string" && Array.isArray(subject.invalidators) && subject.invalidators.length > 0 && Array.isArray(subject.doesNotProve) && subject.doesNotProve.length > 0, `${key} evidence ceiling rejected`);
    assertProductTruth(subject.verifiedAt === null || rfc3339.test(subject.verifiedAt), `${key} verified time rejected`);
    assertProductTruth(subject.validUntil === null || rfc3339.test(subject.validUntil), `${key} validity time rejected`);
    if (subject.validUntil) assertProductTruth(subject.verifiedAt && Date.parse(subject.validUntil) > Date.parse(subject.verifiedAt), `${key} validity window rejected`);
    if (expected.plane === "UNKNOWN") assertProductTruth(subject.evidenceRef === null && subject.verifiedAt === null && subject.validUntil === null && subject.freshness === "UNKNOWN", `${key} UNKNOWN plane rejected`);
    if (subject.recertification !== null) {
      assertProductTruthKeys(subject.recertification, ["ownerId", "procedureId", "trigger", "expiryAction"], `${key} recertification`);
      assertProductTruth(Object.values(subject.recertification).every((value) => typeof value === "string" && value.length > 0), `${key} recertification rejected`);
    }
  });

  const target = subjects.target_architecture;
  assertProductTruth(
    target.productLaneByom === false && target.legacyApiNamesPresent === true && target.implicitExternalFallback === false
      && target.outboundCentralizedModelDependency === false && target.externalCheckpointFallback === false
      && target.localModelProductServePath === false && target.externalAgentIsClientNotBackend === true
      && target.directPersonClientsSupported === true && target.customNeuralArtifactsExist === true
      && target.bareNoLlmClaimAllowed === false
      && target.defaultPath === "hive-runtime (constellation-local in-process deterministic scaffold)"
      && /Source doctrine at the evidence baseline/.test(target.inboundGenerationDoctrineAtPin)
      && /explicit inbound caller/.test(target.publicGenerationExplanation),
    "target doctrine predicates rejected",
  );
  const source = subjects.source_atlas;
  assertProductTruth(source.sourceCommit === manifest.source.currentSnapshotIdentity.sourceCommit
    && source.sourceTree === ATLAS_SOURCE_TREE
    && source.graphHash === manifest.source.currentSnapshotIdentity.graphHash
    && source.snapshotHash === manifest.source.currentSnapshotIdentity.snapshotHash,
  "reviewed atlas binding rejected");
  assertProductTruth(source.neurons === 640 && source.trainable === 448 && source.deterministic === 192 && source.divisions === 16 && source.families === 64 && source.rowBackedTwitchProofs === 636, "atlas counts rejected");
  const tip = subjects.tip_influence;
  assertProductTruth(tip.matchingRows === 37 && tip.effectiveDisposition === "HOLD" && tip.executeAuthorized === false && tip.permanentProductTurnWire === false && tip.reason === "TIP_FUSE_CODE_BINDING_BYTES_MISMATCH_FAIL_CLOSED", "TIP source-predicate ceiling rejected");
  const halos = subjects.fleet_halos;
  assertProductTruth(halos.declared === 640 && halos.admitted === 0 && halos.indexed === 0 && halos.runtime === false && halos.served === false && halos.productLive === false, "halo hard-off ceiling rejected");
  assertProductTruth(/9fd9d11b2cf595b51e80b05ba4ec76d7d07a55023159756127f6cf61a17d3e49/.test(halos.evidenceRef) && /ef804428576068626aa85230821633daf04371ec23f4e4540aa5aff0d408396c/.test(halos.evidenceRef), "halo evidence refs rejected");

  const tester5 = subjects.released_tester_5;
  assertProductTruthKeys(tester5.historicalEvidence, ["outerExecutable", "receiptCustody"], "tester.5 historical planes");
  const tester5Historical = tester5.historicalEvidence.outerExecutable;
  const tester5Receipt = tester5.historicalEvidence.receiptCustody;
  assertProductTruthKeys(tester5Receipt, [
    "repository", "path", "sha256", "sha256VerificationStatus", "bytes", "gitObjectStatus",
    "landingCommit", "landingTree", "gitBlobOid", "landingStatus", "publicRetrievability",
  ], "tester.5 receipt custody");
  assertProductTruth(
    tester5.effectiveStatus === "EVIDENCE_EXPIRED_HELD" && tester5.activeDownloadAuthorized === false
      && tester5.currentPackageStatus === "UNKNOWN" && tester5.currentPublicRetrievability === "UNKNOWN"
      && tester5.currentInstallerUrl === null && tester5.currentRuntimeStatus === "UNKNOWN"
      && tester5Historical.tag === "hive-ide-v0.3.0-tester.5" && tester5Historical.releaseId === 366980498 && tester5Historical.assetId === 505603161
      && tester5Historical.bytes === 924864317 && tester5Historical.sha256 === "be1795640763e99315b426757c76d655f6f07f92701d040c62f6126c1401b000"
      && tester5Historical.artifactBytesIndependentlyVerified === true && tester5Historical.artifactSha256IndependentlyVerified === true
      && tester5Historical.authenticodeStatus === "NotSigned" && tester5Historical.publisherAuthenticated === false && tester5Historical.signedPublicRelease === false
      && tester5Historical.smartScreenWarningExpected === true && tester5Historical.artifactExecuted === false && tester5Historical.packageContentsStatus === "UNKNOWN_NOT_INSPECTED"
      && tester5Historical.sourceCommit === "6f7fd8a9a18c8921aa0fad1fe5b0b901bacd3383"
      && tester5Historical.embeddedHiveAiCommit === "a0fe64832edb801c9944c0923e222a64ef14e498"
      && tester5Historical.representsReviewedSourceAtlas === false
      && tester5Historical.retrievabilityAtObservation === "REMOTE_ASSET_RETRIEVED_OVER_HTTPS"
      && tester5Receipt.sha256 === "6f8890a30285200e2ce1289672b17760e202ce85978cacd18e4eac7009ea3f56"
      && tester5Receipt.sha256VerificationStatus === "DECLARED_NOT_REVERIFIED_IN_SITE_CUSTODY"
      && tester5Receipt.bytes === null
      && tester5Receipt.gitObjectStatus === "UNKNOWN_NOT_AVAILABLE_IN_SITE_CUSTODY"
      && tester5Receipt.landingCommit === null && tester5Receipt.landingTree === null && tester5Receipt.gitBlobOid === null
      && tester5Receipt.landingStatus === "UNKNOWN_NOT_VERIFIED_FROM_PUBLIC_SITE_CUSTODY"
      && tester5.verifiedAt === "2026-08-23T19:20:09.7630961Z" && tester5.validUntil === "2026-08-24T19:20:09.7630961Z",
    "tester.5 expired historical evidence plane rejected",
  );
  const tester6 = subjects.candidate_tester_6_publication;
  assertProductTruth(tester6.tag === "hive-ide-v0.3.0-tester.6" && tester6.githubReleaseApiStatus === 404 && tester6.url === null && tester6.bytes === null && tester6.sha256 === null && tester6.signatureStatus === "UNKNOWN" && tester6.readbackReceiptSha256 === "cf4101d607fbcfce8a9173311cb1d45c9fc6c81d82514d013df30c4a5bec97b0" && tester6.verifiedAt === "2026-08-23T19:37:31.6497275Z" && tester6.validUntil === "2026-08-24T19:37:31.6497275Z", "tester.6 publication HOLD rejected");
  const wsl = subjects.windows_wsl_candidate_design;
  assertProductTruth(wsl.repositoryCommit === "f459e85cc71801afbed4a8579b31133b9ff58edd"
    && wsl.ownerRepository === "Dhenz14/hive-ide"
    && wsl.evidencePersistence === "NON_DURABLE_REVIEWER_OBSERVATION_NO_SOURCE_CONTROLLED_RECEIPT"
    && /Historical Tauri\/WebView2 candidate-source observation/.test(wsl.designTopology)
    && /^At 2026-08-23T18:46:30Z,/.test(wsl.claim)
    && /then-observed default tip 41df9be/.test(wsl.claim)
    && /Current landing and current default-tip relation are UNKNOWN/.test(wsl.claim)
    && !/remains unlanded|current default tip/i.test(wsl.claim)
    && /HOLD_PENDING_FRESH_OWNER_REPOSITORY_READBACK/.test(wsl.designTopology),
  "Hive IDE candidate source observation rejected");
  assertProductTruth(subjects.linux_hive_ide_publication.url === null && /UNKNOWN/.test(subjects.linux_hive_ide_publication.claim), "Linux publication UNKNOWN rejected");
  assertProductTruth(subjects.macos_hive_ide_publication.url === null && subjects.macos_hive_ide_publication.notarizationStatus === null && /held/i.test(subjects.macos_hive_ide_publication.claim), "macOS publication HOLD rejected");
  assertProductTruth(subjects.installed_runtime.runtimeSourceCommit === null && /neither probes nor claims/.test(subjects.installed_runtime.claim), "installed runtime UNKNOWN rejected");
  assertProductTruth(subjects.observed_behavior.observationId === null && /do not prove/.test(subjects.observed_behavior.claim), "observed behavior UNKNOWN rejected");

  assertProductTruth(manifest.atlasTesterMatch === "MISMATCH", "atlas/tester mismatch rejected");
  assertProductTruthKeys(manifest.relations, ["atlasTester", "testerSubjects", "candidateServed"], "truth relations");
  assertProductTruthKeys(manifest.relations.atlasTester, ["status", "atlasSourceCommit", "testerEmbeddedHiveAiCommit", "claim"], "atlas/tester relation");
  assertProductTruthKeys(manifest.relations.testerSubjects, ["status", "tester5Subject", "tester6Subject", "claim"], "tester subject relation");
  assertProductTruthKeys(manifest.relations.candidateServed, ["status", "claim"], "candidate/served relation");
  assertProductTruth(manifest.relations.atlasTester.status === "MISMATCH" && manifest.relations.atlasTester.atlasSourceCommit === source.sourceCommit && manifest.relations.atlasTester.testerEmbeddedHiveAiCommit === tester5Historical.embeddedHiveAiCommit && /must not be presented as realizing/.test(manifest.relations.atlasTester.claim), "atlas/tester relation rejected");
  assertProductTruth(manifest.relations.testerSubjects.status === "SEPARATE_SUBJECTS" && manifest.relations.testerSubjects.tester5Subject === "released_tester_5" && manifest.relations.testerSubjects.tester6Subject === "candidate_tester_6_publication", "tester subject separation rejected");
  // Mirrors custody, and must keep disclaiming runtime/behaviour/authority/product-live
  // on both sides of a landing. Landing may only retire the landing/main disclaimer.
  assertProductTruth(manifest.relations.candidateServed.status === canonicalManifest.status
    && /installed-runtime, behavior, authority, or product-live claim is allowed/i.test(manifest.relations.candidateServed.claim), "candidate/served HOLD rejected");

  assertProductTruth(Array.isArray(manifest.definitions) && manifest.definitions.map((item) => item.id).join("|") === "neuron|halo|division-family|hivebrain|twitch|living-anatomy", "definition set rejected");
  manifest.definitions.forEach((definition) => assertProductTruthKeys(definition, ["id", "label", "definition", "boundary"], `${definition.id} definition`));
  const definitions = Object.fromEntries(manifest.definitions.map((definition) => [definition.id, definition]));
  assertProductTruth(/catalog presence never means active/.test(definitions.neuron.boundary), "neuron definition rejected");
  assertProductTruth(/zero admitted sections and zero materialized indexes/.test(definitions.halo.boundary), "halo definition rejected");
  assertProductTruth(/never a retrieval halo/.test(definitions["division-family"].boundary), "division/halo collision rejected");
  assertProductTruth(/not automatic execution/.test(definitions.twitch.boundary), "Twitch definition rejected");
  assertProductTruth(/No Living Anatomy runtime is attested/.test(definitions["living-anatomy"].boundary) && /not brain authority/.test(definitions["living-anatomy"].boundary), "Living Anatomy boundary rejected");

  const registry = manifest.registryClaimCut;
  assertProductTruthKeys(registry, ["status", "sourceCommit", "derivedAt", "authority", "matchingRows", "effectiveDisposition", "executeAuthorized", "permanentProductTurnWire", "reason", "boundary"], "registry claim cut");
  assertProductTruth(registry.status === "HOLD" && registry.sourceCommit === EVIDENCE_BASELINE_COMMIT && registry.derivedAt === "2026-08-23T18:46:30Z" && registry.authority === "full_catalog_grant_bound_influence_accounting_via_agent_query" && registry.matchingRows === 37 && registry.effectiveDisposition === "HOLD" && registry.executeAuthorized === false && registry.permanentProductTurnWire === false && registry.reason === tip.reason, "registry fixed cut rejected");

  const platformIds = "windows-x64-remote|windows-wsl-design|linux-source|linux-publication|macos-publication";
  assertProductTruth(Array.isArray(manifest.platforms) && manifest.platforms.map((item) => item.id).join("|") === platformIds, "platform set rejected");
  const platformKeys = ["id", "label", "subjectId", "subjectKind", "claimPlane", "scope", "supportStatus", "testStatus", "packageStatus", "signingStatus", "evidence", "evidenceRef", "verifiedAt", "validUntil", "freshness"];
  manifest.platforms.forEach((platform) => assertProductTruthKeys(platform, platformKeys, `${platform.id} platform`));
  const platformById = Object.fromEntries(manifest.platforms.map((platform) => [platform.id, platform]));
  const windows = platformById["windows-x64-remote"];
  assertProductTruth(windows.subjectId === "released_tester_5" && windows.claimPlane === "HISTORICAL_EVIDENCE" && windows.supportStatus === "EVIDENCE_EXPIRED_HELD" && windows.testStatus === "HOLD_NOT_AUTHORIZED" && windows.packageStatus === "UNKNOWN" && windows.signingStatus === "HISTORICAL_AUTHENTICODE_NOT_SIGNED" && windows.verifiedAt === tester5.verifiedAt && windows.validUntil === tester5.validUntil, "Windows expired-evidence platform rejected");
  const wslPlatform = platformById["windows-wsl-design"];
  assertProductTruth(wslPlatform.subjectId === "windows_wsl_candidate_design" && wslPlatform.claimPlane === "EXTERNAL_SOURCE_OBSERVATION" && wslPlatform.validUntil === null, "Windows+WSL platform boundary rejected");
  assertProductTruth(platformById["linux-source"].subjectId === "source_atlas" && platformById["linux-source"].claimPlane === "SOURCE_PRESENT", "Linux source row rejected");
  assertProductTruth(platformById["linux-publication"].subjectId === "linux_hive_ide_publication" && platformById["linux-publication"].evidenceRef === null && platformById["linux-publication"].freshness === "UNKNOWN", "Linux publication row rejected");
  assertProductTruth(platformById["macos-publication"].subjectId === "macos_hive_ide_publication" && platformById["macos-publication"].evidenceRef === null && platformById["macos-publication"].claimPlane === "HELD", "macOS publication row rejected");

  assertProductTruthKeys(manifest.integrityBoundary, ["integrityClass", "independentTrustRoot", "authorizedPublicationAttested", "manifestSelfHashProvesSemanticTruth", "authorityConferred", "claim"], "integrity boundary");
  assertProductTruth(manifest.integrityBoundary.integrityClass === "SELF_BOUND_INTEGRITY" && manifest.integrityBoundary.independentTrustRoot === false && manifest.integrityBoundary.authorizedPublicationAttested === false && manifest.integrityBoundary.manifestSelfHashProvesSemanticTruth === false && manifest.integrityBoundary.authorityConferred === false && /does not establish an INDEPENDENT_TRUST_ROOT/.test(manifest.integrityBoundary.claim) && /does not .*attest authorized publication/i.test(manifest.integrityBoundary.claim) && /not a detached signature/.test(manifest.integrityBoundary.claim), "integrity authority ceiling rejected");
  assertProductTruthKeys(manifest.bindingDigest, ["algorithm", "canonicalization", "excluded", "value"], "binding digest");
  assertProductTruth(manifest.bindingDigest.algorithm === "sha256" && manifest.bindingDigest.canonicalization === "recursive-key-sort-json-utf8" && Array.isArray(manifest.bindingDigest.excluded) && manifest.bindingDigest.excluded.length === 1 && manifest.bindingDigest.excluded[0] === "bindingDigest", "projection digest recipe rejected");
  const projection = { ...manifest };
  delete projection.bindingDigest;
  const actualDigest = await sha256Text(canonicalJson(projection));
  assertProductTruth(manifest.bindingDigest.value === PRODUCT_TRUTH_PROJECTION_DIGEST, "projection digest is not independently pinned by the browser consumer");
  assertProductTruth(actualDigest === manifest.bindingDigest.value, "projection digest mismatch");
  return true;
}

function createTruthElement(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value;
  return node;
}

function readableManifestState(value) {
  return String(value || "unknown").replaceAll("_", " ");
}

function blockProductTruth(reason) {
  const root = $("[data-product-truth]");
  if (!root) return;
  root.dataset.state = "blocked";
  setText("[data-product-truth-status]", `Product truth blocked — ${reason}`);
  setText("[data-product-truth-architecture]", "Unavailable until binding validates");
  setText("[data-product-truth-source]", "blocked");
  setText("[data-product-truth-captured]", "blocked");
  setText("[data-product-truth-canonical]", "blocked");
  setText("[data-product-truth-state-label]", "FAIL CLOSED");
}

async function renderProductTruthManifest(manifest, snapshot, ledger = productTruthLedger, semanticBaseline = productTruthSemanticBaseline) {
  const root = $("[data-product-truth]");
  if (!root) return;
  try {
    await validateProductTruthManifest(manifest, snapshot, ledger, semanticBaseline);
    const semanticRelation = await productTruthSemanticRelation(snapshot, semanticBaseline);
    const snapshotRelation = await productTruthSnapshotRelation(snapshot, semanticBaseline);
    const semanticCurrent = semanticRelation === "EXACT_REVIEWED_BASELINE_MATCH";
    root.dataset.state = semanticCurrent ? "ready" : "held";
    setText("[data-product-truth-status]", semanticCurrent
      ? "SNAPSHOT CONTRACT PASS · EXACT REVIEWED SEMANTICS"
      : `${readableManifestState(snapshotRelation)} · SEMANTIC/RUNTIME CLAIMS HOLD`);
    setText("[data-product-truth-integrity]", manifest.integrityBoundary.claim);
    setText("[data-product-truth-architecture]", `${manifest.architecture.label} · ${readableManifestState(manifest.architecture.status)}`);
    setText("[data-product-truth-source]", snapshot.hiveAi.sourceCommit);
    setText("[data-product-truth-captured]", `${snapshot.capturedAt} · displayed topology; reviewed semantics @ ${semanticBaseline.sourceCommit.slice(0, 12)}`);
    setText("[data-product-truth-canonical]", `${manifest.canonicalManifest.landedCommit.slice(0, 12)} · LANDED SOURCE / PUBLISHED HISTORICAL SNAPSHOT · FRESHNESS HOLD · ${readableManifestState(manifest.canonicalManifest.publicRetrievability)}`);
    setText("[data-product-truth-state-label]", "SOURCE BOUND");

    const claimsRoot = $("[data-product-truth-claims]", root);
    if (claimsRoot) {
      claimsRoot.replaceChildren();
      Object.entries(PRODUCT_TRUTH_SUBJECTS).forEach(([key, expected]) => {
        const subject = manifest.truth_subjects[key];
        const evidenceExpired = Boolean(subject.validUntil) && Date.now() >= Date.parse(subject.validUntil);
        const displayStatus = evidenceExpired ? "EVIDENCE FRESHNESS EXPIRED · HELD" : readableManifestState(subject.subject_status);
        const displayClaim = evidenceExpired
          ? `${subject.claim} This external observation was not freshly reverified by ${subject.validUntil}; immutable historical identity remains visible, but every current claim is HELD.`
          : subject.claim;
        const card = createTruthElement("article", "truth-plane-card", "");
        card.dataset.subject = key;
        if (evidenceExpired) card.dataset.state = "held";
        card.append(
          createTruthElement("span", "truth-plane-status", `${readableManifestState(subject.claim_plane)} · ${displayStatus}`),
          createTruthElement("strong", "", expected.label),
          createTruthElement("p", "", displayClaim),
          createTruthElement("small", "", `Evidence: ${subject.evidenceRef || "required but absent"} · Verified: ${subject.verifiedAt || "UNKNOWN"}${subject.validUntil ? ` · Valid until: ${subject.validUntil}` : ""}`),
        );
        const ceiling = document.createElement("details");
        ceiling.className = "truth-plane-ceiling";
        ceiling.append(
          createTruthElement("summary", "", "Evidence ceiling"),
          createTruthElement("p", "", `${subject.evidence} Freshness: ${readableManifestState(subject.freshness)}.`),
          createTruthElement("p", "", `Invalidated by: ${subject.invalidators.join("; ")}. This subject does not prove any other truth subject.`),
        );
        card.append(ceiling);
        claimsRoot.append(card);
      });
    }

    const platformRoot = $("[data-platform-matrix]", root);
    if (platformRoot) {
      platformRoot.replaceChildren();
      manifest.platforms.forEach((platform) => {
        const row = document.createElement("tr");
        const evidenceExpired = Boolean(platform.validUntil) && Date.now() >= Date.parse(platform.validUntil);
        if (evidenceExpired) row.dataset.state = "held";
        const name = createTruthElement("th", "", evidenceExpired ? `${platform.label} · HELD` : platform.label);
        name.scope = "row";
        row.append(name);
        const platformStates = evidenceExpired
          ? [`${platform.supportStatus} · HISTORICAL`, "EVIDENCE EXPIRED · HELD", "EVIDENCE EXPIRED · HELD", `${platform.signingStatus} · LAST READBACK`]
          : [platform.supportStatus, platform.testStatus, platform.packageStatus, platform.signingStatus];
        const platformLabels = ["Support", "Test evidence", "Public package", "Signing"];
        platformStates.forEach((value, stateIndex) => {
          const cell = createTruthElement("td", "", readableManifestState(value));
          cell.dataset.label = platformLabels[stateIndex];
          row.append(cell);
        });
        const evidenceCell = createTruthElement("td", "", `${platform.evidence} Source: ${platform.evidenceRef || "no admitted evidence reference"}. Verified: ${platform.verifiedAt || "UNKNOWN"}. Valid until: ${platform.validUntil || "not time-bounded by this evidence set"}.${evidenceExpired ? " Current publication claims are HELD pending a fresh readback." : ""}`);
        evidenceCell.dataset.label = "Evidence ceiling";
        row.append(evidenceCell);
        platformRoot.append(row);
      });
      window.requestAnimationFrame(syncPlatformTableTabStop);
    }

    const cut = manifest.registryClaimCut;
    const cutRoot = $("[data-registry-claim-cut]", root);
    if (cutRoot) cutRoot.hidden = false;
    setText("[data-registry-matching-rows]", String(cut.matchingRows));
    setText("[data-registry-source]", cut.sourceCommit);
    setText("[data-registry-derived]", cut.derivedAt);
    setText("[data-registry-status]", cut.status);
    setText("[data-registry-reason]", cut.reason);
  } catch (error) {
    blockProductTruth(error instanceof Error ? error.message : "validation rejected");
    console.warn("Product truth projection was rejected safely:", error);
  }
}

function wireProductTruthManifest() {
  const root = $("[data-product-truth]");
  if (!root) return;
  window.addEventListener("hive:snapshot", (event) => {
    if (productTruthManifest && productTruthLedger && productTruthSemanticBaseline) {
      void renderProductTruthManifest(productTruthManifest, event.detail.snapshot, productTruthLedger, productTruthSemanticBaseline);
    }
  });
  window.addEventListener("hive:snapshot-error", () => blockProductTruth("source snapshot unavailable"));
  void Promise.all([
    acquireStrictJson({ url: "/hub-assets/product-truth.json", maximumBytes: PRODUCT_TRUTH_MAX_BYTES, label: "product truth manifest" }),
    acquireStrictJson({
      url: "/hub-assets/product-truth-ledger.public.v2.json",
      maximumBytes: 32 * 1024,
      expectedBytes: 7181,
      expectedSha256: "e623836c21581035e9dd4d5fb2e11abfb3a5e18baf30ef16ce527fdfc74c7f24",
      sha256: sha256Bytes,
      label: "product truth evidence ledger",
    }),
    acquireStrictJson({
      url: "/hub-assets/product-truth-semantic-baseline.v1.json",
      maximumBytes: 4 * 1024,
      expectedBytes: 621,
      expectedSha256: "31a060917fc5aac5dc964cd2db0465eb44881a4a2eb9b36fc3459f61bbc58155",
      sha256: sha256Bytes,
      label: "reviewed semantic baseline",
    }),
  ])
    .then(([manifest, ledger, semanticBaseline]) => {
      productTruthManifest = manifest;
      productTruthLedger = ledger;
      productTruthSemanticBaseline = semanticBaseline;
      if (window.hivePublicSnapshot) return renderProductTruthManifest(manifest, window.hivePublicSnapshot, ledger, semanticBaseline);
      setText("[data-product-truth-status]", "Manifest loaded · waiting for source snapshot");
      return null;
    })
    .catch((error) => {
      blockProductTruth(error instanceof Error ? error.message : "manifest unavailable");
      console.warn("Product truth projection could not be loaded:", error);
    });
}

async function loadSourceSnapshot() {
  const requestGeneration = ++snapshotRequestGeneration;
  try {
    const snapshot = await acquireStrictJson({
      url: "/hub-assets/hub-facts.json",
      maximumBytes: HUB_FACTS_MAX_BYTES,
      label: "hub-facts source snapshot",
      validate: async (value) => {
        if (!await validSnapshot(value)) throw new Error("snapshot contract rejected");
        return value;
      },
    });
    if (!snapshotResponseCanCommit({
      requestGeneration,
      currentGeneration: snapshotRequestGeneration,
      aborted: false,
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
    setText("[data-source-stamp]", `Published snapshot captured ${captureLabel} · source binding @ ${facts.sourceCommit.slice(0, 8)} · evidence baseline @ ${EVIDENCE_BASELINE_COMMIT.slice(0, 9)}`);
    setText("[data-graph-hash]", facts.graphHash.slice(0, 8));
    const previous = window.hivePublicSnapshot;
    window.hivePublicSnapshot = snapshot;
    document.body.classList.remove("snapshot-unavailable");
    const presentation = sourceSnapshotPresentation(
      snapshot.capturedAt,
      snapshot.refresh,
    );
    const ageTruth = presentation.freshness === "historical"
      ? `The represented source capture is more than one hour old (${snapshot.capturedAt}).`
      : presentation.freshness === "aged"
        ? `The represented source capture is more than fifteen minutes old (${snapshot.capturedAt}).`
        : `The represented source capture is recent (${snapshot.capturedAt}).`;
    const bridgeTruth = presentation.configuration === "configured_at_capture"
      ? "Automatic publication was configured at capture."
      : "Automatic publication was not configured at capture.";
    const latestRefreshTruth = presentation.latestConfiguration === "configured_at_latest_observation"
      ? "The latest refresh observation records configuration, while execution and current operation remain unverified."
      : "The public/private bridge is intentionally disabled for this presentation release; current operation remains UNKNOWN and execution is not attested.";
    const freshnessHeld = presentation.freshnessDisposition === "FRESHNESS_HOLD";
    const sourceBadgeLabel = freshnessHeld
      ? `HISTORICAL · ${facts.sourceCommit.slice(0, 8).toUpperCase()}`
      : `SOURCE SNAPSHOT · ${facts.sourceCommit.slice(0, 8).toUpperCase()}`;
    setText("[data-galaxy-snapshot-state]", freshnessHeld ? "historical" : "recent");
    setSourceBadge(
      presentation.badgeState,
      sourceBadgeLabel,
      `${ageTruth} Snapshot contract PASS: the declared public source identity is internally bound. Independent private-source readback was not performed. Freshness ${freshnessHeld ? "HOLD" : "recent"}. ${bridgeTruth} ${latestRefreshTruth} Capture age is provenance, not runtime or publisher health.`,
    );
    if (snapshotIdentityChanged(previous, snapshot)) {
      window.dispatchEvent(new CustomEvent("hive:snapshot", { detail: { snapshot, previous } }));
    }
    return true;
  } catch (error) {
    if (requestGeneration !== snapshotRequestGeneration) return false;
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
  }
}

function scheduleSnapshotRefresh() {
  window.clearTimeout(snapshotRefreshTimer);
  snapshotRefreshTimer = 0;
  if (document.hidden) return;
  snapshotRefreshTimer = window.setTimeout(() => {
    scheduleSnapshotRefresh();
    void loadSourceSnapshot();
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
      return;
    }
    scheduleSnapshotRefresh();
    void loadSourceSnapshot();
  });
  scheduleSnapshotRefresh();
}

function renderHivePoaQuarantine() {
  if (!$("[data-release-console]")) return;
  const consoleNode = $("[data-release-console]");
  if (consoleNode) consoleNode.dataset.state = "held";
  setText("[data-release-status]", "Historical HivePoA metadata quarantined · delivery/network held");
  setText("[data-release-sequence]", "Historical metadata only");
  setText("[data-release-version]", "No current package or network authorization");
  setText("[data-release-artifact]", "Preserved provenance is quarantined. This page executes no HivePoA verifier and fetches no HivePoA release surface.");
  setText("[data-poa-mini-state]", "Historical metadata quarantined · all actions held");
  setText("[data-poa-credit-mini]", "no live award claim");
  setText("[data-policy-credit]", "—");
  setText("[data-policy-quorum]", "—");
  setText("[data-release-path-workers]", "Coordinator + enrollment held");
  setText("[data-release-path-credit]", "No execution or award is authorized by preserved metadata.");
  const firstStep = $("[data-release-path-index]");
  if (firstStep) {
    firstStep.dataset.state = "blocked";
    setText("small", "Preserved metadata is quarantined; no verifier module is loaded.", firstStep);
  }
  const indexEvidence = $("[data-release-evidence-index]");
  if (indexEvidence) {
    indexEvidence.dataset.state = "blocked";
    setText("strong", "Quarantined", indexEvidence);
  }
  const download = $("[data-release-download]");
  if (download) {
    download.classList.add("is-disabled");
    download.setAttribute("aria-disabled", "true");
    download.setAttribute("tabindex", "-1");
    download.removeAttribute("href");
  }
  $$('[data-copy-release]').forEach((button) => {
    button.disabled = true;
    button.dataset.copyValue = "";
  });
}

function holdIdeReleaseActions() {
  for (const selector of ["[data-ide-download]", "[data-ide-start-here]", "[data-ide-manifest]", "[data-ide-release-page]"]) {
    for (const link of $$(selector)) {
      link.classList.add("is-disabled");
      link.setAttribute("aria-disabled", "true");
      link.setAttribute("tabindex", "-1");
      link.removeAttribute("href");
    }
  }
}

function blockIdeRelease(reason = "release evidence unavailable") {
  const root = $("[data-ide-release]");
  if (!root) return;
  root.dataset.state = "blocked";
  setText("[data-ide-status]", "Evidence unavailable · every action held");
  setText("[data-ide-version]", "Hive IDE tester.5 · evidence not admitted");
  setText("[data-ide-channel]", "HOLD");
  setText("[data-ide-size]", "Unavailable");
  setText("[data-ide-source]", "Unavailable");
  setText("[data-ide-evidence-until]", "Unavailable");
  setText("[data-ide-package-state]", "UNKNOWN");
  setText("[data-ide-runtime-state]", "UNKNOWN");
  setText("[data-ide-sha]", "Unavailable until both frozen v3 evidence files validate");
  const detail = $("[data-ide-status-detail]");
  if (detail) {
    detail.textContent = "The browser could not validate the bounded v3 expired-evidence feed and truth manifest. No download, install, or testing action is authorized.";
    detail.title = reason;
  }
  setText("[data-ide-warning]", "Fail-closed: evidence could not be validated. Do not infer remote byte identity, installation readiness, runtime behavior, or product-live state.");
  holdIdeReleaseActions();
  const copy = $("[data-copy-ide-sha]");
  if (copy) {
    copy.disabled = true;
    copy.dataset.copyValue = "";
  }
}

function renderIdeRelease(latest, truthResult) {
  const root = $("[data-ide-release]");
  if (!root) return;
  root.dataset.state = "held";
  const historical = latest.historicalEvidence;
  const historicalOuter = historical.outerExecutable;
  setText("[data-ide-status]", "EVIDENCE EXPIRED · integration WAIT · every action held");
  setText("[data-ide-status-detail]", "Hive IDE integration is not available from this public candidate. Status: WAIT. A tester.5 outer-byte observation exists only as expired historical evidence; current package identity, retrievability, installation, runtime, and product state are UNKNOWN or HOLD.");
  setText("[data-ide-version]", `Hive IDE ${latest.version} · tester.5 historical evidence`);
  setText("[data-ide-channel]", "WAIT · no current package claim");
  setText("[data-ide-size]", `${humanInstallerBytes(historicalOuter.sizeBytes)} · historical`);
  setText("[data-ide-source]", historical.release.sourceCommit.slice(0, 12));
  setText("[data-ide-evidence-until]", truthResult.validUntilUtc);
  setText("[data-ide-package-state]", latest.effectiveDisposition.currentPackageStatus);
  setText("[data-ide-runtime-state]", latest.effectiveDisposition.currentRuntimeStatus);
  setText("[data-ide-sha]", `${historicalOuter.sha256} · historical evidence only`);
  setText("[data-ide-warning]", "At the historical observation time, the remote executable was retrieved over HTTPS, its outer bytes matched the recorded size and SHA-256, and Authenticode read NotSigned. The private receipt path and declared SHA-256 are preserved separately; its Git object and landing identities are unavailable in this site custody. The observation expired. Current retrievability and installer identity are UNKNOWN; no download, install, or test action is authorized.");
  setText("[data-ide-download]", "Download held · evidence expired");
  setText("[data-ide-start-here]", "START HERE held");
  setText("[data-ide-manifest]", "Expired evidence contract validated · action held");
  setText("[data-ide-release-page]", "Release action held");
  holdIdeReleaseActions();
  const copy = $("[data-copy-ide-sha]");
  if (copy) {
    copy.disabled = false;
    copy.dataset.copyValue = historicalOuter.sha256;
  }
}

async function loadIdeRelease() {
  if (!$("[data-ide-release]")) return;
  try {
    const latest = await acquireStrictJson({
      url: "/downloads/hive-ide/latest.json",
      maximumBytes: IDE_RELEASE_LATEST_MAX_BYTES,
      expectedBytes: IDE_RELEASE_LATEST_BYTES,
      expectedSha256: IDE_RELEASE_LATEST_SHA256,
      sha256: sha256Bytes,
      label: "Hive IDE latest evidence feed",
      validate: validateIdeReleaseLatest,
    });
    const truthPath = new URL(latest.truthManifestUrl).pathname;
    const truthResult = await acquireStrictJson({
      url: truthPath,
      maximumBytes: IDE_RELEASE_TRUTH_MAX_BYTES,
      expectedBytes: IDE_RELEASE_TRUTH_BYTES,
      expectedSha256: IDE_RELEASE_TRUTH_MANIFEST_SHA256,
      sha256: sha256Bytes,
      label: "Hive IDE expired evidence truth manifest",
      validate: (value) => validateIdeReleaseTruthManifest(value, latest),
    });
    renderIdeRelease(latest, truthResult);
  } catch (error) {
    blockIdeRelease(error instanceof Error ? error.message : "release feed unavailable");
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

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
// Deterministic 0..1 hash used by every "alive" oscillator below — the
// renderer contract bans Math.random so all life is seeded and replayable.
const seededFract = (n) => {
  const value = Math.sin(n) * 43758.5453;
  return value - Math.floor(value);
};

const TITLE_MINOR_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of", "on", "or", "per", "the", "to", "via", "with"]);
const titleCase = (value) => String(value || "").toLowerCase().replace(/\b[a-z0-9']+/g, (word, offset) =>
  (offset > 0 && TITLE_MINOR_WORDS.has(word)) ? word : word.charAt(0).toUpperCase() + word.slice(1));
const formatGalaxyDivisionChoice = (division) => `${division.code} · ${titleCase(division.name)}`;
const formatGalaxyDivisionSelectChoice = (division) => `Division ${division.code}`;

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
    this.rotationX = -0.25;
    this.rotationY = -0.64;
    this.targetRotationX = this.rotationX;
    this.targetRotationY = this.rotationY;
    this.zoom = 1.24;
    this.targetZoom = this.zoom;
    this.panX = 0;
    this.panY = 0;
    this.targetPanX = 0;
    this.targetPanY = 0;
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
    this.pointer = {
      x: 0, y: 0, startX: 0, startY: 0,
      rotationX: 0, rotationY: 0, panX: 0, panY: 0,
      orbitAllowed: false, mode: "orbit",
    };
    this.activePointers = new Map();
    this.gestureMetrics = null;
    this.galaxy = null;
    this.sourceCommit = "";
    this.graphHash = "";
    this.contextLost = false;
    this.fullAtlas = false;
    this.fullAtlasReturnFocus = null;
    this.fullAtlasScrollY = 0;
    this.modalIsolationState = [];
    this.labelSafeFrame = null;
    this.labelOverlayObstacles = [];
    this.directorTimer = 0;
    this.directorStep = -1;
    this.directorRunning = false;
    this.directorReturn = null;
    this.validatedSourcePulseUntil = 0;
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
      if (!GALAXY_PUBLIC_PALETTES[event.detail?.name]) return;
      this.lens = event.detail.name;
      this.syncContextHandoff();
      this.draw(performance.now());
    });
    window.addEventListener("hive:command-stage", (event) => this.presentCommandStage(event.detail?.index));
    window.addEventListener("hive:manual-galaxy", () => this.cancelDirector(false));
    this.setEngaged(false);
    this.wireFullAtlas();
    this.wireDivisionNavigator();
    this.wireAtlasToolbarRoving();
    if (!this.baseRenderAvailable) {
      this.applyRenderAvailability(this.forcedColors.matches);
      return;
    }

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.stage || canvas);
    GALAXY_LABEL_OVERLAYS.forEach(({ selector }) => {
      $$(selector, this.stage || document).forEach((node) => this.resizeObserver.observe(node));
    });
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
      if (this.paused) this.cancelDirector(false);
      this.syncDirectorMotionPolicy();
      this.syncLoop();
    });
    const onForcedColorsChange = (event) => this.applyRenderAvailability(Boolean(event.matches));
    if (typeof this.forcedColors.addEventListener === "function") {
      this.forcedColors.addEventListener("change", onForcedColorsChange);
    } else if (typeof this.forcedColors.addListener === "function") {
      this.forcedColors.addListener(onForcedColorsChange);
    }
    this.canvas.addEventListener("contextlost", (event) => {
      event.preventDefault?.();
      this.contextLost = true;
      this.applyRenderAvailability(this.forcedColors.matches);
    });
    this.canvas.addEventListener("contextrestored", () => {
      try {
        this.context = this.canvas.getContext("2d", { alpha: true, desynchronized: true });
      } catch {
        this.context = null;
      }
      this.contextLost = false;
      this.applyRenderAvailability(this.forcedColors.matches);
    });
    window.addEventListener("pagehide", () => {
      this.cancelDirector(false);
      if (this.fullAtlas) this.closeFullAtlas(false);
    });
    this.applyRenderAvailability(this.forcedColors.matches);
  }

  setSnapshot(snapshot) {
    if (!Array.isArray(snapshot?.galaxy?.divisions)) return;
    const priorSourceCommit = this.sourceCommit;
    const previousDivisionCode = this.divisions[this.activeDivision]?.code;
    const previousFamilyCode = this.activeFamily >= 0
      ? this.divisions[this.familyGeometry[this.activeFamily]?.divisionIndex]?.families?.[this.familyGeometry[this.activeFamily]?.familyIndex]?.code
      : null;
    const previousNeuronId = this.activeNeuron >= 0 ? this.neurons[this.activeNeuron]?.id : null;
    this.galaxy = snapshot.galaxy;
    this.divisions = snapshot.galaxy.divisions;
    this.sourceCommit = snapshot.hiveAi?.sourceCommit || "";
    this.graphHash = snapshot.hiveAi?.graphHash || "";
    this.buildGeometry();
    if (priorSourceCommit && priorSourceCommit !== this.sourceCommit) {
      this.validatedSourcePulseUntil = performance.now() + 1800;
    }

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
    this.syncContextHandoff();
    this.presentCommandStage(this.commandStage);
    this.draw(performance.now());
    this.syncLoop();
  }

  buildGeometry() {
    const geometry = buildGalaxyGeometry(this.galaxy);
    this.divisionGeometry = geometry.divisionGeometry;
    this.familyGeometry = geometry.familyGeometry;
    this.neurons = geometry.neurons;
    this.neuronIndexById = geometry.neuronIndexById;
  }

  takeManualControl() {
    this.cancelDirector(false);
    window.dispatchEvent(new CustomEvent("hive:manual-galaxy"));
  }

  syncContextHandoff() {
    let level = "division";
    let node = `division:${this.divisions[this.activeDivision]?.code || "A"}`;
    if (this.activeFamily >= 0) {
      const geometry = this.familyGeometry[this.activeFamily];
      const code = this.divisions[geometry?.divisionIndex]?.families?.[geometry?.familyIndex]?.code;
      if (code) {
        level = "family";
        node = `family:${code}`;
      }
    }
    if (this.activeNeuron >= 0 && this.neurons[this.activeNeuron]?.id) {
      level = "neuron";
      node = `neuron:${this.neurons[this.activeNeuron].id}`;
    }
    if (!/^[a-f0-9]{40}$/.test(this.sourceCommit) || !/^[a-f0-9]{64}$/.test(this.graphHash)) {
      setText("[data-galaxy-context-summary]", "Context unavailable · source not yet bound");
      setText("[data-galaxy-context-copy]", "The fixed Local Body doorway is user-initiated and unprobed. Atlas context stays unbound until this browser validates the source snapshot; nothing is sent automatically.");
      $$('[data-local-context-link][data-local-presentation="1"]').forEach((link) => {
        link.dataset.contextBound = "false";
        delete link.dataset.futureContext;
      });
      return;
    }
    const summaryNode = node.replace(/^(division|family|neuron):/, "");
    const localLens = this.lens === "artifact" ? "build" : this.lens;
    const localLevel = level === "division" ? "district" : level;
    setText("[data-galaxy-context-summary]", `${localLevel[0].toUpperCase()}${localLevel.slice(1)} ${summaryNode} · ${localLens} lens`);
    setText("[data-galaxy-context-copy]", "The selected Atlas context is source-bound and retained as a non-executing preview. The fixed Local Body doorway remains user-initiated; this page neither probes :5002 nor sends the selected context.");
    $$('[data-local-context-link][data-local-presentation="1"]').forEach((link) => {
      const presentation = "1";
      const context = buildPublicHandoffContext({
        presentation,
        sourceCommit: this.sourceCommit,
        graphHash: this.graphHash,
        lens: this.lens,
        node,
        level,
      });
      if (!context) return;
      link.dataset.futureContext = JSON.stringify(context);
      link.dataset.contextBound = "true";
    });
  }

  syncAtlasToolbarTabStops(preferred = null) {
    const buttons = $$(".galaxy-atlas-toolbar button").filter((button) => !button.disabled);
    if (buttons.length === 0) {
      $$(".galaxy-atlas-toolbar button").forEach((button) => { button.tabIndex = -1; });
      return;
    }
    const active = preferred && buttons.includes(preferred)
      ? preferred
      : buttons.find((button) => button.tabIndex === 0) || buttons[0];
    buttons.forEach((button) => { button.tabIndex = button === active ? 0 : -1; });
  }

  wireAtlasToolbarRoving() {
    const root = $(".galaxy-atlas-toolbar");
    if (!root) return;
    const allButtons = $$('button', root);
    allButtons.forEach((button) => {
      button.tabIndex = -1;
      button.addEventListener("focus", () => this.syncAtlasToolbarTabStops(button));
      button.addEventListener("keydown", (event) => {
        if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
        const enabled = allButtons.filter((candidate) => !candidate.disabled);
        if (enabled.length === 0) return;
        event.preventDefault();
        const current = Math.max(0, enabled.indexOf(button));
        const next = event.key === "Home"
          ? 0
          : event.key === "End"
            ? enabled.length - 1
            : (current + (event.key === "ArrowRight" ? 1 : -1) + enabled.length) % enabled.length;
        this.syncAtlasToolbarTabStops(enabled[next]);
        enabled[next].focus();
      });
    });
    this.syncAtlasToolbarTabStops();
  }

  wireFullAtlas() {
    const openers = $$('[data-galaxy-fullscreen]');
    const anchorPrimes = $$('[data-hero-atlas-cta]');
    const primeAtlas = () => this.canvas.closest("#galaxy")?.classList.add("is-render-primed");
    $$('[data-galaxy-fullscreen]').forEach((button) => {
      button.disabled = false;
      button.setAttribute("aria-disabled", "false");
    });
    anchorPrimes.forEach((anchor) => {
      anchor.addEventListener("pointerenter", primeAtlas, { once: true, passive: true });
      anchor.addEventListener("pointerdown", primeAtlas, { once: true, passive: true });
      anchor.addEventListener("focus", primeAtlas, { once: true, passive: true });
    });
    openers.forEach((opener) => {
      opener.addEventListener("pointerenter", primeAtlas, { once: true, passive: true });
      opener.addEventListener("pointerdown", primeAtlas, { once: true, passive: true });
      opener.addEventListener("focus", primeAtlas, { once: true, passive: true });
      opener.addEventListener("click", (event) => {
        event.preventDefault();
        primeAtlas();
        this.openFullAtlas(opener);
      });
    });
    $("[data-galaxy-exit]")?.addEventListener("click", () => this.closeFullAtlas(true));
    document.addEventListener("keydown", (event) => {
      if (!this.fullAtlas || event.defaultPrevented) return;
      if (event.key === "Escape" && this.engaged) return;
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeFullAtlas(true);
        return;
      }
      if (event.key !== "Tab") return;
      const root = $("[data-galaxy-dialog]");
      const focusable = root ? $$('button:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])', root)
        .filter((node) => !node.hasAttribute("hidden") && node.getClientRects().length > 0) : [];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!root?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    });
  }

  focusInsideFullAtlas() {
    if (!this.fullAtlas) return false;
    const target = this.directorRunning
      ? $("[data-galaxy-director]")
      : this.renderAvailable
        ? this.canvas
        : $("[data-galaxy-exit]");
    target?.focus({ preventScroll: true });
    return Boolean(target);
  }

  syncLabelSafeFrame() {
    const stageRect = (this.stage || this.canvas).getBoundingClientRect();
    const width = Math.max(1, this.width || stageRect.width);
    const height = Math.max(1, this.height || stageRect.height);
    const overlayBoxes = [];
    let topBoundary = 5;
    let bottomBoundary = height - 5;
    let hasTopChrome = false;
    let hasBottomChrome = false;

    GALAXY_LABEL_OVERLAYS.forEach(({ selector, edge }) => {
      $$(selector, this.stage || document).forEach((node) => {
        if (node.hidden || node.getClientRects().length === 0) return;
        const style = window.getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return;
        const rect = node.getBoundingClientRect();
        const left = clamp(rect.left - stageRect.left, 0, width);
        const top = clamp(rect.top - stageRect.top, 0, height);
        const right = clamp(rect.right - stageRect.left, 0, width);
        const bottom = clamp(rect.bottom - stageRect.top, 0, height);
        if (right <= left || bottom <= top) return;
        overlayBoxes.push({ x: left, y: top, width: right - left, height: bottom - top });
        if (edge === "top") {
          hasTopChrome = true;
          topBoundary = Math.max(topBoundary, Math.min(height, bottom + GALAXY_OVERLAY_GAP));
        } else if (edge === "bottom") {
          hasBottomChrome = true;
          bottomBoundary = Math.min(bottomBoundary, Math.max(0, top - GALAXY_OVERLAY_GAP));
        }
      });
    });

    const safeTop = hasTopChrome ? Math.min(height - 5, topBoundary + GALAXY_OVERLAY_GAP) : 5;
    const safeBottom = hasBottomChrome ? Math.max(5, bottomBoundary - GALAXY_OVERLAY_GAP) : height - 5;
    this.labelSafeFrame = {
      left: 5,
      top: safeTop,
      right: width - 5,
      bottom: safeBottom,
    };
    if (hasTopChrome) overlayBoxes.push({ x: 0, y: 0, width, height: topBoundary });
    if (hasBottomChrome) overlayBoxes.push({ x: 0, y: bottomBoundary, width, height: height - bottomBoundary });
    this.labelOverlayObstacles = overlayBoxes;
  }

  placeSafeCanvasLabel(width, height, desiredX, desiredY, occupied, priority = false) {
    const frame = this.labelSafeFrame || { left: 5, top: 5, right: this.width - 5, bottom: this.height - 5 };
    if (width > frame.right - frame.left || height > frame.bottom - frame.top) return null;
    const safeX = clamp(desiredX, frame.left, frame.right - width);
    const safeY = clamp(desiredY, frame.top, frame.bottom - height);
    return placeCanvasLabel(width, height, safeX, safeY, this.width, this.height, occupied, priority);
  }

  glideStickyBox(cacheKey, point, width, height, occupied) {
    // Object permanence for plates: once placed, a plate never re-enters
    // the placement ladder. It rides its anchor, yields at most 2px per
    // frame under a TRUE overlap, and glides home at 1px per frame once
    // the overlap clears. Teleporting is structurally impossible here.
    const cached = this.labelOrder?.plateBoxes?.[cacheKey];
    if (!cached) return null;
    if (Math.hypot(point.x - cached.anchorX, point.y - cached.anchorY) >= 60) return null;
    let x = cached.x + (point.x - cached.anchorX);
    let y = cached.y + (point.y - cached.anchorY);
    const home = { x: point.x + cached.homeOffsetX, y: point.y + cached.homeOffsetY };
    const box = { x, y, width, height };
    let pushX = 0;
    let pushY = 0;
    occupied.forEach((other) => {
      const overlapX = Math.min(box.x + width, other.x + other.width) - Math.max(box.x, other.x);
      const overlapY = Math.min(box.y + height, other.y + other.height) - Math.max(box.y, other.y);
      if (overlapX <= 0 || overlapY <= 0) return;
      if (overlapX < overlapY) {
        pushX += (box.x + width / 2 < other.x + other.width / 2 ? -1 : 1) * overlapX;
      } else {
        pushY += (box.y + height / 2 < other.y + other.height / 2 ? -1 : 1) * overlapY;
      }
    });
    if (pushX !== 0 || pushY !== 0) {
      x += clamp(pushX, -2, 2);
      y += clamp(pushY, -2, 2);
    } else {
      x += clamp(home.x - x, -1, 1);
      y += clamp(home.y - y, -1, 1);
    }
    const frame = this.labelSafeFrame || { left: 5, top: 5, right: this.width - 5, bottom: this.height - 5 };
    x = clamp(x, frame.left, frame.right - width);
    y = clamp(y, frame.top, frame.bottom - height);
    const placed = { x, y, width, height };
    occupied.push(placed);
    cached.x = x;
    cached.y = y;
    cached.anchorX = point.x;
    cached.anchorY = point.y;
    return placed;
  }

  setModalIsolation(root, active) {
    if (!active) {
      this.modalIsolationState.forEach(({ node, inert, ariaHidden }) => {
        node.inert = inert;
        if (ariaHidden === null) node.removeAttribute("aria-hidden");
        else node.setAttribute("aria-hidden", ariaHidden);
      });
      this.modalIsolationState = [];
      return;
    }
    this.setModalIsolation(root, false);
    if (!root) return;
    let current = root;
    while (current?.parentElement) {
      const parent = current.parentElement;
      Array.from(parent.children).forEach((sibling) => {
        if (sibling === current) return;
        this.modalIsolationState.push({
          node: sibling,
          inert: sibling.inert,
          ariaHidden: sibling.getAttribute("aria-hidden"),
        });
        sibling.inert = true;
        sibling.setAttribute("aria-hidden", "true");
      });
      current = parent;
      if (current === document.body) break;
    }
  }

  openFullAtlas(trigger = null) {
    if (this.fullAtlas) return;
    this.fullAtlas = true;
    this.fullAtlasReturnFocus = trigger || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    this.fullAtlasScrollY = window.scrollY;
    const root = $("[data-galaxy-dialog]");
    root?.classList.add("is-full-atlas");
    root?.setAttribute("role", "dialog");
    root?.setAttribute("aria-modal", "true");
    root?.setAttribute("aria-label", "Full viewport public Constellation Atlas");
    document.body.classList.add("galaxy-fullscreen-open");
    this.focusInsideFullAtlas();
    this.setEngaged(true, true);
    this.setModalIsolation(root, true);
    window.requestAnimationFrame(() => {
      this.resize();
    });
    showToast("Atlas open. Escape releases controls, then exits.");
  }

  closeFullAtlas(restoreFocus = true) {
    if (!this.fullAtlas) return;
    this.cancelDirector(false);
    this.setEngaged(false);
    clearToast();
    this.fullAtlas = false;
    const root = $("[data-galaxy-dialog]");
    root?.classList.remove("is-full-atlas");
    root?.removeAttribute("role");
    root?.removeAttribute("aria-modal");
    root?.removeAttribute("aria-label");
    this.setModalIsolation(root, false);
    document.body.classList.remove("galaxy-fullscreen-open");
    window.scrollTo({ top: this.fullAtlasScrollY, behavior: "auto" });
    window.requestAnimationFrame(() => this.resize());
    if (restoreFocus && this.fullAtlasReturnFocus?.isConnected) this.fullAtlasReturnFocus.focus({ preventScroll: true });
  }

  applyDirectorScene(index) {
    const scenes = [
      { lens: "mastery", division: 0, zoom: 1.08, title: "Evidence enters", copy: "A source-bound input reaches the public body. This demonstration dispatches nothing." },
      { lens: "evidence", division: 3, zoom: 1.32, title: "Hive-AI reasons", copy: "Purpose, dependencies, and proof routes become visible without publishing private evidence." },
      { lens: "artifact", neuron: "N121", zoom: 2.2, title: "A candidate resolves", copy: "The camera keeps its district and family context while one stable neuron identity comes forward." },
      { lens: "runtime", neuron: "N401", zoom: 2.35, title: "HivePoA verifies", copy: "The proof plane is explained here; real challenges and receipts stay on their local guarded surfaces." },
      { lens: "evidence", neuron: "N561", zoom: 2.25, title: "The proof gate holds", copy: "No visual packet grants authority. A real change still requires accepted, mission-bound evidence." },
      { lens: "product", division: 15, zoom: 1.24, title: "Approved change lands", copy: "Only explicit authority, a validated landing, and a newly published source snapshot may produce the separate green absorption pulse." },
    ];
    const scene = scenes[index];
    if (!scene) return;
    this.directorStep = index;
    selectLens(scene.lens);
    if (scene.neuron && this.neuronIndexById?.has(scene.neuron)) this.focusNeuron(this.neuronIndexById.get(scene.neuron), false);
    else this.focusDivision(scene.division, false);
    this.targetZoom = scene.zoom;
    if (this.stage) this.stage.dataset.directorStep = String(index);
    setText("[data-galaxy-director-step-count]", `${String(index + 1).padStart(2, "0")} / 06 ·`);
    setText("[data-galaxy-director-step]", scene.title);
    setText("[data-galaxy-director-copy]", scene.copy);
    this.syncLabelSafeFrame();
    this.syncLoop();
  }

  startDirector() {
    if (this.paused || reduceMotion.matches || document.body.classList.contains("motion-paused")) {
      showToast("Director automation is off while reduced motion is active. Manual atlas controls remain available.");
      return;
    }
    this.takeManualControl();
    if (!this.fullAtlas) this.openFullAtlas($("[data-galaxy-director]"));
    this.directorReturn = exactGalaxyDirectorState({
      lens: this.lens,
      activeDivision: this.activeDivision,
      activeFamily: this.activeFamily,
      activeNeuron: this.activeNeuron,
      rotationX: this.rotationX,
      rotationY: this.rotationY,
      zoom: this.zoom,
      panX: this.panX,
      panY: this.panY,
      targetRotationX: this.targetRotationX,
      targetRotationY: this.targetRotationY,
      targetZoom: this.targetZoom,
      targetPanX: this.targetPanX,
      targetPanY: this.targetPanY,
    });
    this.directorRunning = true;
    $$('[data-galaxy-director]').forEach((button) => {
      button.setAttribute("aria-pressed", "true");
      button.textContent = "Stop director";
    });
    const proof = $("[data-galaxy-demo-proof]");
    if (proof) proof.hidden = false;
    const caption = $("[data-galaxy-director-caption]");
    if (caption) caption.hidden = false;
    this.syncLabelSafeFrame();
    this.applyDirectorScene(0);
    const advance = () => {
      if (!this.directorRunning) return;
      if (this.directorStep >= 5) {
        this.directorTimer = window.setTimeout(() => this.cancelDirector(true), 4000);
        return;
      }
      this.directorTimer = window.setTimeout(() => {
        if (!this.directorRunning) return;
        this.applyDirectorScene(this.directorStep + 1);
        advance();
      }, 4000);
    };
    advance();
  }

  cancelDirector(completed = false) {
    window.clearTimeout(this.directorTimer);
    this.directorTimer = 0;
    if (!this.directorRunning && this.directorStep < 0) {
      this.syncDirectorMotionPolicy();
      return;
    }
    this.directorRunning = false;
    this.directorStep = -1;
    if (this.stage) delete this.stage.dataset.directorStep;
    $$('[data-galaxy-director]').forEach((button) => {
      button.setAttribute("aria-pressed", "false");
      button.textContent = "Run 24s director";
    });
    this.syncDirectorMotionPolicy();
    const proof = $("[data-galaxy-demo-proof]");
    if (proof) proof.hidden = true;
    const caption = $("[data-galaxy-director-caption]");
    if (caption) caption.hidden = true;
    this.syncLabelSafeFrame();
    const returnContext = this.directorReturn;
    this.directorReturn = null;
    if (returnContext) {
      selectLens(returnContext.lens);
      this.activeDivision = returnContext.activeDivision;
      this.activeFamily = returnContext.activeFamily;
      this.activeNeuron = returnContext.activeNeuron;
      this.hoverDivision = -1;
      this.hoverFamily = -1;
      this.hoverNeuron = -1;
      this.rotationX = returnContext.rotationX;
      this.rotationY = returnContext.rotationY;
      this.zoom = returnContext.zoom;
      this.panX = returnContext.panX;
      this.panY = returnContext.panY;
      this.targetRotationX = returnContext.targetRotationX;
      this.targetRotationY = returnContext.targetRotationY;
      this.targetZoom = returnContext.targetZoom;
      this.targetPanX = returnContext.targetPanX;
      this.targetPanY = returnContext.targetPanY;
      this.showDivision(this.activeDivision, true, false);
      if (this.activeNeuron >= 0) this.showNeuronFocus(this.activeNeuron);
      else if (this.activeFamily >= 0) {
        this.renderNeuronRoster(this.activeFamily);
        this.showFamilyFocus(this.activeFamily);
      }
      this.syncContextHandoff();
      this.syncLoop();
      showToast(completed
        ? "Director complete. No work was dispatched; your prior lens, selection, and camera are restored."
        : "Director cancelled. Your prior lens, selection, and camera are restored.");
    }
  }

  wireDivisionNavigator() {
    const select = $("[data-galaxy-division-nav-select]");
    if (!select) return;
    select.addEventListener("change", () => {
      const index = this.divisions.findIndex((division) => division.code === select.value);
      if (index >= 0) this.focusDivision(index);
    });
  }

  buildDivisionNavigator() {
    const select = $("[data-galaxy-division-nav-select]");
    if (!select) return;
    const exactCatalog = this.divisions.length === 16
      && this.divisions.every((division, index) => division.code === String.fromCharCode(65 + index));
    const options = (exactCatalog ? this.divisions : []).map((division) => {
      const option = document.createElement("option");
      option.value = division.code;
      option.textContent = formatGalaxyDivisionSelectChoice(division);
      option.title = formatGalaxyDivisionChoice(division);
      return option;
    });
    select.replaceChildren(...options);
    select.disabled = !exactCatalog;
    select.setAttribute("aria-disabled", String(!exactCatalog));
    if (exactCatalog) this.syncDivisionNavigator(this.activeDivision);
  }

  syncDivisionNavigator(index) {
    const division = this.divisions[index];
    if (!division) return;
    const label = formatGalaxyDivisionChoice(division);
    setText("[data-galaxy-division-nav-current]", label);
    const select = $("[data-galaxy-division-nav-select]");
    if (!select) return;
    select.setAttribute("aria-label", `Jump to division. Current: ${label}`);
    select.value = division.code;
    Array.from(select.options).forEach((option) => {
      option.selected = option.value === division.code;
    });
  }

  buildDivisionIndex() {
    this.buildDivisionNavigator();
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
      button.addEventListener("focus", () => {
        this.showDivision(index, false, false);
        this.draw(performance.now());
      });
      button.addEventListener("blur", () => {
        this.showDivision(this.activeDivision, false, false);
        this.restoreActiveFocus();
        this.draw(performance.now());
      });
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
    setText("[data-galaxy-fit-selected]", `Dive into ${family.code}`);
    this.setFocusDetail(
      `Family ${family.code}`,
      titleCase(family.name),
      `${family.neuronIds.length} stable neuron identities. Select the family to open its roster, then choose a neuron.`,
    );
  }

  showNeuronFocus(neuronIndex) {
    const neuron = this.neurons[neuronIndex];
    if (!neuron) return;
    setText("[data-galaxy-fit-selected]", `Center ${neuron.id}`);
    const family = this.divisions[neuron.divisionIndex]?.families?.[neuron.familyIndex];
    this.setFocusDetail(
      "Neuron identity",
      neuron.id,
      `Member of ${family?.code || "its family"} · ${titleCase(family?.name)}. Public topology only. The local presentation handoff is unprobed; Operator status, evidence, and missions require a separately deployed and observed service.`,
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

  syncCanvasAccessibleName() {
    let selection = "No atlas selection is active.";
    if (this.activeNeuron >= 0 && this.neurons[this.activeNeuron]) {
      selection = `Neuron ${this.neurons[this.activeNeuron].id} is selected.`;
    } else if (this.activeFamily >= 0 && this.familyGeometry[this.activeFamily]) {
      const geometry = this.familyGeometry[this.activeFamily];
      const family = this.divisions[geometry.divisionIndex]?.families?.[geometry.familyIndex];
      if (family) selection = `Family ${family.code}, ${family.name}, is selected with ${family.neuronIds.length} neurons.`;
    } else if (this.activeDivision >= 0 && this.divisions[this.activeDivision]) {
      const division = this.divisions[this.activeDivision];
      selection = `Division ${division.code}, ${division.name}, is selected.`;
    }
    const controls = this.engaged
      ? "Controls are engaged: drag to orbit, Shift-drag to pan, use wheel or pinch to zoom, Home to reset, and Escape to release page scroll."
      : "Controls are released: activate Engage controls before orbiting or zooming.";
    this.canvas.setAttribute("aria-label", `Interactive public-safe atlas of 640 Hive-AI neurons. ${selection} ${controls} Public points show topology, not runtime liveness.`);
  }

  showDivision(index, updateButtons = true, updateAccessibleName = updateButtons) {
    const division = this.divisions[index];
    if (!division) return;
    setText("[data-galaxy-index]", `Division ${division.code} / ${this.divisions.length}`);
    setText("[data-galaxy-code]", `${division.code} · CONSTELLATION`);
    setText("[data-galaxy-title]", titleCase(division.name));
    const divisionDisplayName = `Division ${division.code} · ${titleCase(division.name)}`;
    const stageFocusSummary = this.width < 420
      ? `FOCUS · ${division.code} · ${division.neuronCount}N · ${division.families.length}F`
      : `Focus · ${division.code} · ${division.neuronCount} neurons · ${division.families.length} families`;
    setText("[data-galaxy-fit-selected]", `Dive into Division ${division.code}`);
    setText("[data-galaxy-division-name]", stageFocusSummary);
    const stageDivisionName = $("[data-galaxy-division-name]");
    stageDivisionName?.setAttribute("title", divisionDisplayName);
    stageDivisionName?.setAttribute("aria-label", `${divisionDisplayName}. ${division.neuronCount} neurons across ${division.families.length} families.`);
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
      this.syncDivisionNavigator(index);
    }
    if (updateAccessibleName) {
      this.syncCanvasAccessibleName();
      const live = `[Division ${division.code}] ${titleCase(division.name)}. ${division.neuronCount} neurons across ${division.families.length} families.`;
      setText("[data-galaxy-live]", live);
    }
    if (index === this.activeDivision && this.activeFamily >= 0) {
      this.renderNeuronRoster(this.activeFamily);
      this.restoreActiveFocus();
    } else {
      this.hideNeuronRoster();
      this.setFocusDetail("Division focus", `Division ${division.code}`, "Hover or select a family to resolve its ten-neuron roster.");
    }
  }

  focusPoint(center, minimumZoom, exactFit = false) {
    const camera = galaxyFocusCamera(center, {
      width: this.width,
      height: this.height,
      zoom: exactFit ? minimumZoom : Math.max(this.targetZoom, minimumZoom),
      targetYRatio: this.fullAtlas ? 0.46 : 0.48,
    });
    if (!camera) return;
    this.targetRotationY = camera.rotationY;
    this.targetRotationX = camera.rotationX;
    this.targetZoom = camera.zoom;
    this.targetPanX = camera.panX;
    this.targetPanY = camera.panY;
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
    if (scene.reset) this.resetCamera(false);
    else if (scene.neuron && this.neuronIndexById?.has(scene.neuron)) this.focusNeuron(this.neuronIndexById.get(scene.neuron), false);
    else if (Number.isSafeInteger(scene.division)) this.focusDivision(scene.division, false);
    this.draw(performance.now());
  }

  focusDivision(index, manual = true, exactFit = false) {
    const center = this.divisionGeometry[index];
    if (!center) return;
    if (manual) this.takeManualControl();
    this.activeDivision = index;
    this.hoverDivision = -1;
    this.activeFamily = -1;
    this.hoverFamily = -1;
    this.activeNeuron = -1;
    this.hoverNeuron = -1;
    this.focusPoint(center, 1.18, exactFit);
    this.showDivision(index);
    this.syncContextHandoff();
    this.syncLoop();
  }

  focusFamily(familyGeometryIndex, manual = true, exactFit = false) {
    const center = this.familyGeometry[familyGeometryIndex];
    if (!center) return;
    if (manual) this.takeManualControl();
    this.activeDivision = center.divisionIndex;
    this.activeFamily = familyGeometryIndex;
    this.activeNeuron = -1;
    this.hoverDivision = -1;
    this.hoverFamily = -1;
    this.hoverNeuron = -1;
    this.focusPoint(center, 1.58, exactFit);
    this.showDivision(this.activeDivision, true, false);
    this.showFamilyFocus(familyGeometryIndex);
    this.syncCanvasAccessibleName();
    this.syncContextHandoff();
    this.syncLoop();
  }

  focusNeuron(neuronIndex, manual = true, exactFit = false) {
    const neuron = this.neurons[neuronIndex];
    if (!neuron) return;
    if (manual) this.takeManualControl();
    this.activeDivision = neuron.divisionIndex;
    this.activeFamily = neuron.familyGeometryIndex;
    this.activeNeuron = neuronIndex;
    this.hoverDivision = -1;
    this.hoverFamily = -1;
    this.hoverNeuron = -1;
    this.focusPoint(neuron, 2.15, exactFit);
    this.showDivision(this.activeDivision, true, false);
    this.showNeuronFocus(neuronIndex);
    this.syncCanvasAccessibleName();
    this.syncContextHandoff();
    this.syncLoop();
  }

  setCameraControlsAvailable(available, reason = "") {
    $$('[data-galaxy-engage], [data-galaxy-zoom], [data-galaxy-reset], [data-galaxy-reset-modal], [data-galaxy-fit-selected]').forEach((button) => {
      button.disabled = !available;
      button.setAttribute("aria-disabled", String(!available));
      button.title = available ? "" : reason;
    });
    this.syncDirectorMotionPolicy(available, reason);
    this.syncAtlasToolbarTabStops();
    this.canvas.setAttribute("tabindex", available ? "0" : "-1");
    this.canvas.setAttribute("aria-disabled", String(!available));
  }

  syncDirectorMotionPolicy(renderAvailable = this.renderAvailable, unavailableReason = "") {
    const button = $("[data-galaxy-director]");
    const note = $("[data-galaxy-director-motion-note]");
    if (!button) return;
    const systemReduced = reduceMotion.matches;
    const pagePaused = this.paused || document.body.classList.contains("motion-paused");
    const motionBlocked = systemReduced || pagePaused;
    const motionReason = systemReduced
      ? "Director automation is unavailable because reduced motion is active. Use Reset view, Fit selected, or the manual atlas controls."
      : "Director automation is unavailable because page motion is paused. Resume motion, or use Reset view, Fit selected, or the manual atlas controls.";
    button.disabled = !renderAvailable;
    button.setAttribute("aria-disabled", String(!renderAvailable || motionBlocked));
    button.dataset.motionBlocked = String(motionBlocked);
    const blockedReason = motionBlocked
      ? motionReason
      : renderAvailable
        ? ""
        : unavailableReason || "Director automation is unavailable because the atlas renderer is unavailable.";
    button.title = blockedReason;
    if (!this.directorRunning) {
      button.textContent = "Guided tour";
      if (blockedReason) button.setAttribute("aria-label", `Guided tour. ${blockedReason}`);
      else button.removeAttribute("aria-label");
      button.setAttribute("aria-pressed", "false");
    }
    if (note) {
      note.hidden = !motionBlocked;
      note.textContent = motionReason;
      if (motionBlocked) button.setAttribute("aria-describedby", note.id || "galaxy-director-motion-note");
      else button.removeAttribute("aria-describedby");
    }
  }

  applyRenderAvailability(forcedColorsActive) {
    const state = galaxyRenderState({
      hasContext: Boolean(this.context),
      hasResizeObserver: "ResizeObserver" in window,
      forcedColorsActive,
      contextLost: this.contextLost,
    });
    this.renderAvailable = state.renderAvailable;
    const fallback = !state.renderAvailable;
    this.stage?.classList.toggle("galaxy-static-fallback", fallback);
    this.canvas.closest("#galaxy")?.classList.toggle("galaxy-fallback-active", fallback);
    const semanticFallback = $("[data-galaxy-semantic-fallback]");
    if (semanticFallback) semanticFallback.hidden = !fallback;
    if (fallback) {
      this.cancelDirector(false);
      this.setEngaged(false);
    }
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
        this.takeManualControl();
        const factor = button.dataset.galaxyZoom === "in" ? 1.22 : 1 / 1.22;
        this.zoomAt(factor, this.width / 2, this.height / 2);
        this.syncLoop();
      });
    });
    $$('[data-galaxy-reset], [data-galaxy-reset-modal]').forEach((button) => button.addEventListener("click", () => this.resetCamera(true)));
    $("[data-galaxy-fit-selected]")?.addEventListener("click", () => this.fitSelected());
    $$('[data-galaxy-director]').forEach((button) => button.addEventListener("click", () => {
      if (this.directorRunning) {
        this.cancelDirector(false);
        this.focusInsideFullAtlas();
      } else this.startDirector();
    }));
    $("[data-galaxy-engage]")?.addEventListener("click", () => {
      this.takeManualControl();
      this.setEngaged(!this.engaged, true);
      if (this.engaged) this.canvas.focus({ preventScroll: true });
    });
  }

  fitSelected() {
    this.takeManualControl();
    if (this.activeNeuron >= 0) this.focusNeuron(this.activeNeuron, false, true);
    else if (this.activeFamily >= 0) this.focusFamily(this.activeFamily, false, true);
    else this.focusDivision(Math.max(this.activeDivision, 0), false, true);
    showToast("Camera fit to the current selection.");
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
    this.syncCanvasAccessibleName();
    this.syncLabelSafeFrame();
    if (announce) {
      const message = this.engaged
        ? "Atlas controls engaged. Press Escape to release page scroll."
        : "Atlas controls released. Page scroll restored.";
      setText("[data-galaxy-live]", message);
      showToast(message);
    }
  }

  zoomAt(factor, pointerX, pointerY) {
    const next = galaxyZoomAtPointer({
      zoom: this.targetZoom,
      panX: this.targetPanX,
      panY: this.targetPanY,
      pointerX,
      pointerY,
      width: this.width,
      height: this.height,
      factor,
    });
    this.targetZoom = next.zoom;
    this.targetPanX = next.panX;
    this.targetPanY = next.panY;
  }

  resetCamera(manual = true) {
    if (manual) this.takeManualControl();
    this.activeDivision = 0;
    this.hoverDivision = -1;
    this.activeFamily = -1;
    this.hoverFamily = -1;
    this.activeNeuron = -1;
    this.hoverNeuron = -1;
    const overview = galaxyOverviewCamera({ width: this.width, height: this.height });
    if (overview) {
      this.targetRotationX = overview.rotationX;
      this.targetRotationY = overview.rotationY;
      this.targetZoom = overview.zoom;
      this.targetPanX = overview.panX;
      this.targetPanY = overview.panY;
    }
    this.showDivision(0);
    this.syncContextHandoff();
    this.syncLoop();
  }

  updatePointer(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = event.clientX - rect.left;
    this.pointer.y = event.clientY - rect.top;
  }

  wireInteraction() {
    this.canvas.addEventListener("pointerdown", (event) => {
      if (![0, 1].includes(event.button)) return;
      this.takeManualControl();
      this.updatePointer(event);
      this.hitTest();
      const pointerPolicy = galaxyPointerPolicy(event.pointerType, this.engaged);
      if (pointerPolicy.engage) this.setEngaged(true);
      if (pointerPolicy.focusCanvas) this.canvas.focus({ preventScroll: true });
      this.pointer.orbitAllowed = pointerPolicy.orbitAllowed;
      this.pointer.mode = event.shiftKey || event.button === 1 ? "pan" : "orbit";
      this.activePointers.set(event.pointerId, {
        x: this.pointer.x,
        y: this.pointer.y,
        pointerType: event.pointerType,
      });
      this.dragging = true;
      this.dragMoved = false;
      this.pointer.startX = event.clientX;
      this.pointer.startY = event.clientY;
      this.pointer.rotationX = this.targetRotationX;
      this.pointer.rotationY = this.targetRotationY;
      this.pointer.panX = this.targetPanX;
      this.pointer.panY = this.targetPanY;
      this.gestureMetrics = galaxyGestureMetrics(this.activePointers.values());
      if (this.engaged) {
        event.preventDefault();
        this.canvas.setPointerCapture(event.pointerId);
        this.stage?.classList.add("is-dragging");
      }
    });
    this.canvas.addEventListener("pointermove", (event) => {
      this.updatePointer(event);
      const tracked = this.activePointers.get(event.pointerId);
      if (tracked) {
        tracked.x = this.pointer.x;
        tracked.y = this.pointer.y;
      }
      if (tracked && !this.engaged) {
        const dx = event.clientX - this.pointer.startX;
        const dy = event.clientY - this.pointer.startY;
        this.dragMoved ||= Math.hypot(dx, dy) > 6;
        return;
      }
      if (this.engaged && this.activePointers.size >= 2) {
        event.preventDefault();
        const currentMetrics = galaxyGestureMetrics(this.activePointers.values());
        const camera = galaxyGestureCamera({
          previous: this.gestureMetrics,
          current: currentMetrics,
          zoom: this.targetZoom,
          panX: this.targetPanX,
          panY: this.targetPanY,
          width: this.width,
          height: this.height,
        });
        this.targetZoom = camera.zoom;
        this.targetPanX = camera.panX;
        this.targetPanY = camera.panY;
        this.gestureMetrics = currentMetrics;
        this.dragMoved = true;
        this.syncLoop();
        return;
      }
      if (this.dragging && tracked) {
        event.preventDefault();
        const dx = event.clientX - this.pointer.startX;
        const dy = event.clientY - this.pointer.startY;
        this.dragMoved ||= Math.hypot(dx, dy) > 4;
        if (!this.pointer.orbitAllowed) return;
        if (this.pointer.mode === "pan") {
          this.targetPanX = clamp(this.pointer.panX + dx, -this.width * 0.42, this.width * 0.42);
          this.targetPanY = clamp(this.pointer.panY + dy, -this.height * 0.42, this.height * 0.42);
        } else {
          this.targetRotationY = this.pointer.rotationY + dx * 0.006;
          this.targetRotationX = clamp(this.pointer.rotationX + dy * 0.0048, -1.15, 1.15);
        }
        this.syncLoop();
        return;
      }
      if (event.pointerType !== "touch") this.hitTest();
    }, { passive: false });
    const release = (event, cancelled = false) => {
      if (!this.activePointers.has(event.pointerId)) return;
      this.activePointers.delete(event.pointerId);
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
      if (this.activePointers.size) {
        const [remaining] = this.activePointers.values();
        this.pointer.startX = remaining.x + this.canvas.getBoundingClientRect().left;
        this.pointer.startY = remaining.y + this.canvas.getBoundingClientRect().top;
        this.pointer.rotationX = this.targetRotationX;
        this.pointer.rotationY = this.targetRotationY;
        this.pointer.panX = this.targetPanX;
        this.pointer.panY = this.targetPanY;
        this.pointer.mode = "orbit";
        this.gestureMetrics = galaxyGestureMetrics(this.activePointers.values());
        this.dragMoved = true;
        return;
      }
      this.dragging = false;
      this.gestureMetrics = null;
      this.stage?.classList.remove("is-dragging");
      if (cancelled) {
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
      if (this.directorRunning) this.takeManualControl();
      if (!this.engaged) return;
      event.preventDefault();
      this.takeManualControl();
      this.updatePointer(event);
      const factor = Math.exp(-event.deltaY * 0.00105);
      this.zoomAt(factor, this.pointer.x, this.pointer.y);
      this.syncLoop();
    }, { passive: false });
    this.canvas.addEventListener("keydown", (event) => {
      const handled = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "_", "Home", "0", "PageUp", "PageDown", "Enter", " "];
      if (!this.engaged) {
        if (!handled.includes(event.key)) return;
        event.preventDefault();
        this.takeManualControl();
        this.setEngaged(true, true);
        if (["Enter", " "].includes(event.key)) return;
      }
      if (!handled.includes(event.key)) return;
      event.preventDefault();
      this.takeManualControl();
      const panStep = Math.max(24, Math.min(this.width, this.height) * 0.055);
      if (event.shiftKey && event.key === "ArrowLeft") this.targetPanX -= panStep;
      else if (event.shiftKey && event.key === "ArrowRight") this.targetPanX += panStep;
      else if (event.shiftKey && event.key === "ArrowUp") this.targetPanY -= panStep;
      else if (event.shiftKey && event.key === "ArrowDown") this.targetPanY += panStep;
      else if (event.key === "ArrowLeft") this.targetRotationY -= 0.16;
      else if (event.key === "ArrowRight") this.targetRotationY += 0.16;
      else if (event.key === "ArrowUp") this.targetRotationX = clamp(this.targetRotationX - 0.12, -1.15, 1.15);
      else if (event.key === "ArrowDown") this.targetRotationX = clamp(this.targetRotationX + 0.12, -1.15, 1.15);
      if (["+", "="].includes(event.key)) this.zoomAt(1.18, this.width / 2, this.height / 2);
      if (["-", "_"].includes(event.key)) this.zoomAt(1 / 1.18, this.width / 2, this.height / 2);
      if (["Home", "0"].includes(event.key)) {
        this.resetCamera(false);
        return;
      }
      if (["PageUp", "PageDown"].includes(event.key)) {
        const direction = event.key === "PageDown" ? 1 : -1;
        this.focusDivision((this.activeDivision + direction + this.divisions.length) % this.divisions.length, false);
        return;
      }
      if (["Enter", " "].includes(event.key)) {
        if (this.hoverNeuron >= 0) this.focusNeuron(this.hoverNeuron, false);
        else if (this.hoverFamily >= 0) this.focusFamily(this.hoverFamily, false);
        else this.focusDivision(this.hoverDivision >= 0 ? this.hoverDivision : this.activeDivision, false);
        return;
      }
      this.syncLoop();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !this.engaged) return;
      event.preventDefault();
      this.cancelDirector(false);
      this.setEngaged(false, true);
      if (!this.focusInsideFullAtlas()) $("[data-galaxy-engage]")?.focus({ preventScroll: true });
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
    this.dpr = adaptiveGalaxyDpr({
      devicePixelRatio: window.devicePixelRatio || 1,
      width: this.width,
      height: this.height,
    });
    this.canvas.width = Math.max(1, Math.round(this.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(this.height * this.dpr));
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.syncLabelSafeFrame();
    this.draw(performance.now());
  }

  project(point) {
    return projectGalaxyPoint(point, {
      rotationX: this.rotationX,
      rotationY: this.rotationY,
      zoom: this.zoom,
      width: this.width,
      height: this.height,
      panX: this.panX,
      panY: this.panY,
    });
  }

  paletteColor(index) {
    const palette = GALAXY_PUBLIC_PALETTES[this.lens] || GALAXY_PUBLIC_PALETTES.mastery;
    return palette[index % palette.length];
  }

  ensureAliveSprites() {
    const key = `${this.lens}:${this.width}x${this.height}`;
    if (this.aliveSprites && this.aliveSpritesKey === key) return this.aliveSprites;
    const makeCanvas = (size, height = size) => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = height;
      return canvas;
    };
    const nebula = (seedBase, tones, intensity = 0.5) => {
      const canvas = makeCanvas(480);
      const nebulaContext = canvas.getContext("2d");
      if (!nebulaContext) return canvas;
      for (let blob = 0; blob < 4; blob += 1) {
        const bx = 90 + seededFract(seedBase + blob * 12.9898) * 300;
        const by = 90 + seededFract(seedBase + blob * 78.233) * 300;
        const br = 110 + seededFract(seedBase + blob * 41.731) * 130;
        const tone = tones[blob % tones.length];
        const gradient = nebulaContext.createRadialGradient(bx, by, 0, bx, by, br);
        gradient.addColorStop(0, `rgba(${tone}, ${intensity})`);
        gradient.addColorStop(0.55, `rgba(${tone}, ${intensity * 0.32})`);
        gradient.addColorStop(1, `rgba(${tone}, 0)`);
        nebulaContext.fillStyle = gradient;
        nebulaContext.fillRect(0, 0, 480, 480);
      }
      return canvas;
    };
    const auras = [];
    const palette = GALAXY_PUBLIC_PALETTES[this.lens] || GALAXY_PUBLIC_PALETTES.mastery;
    for (let index = 0; index < 16; index += 1) {
      const color = palette[index % palette.length];
      const canvas = makeCanvas(220);
      const auraContext = canvas.getContext("2d");
      if (auraContext) {
        // Lift the aura toward luminous nebula rather than gray dust: a
        // brighter heart plus a faint violet rim.
        const gradient = auraContext.createRadialGradient(110, 110, 0, 110, 110, 110);
        gradient.addColorStop(0, `rgba(${color.join(",")}, 0.42)`);
        gradient.addColorStop(0.42, `rgba(${color.join(",")}, 0.14)`);
        gradient.addColorStop(0.72, "rgba(146, 112, 235, 0.05)");
        gradient.addColorStop(1, `rgba(${color.join(",")}, 0)`);
        auraContext.fillStyle = gradient;
        auraContext.fillRect(0, 0, 220, 220);
      }
      auras.push(canvas);
    }
    const vignette = makeCanvas(Math.max(2, this.width), Math.max(2, this.height));
    const vignetteContext = vignette.getContext("2d");
    if (vignetteContext) {
      const gradient = vignetteContext.createRadialGradient(
        this.width * 0.5,
        this.height * 0.46,
        Math.min(this.width, this.height) * 0.34,
        this.width * 0.5,
        this.height * 0.52,
        Math.max(this.width, this.height) * 0.74,
      );
      gradient.addColorStop(0, "rgba(2, 4, 10, 0)");
      gradient.addColorStop(0.72, "rgba(2, 4, 10, 0.16)");
      gradient.addColorStop(1, "rgba(1, 3, 8, 0.5)");
      vignetteContext.fillStyle = gradient;
      vignetteContext.fillRect(0, 0, this.width, this.height);
    }
    // Pre-scale the nebulae to their final on-screen size so the per-frame
    // drawImage is a plain blit — scaling every frame is what costs.
    const span = Math.max(this.width, this.height, 2);
    const prescale = (sprite, size) => {
      const scaled = makeCanvas(Math.max(2, Math.round(size)));
      const scaledContext = scaled.getContext("2d");
      if (scaledContext) scaledContext.drawImage(sprite, 0, 0, size, size);
      return scaled;
    };
    this.aliveSprites = {
      nebulaDeep: prescale(nebula(4.117, ["56, 92, 190", "44, 120, 180", "88, 70, 200"]), span * 1.24),
      nebulaWarm: prescale(nebula(9.731, ["230, 146, 78", "212, 110, 130", "186, 124, 80"], 0.78), span),
      auras,
      vignette,
    };
    this.aliveSpritesKey = key;
    return this.aliveSprites;
  }

  drawLivingField(context, time) {
    const sprites = this.ensureAliveSprites();
    const drift = this.paused ? 0 : 1;
    const span = Math.max(this.width, this.height);
    context.save();
    context.globalCompositeOperation = "lighter";
    context.globalAlpha = 0.15;
    context.drawImage(
      sprites.nebulaDeep,
      this.width * 0.5 - span * 0.62 + Math.sin(time * 0.00009) * 20 * drift + this.rotationY * 9,
      this.height * 0.44 - span * 0.6 + Math.cos(time * 0.00007) * 14 * drift + this.rotationX * 7,
    );
    // The warm field anchors the lower-left quadrant: it fills the frame's
    // darkest region and gives the cyan body a second temperature of light.
    // Alpha is set for the COMPOSITED surface: the warm core must clear
    // R>70 on screen, not merely exist in canvas space. Small stages get a
    // lift so the chord stays audible when the projection compresses.
    context.globalAlpha = Math.min(this.width, this.height) < 640 ? 0.58 : 0.48;
    context.drawImage(
      sprites.nebulaWarm,
      this.width * 0.3 - span * 0.5 + Math.sin(time * 0.00006 + 2.1) * 26 * drift + this.rotationY * 14,
      this.height * 0.68 - span * 0.46 + Math.cos(time * 0.00005 + 1.2) * 18 * drift + this.rotationX * 11,
    );
    context.restore();
  }

  drawOrganAuras(context, time, profile) {
    const sprites = this.ensureAliveSprites();
    context.save();
    context.globalCompositeOperation = "lighter";
    this.projectedDivisions.forEach((point, index) => {
      const breathe = this.paused
        ? 0.5
        : 0.5 + 0.5 * Math.sin(time * 0.00052 + seededFract(index * 12.9898) * Math.PI * 2);
      // Quantized size keeps the per-frame blit unscaled-cheap; the breath
      // itself lives in alpha, which costs nothing.
      const active = index === this.activeDivision || index === this.hoverDivision;
      const size = Math.round(((active ? 154 : 138) * Math.sqrt(this.zoom) * point.perspective * profile.divisions) / 16) * 16;
      const exposure = clamp(Math.min(this.width, this.height) / 640, 0.6, 1);
      context.globalAlpha = (active ? 0.3 + breathe * 0.38 : 0.18 + breathe * 0.26) * exposure;
      context.drawImage(sprites.auras[index % sprites.auras.length], point.x - size / 2, point.y - size / 2, size, size);
    });
    context.restore();
  }

  ensureFamilyNeuronLists() {
    if (this.familyNeuronLists && this.familyNeuronLists.length === this.familyGeometry.length) {
      return this.familyNeuronLists;
    }
    const lists = this.familyGeometry.map(() => []);
    this.neurons.forEach((neuron, index) => {
      if (lists[neuron.familyGeometryIndex]) lists[neuron.familyGeometryIndex].push(index);
    });
    this.familyNeuronLists = lists;
    return lists;
  }

  familyMembershipBundle(familyGeometryIndex, lists = this.ensureFamilyNeuronLists()) {
    const family = this.projectedFamilies[familyGeometryIndex];
    const division = family ? this.projectedDivisions[family.divisionIndex] : null;
    const memberIndexes = lists[familyGeometryIndex];
    if (!family || !division || !memberIndexes?.length) return null;
    const members = memberIndexes.map((index) => this.projectedNeurons[index]).filter(Boolean);
    return galaxyMembershipBundleGeometry({
      division,
      family,
      members,
      lane: (family.familyIndex ?? 1.5) - 1.5,
    });
  }

  drawNeuralWeb(context, profile) {
    // True-hierarchy web only: exact authored division→family and
    // family→neuron membership is routed through deterministic visual trunks.
    // No edge or position is invented; bundling only keeps the authored
    // hierarchy readable where many memberships share the same screen space.
    // The web is static per camera pose, so it renders into an offscreen
    // layer that idle frames blit in one call.
    const cameraKey = [
      this.rotationX.toFixed(4), this.rotationY.toFixed(4), this.zoom.toFixed(4),
      this.panX.toFixed(1), this.panY.toFixed(1),
      this.activeDivision, this.hoverDivision, this.activeFamily, this.hoverFamily, this.lens,
      this.width, this.height,
    ].join(":");
    if (!this.webLayer || this.webLayerKey !== cameraKey) {
      if (!this.webLayer
        || this.webLayer.width !== this.canvas.width
        || this.webLayer.height !== this.canvas.height) {
        this.webLayer = document.createElement("canvas");
        this.webLayer.width = Math.max(2, this.canvas.width);
        this.webLayer.height = Math.max(2, this.canvas.height);
      }
      const layer = this.webLayer.getContext("2d");
      if (!layer) return;
      layer.setTransform(1, 0, 0, 1, 0, 0);
      layer.clearRect(0, 0, this.webLayer.width, this.webLayer.height);
      layer.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      layer.lineCap = "round";
      layer.lineJoin = "round";
      const chains = this.ensureFamilyNeuronLists();
      const focusedFamily = this.hoverFamily >= 0 ? this.hoverFamily : this.activeFamily;
      const compactOverview = this.width < 520 && focusedFamily < 0 && this.zoom < 1.5;
      for (let family = 0; family < this.projectedFamilies.length; family += 1) {
        const familyPoint = this.projectedFamilies[family];
        const divisionPoint = this.projectedDivisions[familyPoint.divisionIndex];
        const bundle = this.familyMembershipBundle(family, chains);
        if (!divisionPoint || !bundle) continue;
        const color = this.paletteColor(familyPoint.divisionIndex);
        const selected = family === this.activeFamily || family === this.hoverFamily;
        const activeDivision = familyPoint.divisionIndex === this.activeDivision
          || familyPoint.divisionIndex === this.hoverDivision;
        const routeAlpha = selected ? 0.58 : activeDivision ? (focusedFamily >= 0 ? 0.14 : compactOverview ? 0.18 : 0.24) : 0.08;
        const branchAlpha = selected ? 0.4 : activeDivision ? (focusedFamily >= 0 ? 0.06 : compactOverview ? 0.075 : 0.1) : 0.048;
        layer.strokeStyle = `rgba(${color.join(",")}, ${clamp(routeAlpha * profile.links, 0, 0.68)})`;
        layer.lineWidth = selected ? 1.2 : activeDivision ? 0.84 : 0.58;
        layer.beginPath();
        layer.moveTo(divisionPoint.x, divisionPoint.y);
        layer.quadraticCurveTo(bundle.sourceControl.x, bundle.sourceControl.y, familyPoint.x, familyPoint.y);
        layer.moveTo(familyPoint.x, familyPoint.y);
        layer.quadraticCurveTo(bundle.trunkControl.x, bundle.trunkControl.y, bundle.junction.x, bundle.junction.y);
        layer.stroke();

        layer.strokeStyle = `rgba(${color.join(",")}, ${clamp(branchAlpha * profile.links, 0, 0.5)})`;
        layer.lineWidth = selected ? 0.88 : activeDivision ? 0.6 : 0.4;
        layer.beginPath();
        chains[family].forEach((neuronIndex) => {
          const neuron = this.projectedNeurons[neuronIndex];
          if (!neuron) return;
          layer.moveTo(bundle.junction.x, bundle.junction.y);
          layer.lineTo(neuron.x, neuron.y);
        });
        layer.stroke();

        if (activeDivision) {
          layer.fillStyle = `rgba(${color.join(",")}, ${selected ? 0.82 : focusedFamily >= 0 ? 0.2 : compactOverview ? 0.22 : 0.34})`;
          layer.beginPath();
          layer.arc(bundle.junction.x, bundle.junction.y, selected ? 1.75 : 1.1, 0, Math.PI * 2);
          layer.fill();
        }
      }
      // Sibling chains: consecutive neurons within each family are true
      // roster relations. A quiet whole-body pass preserves the authored
      // silhouette; semantic focus strengthens it without erasing the rest.
      layer.lineWidth = 0.4;
      for (let family = 0; family < chains.length; family += 1) {
        const members = chains[family];
        if (members.length < 2) continue;
        const familyPoint = this.projectedFamilies[family];
        if (!familyPoint) continue;
        const color = this.paletteColor(familyPoint.divisionIndex);
        const selected = family === this.activeFamily || family === this.hoverFamily;
        const active = familyPoint.divisionIndex === this.activeDivision || familyPoint.divisionIndex === this.hoverDivision;
        layer.strokeStyle = `rgba(${color.join(",")}, ${clamp((selected ? 0.22 : active ? 0.095 : 0.055) * profile.links, 0, 0.34)})`;
        layer.lineWidth = selected ? 0.62 : active ? 0.44 : 0.36;
        layer.beginPath();
        for (let position = 1; position < members.length; position += 1) {
          const previous = this.projectedNeurons[members[position - 1]];
          const current = this.projectedNeurons[members[position]];
          if (!previous || !current) continue;
          layer.moveTo(previous.x, previous.y);
          layer.lineTo(current.x, current.y);
        }
        layer.stroke();
      }
      this.webLayerKey = cameraKey;
    }
    context.save();
    context.globalCompositeOperation = "lighter";
    context.drawImage(this.webLayer, 0, 0, this.width, this.height);
    context.restore();
  }

  drawSynapticImpulses(context, time, profile) {
    if (this.paused) return;
    const lists = this.ensureFamilyNeuronLists();
    context.save();
    context.globalCompositeOperation = "lighter";
    for (let family = 0; family < this.projectedFamilies.length; family += 1) {
      const seedA = seededFract(family * 12.9898 + 7.11);
      const seedB = seededFract(family * 78.233 + 3.77);
      const period = 5200 + seedA * 4600;
      const shifted = time + seedB * period;
      const cycle = Math.floor(shifted / period);
      const local = shifted - cycle * period;
      if (local > 1500) continue;
      const familyPoint = this.projectedFamilies[family];
      const divisionPoint = this.projectedDivisions[familyPoint.divisionIndex];
      const members = lists[family];
      if (!divisionPoint || !members || !members.length) continue;
      const bundle = this.familyMembershipBundle(family, lists);
      if (!bundle) continue;
      const target = this.projectedNeurons[members[(cycle + Math.floor(seedA * 97)) % members.length]];
      if (!target) continue;
      const color = this.paletteColor(familyPoint.divisionIndex);
      const quadraticPoint = (start, control, end, progress) => {
        const inverse = 1 - progress;
        return {
          x: inverse * inverse * start.x + 2 * inverse * progress * control.x + progress * progress * end.x,
          y: inverse * inverse * start.y + 2 * inverse * progress * control.y + progress * progress * end.y,
        };
      };
      const along = (s) => {
        if (s < 0.34) return quadraticPoint(divisionPoint, bundle.sourceControl, familyPoint, s / 0.34);
        if (s < 0.7) return quadraticPoint(familyPoint, bundle.trunkControl, bundle.junction, (s - 0.34) / 0.36);
        const branchProgress = (s - 0.7) / 0.3;
        return {
          x: bundle.junction.x + (target.x - bundle.junction.x) * branchProgress,
          y: bundle.junction.y + (target.y - bundle.junction.y) * branchProgress,
        };
      };
      const progress = local / 1500;
      const eased = progress * progress * (3 - 2 * progress);
      const fade = Math.sin(Math.PI * progress);
      [0, 0.05, 0.1].forEach((lag, order) => {
        const at = along(clamp(eased - lag, 0, 1));
        const head = order === 0;
        context.globalAlpha = clamp(fade * (head ? 0.85 : 0.4 - order * 0.12) * Math.min(profile.links, 1.2), 0, 1);
        context.fillStyle = head ? "rgba(235, 252, 255, 0.95)" : `rgba(${color.join(",")}, 0.8)`;
        context.beginPath();
        context.arc(at.x, at.y, head ? 1.9 : 1.25, 0, Math.PI * 2);
        context.fill();
      });
    }
    context.restore();
  }

  drawAmbientStars(context, time) {
    context.save();
    context.globalCompositeOperation = "lighter";
    for (let tier = 0; tier < 3; tier += 1) {
      const driftX = this.rotationY * (5 + tier * 4);
      const driftY = this.rotationX * (3 + tier * 3);
      const pulse = this.paused ? 0.82 : 0.76 + Math.sin(time * 0.00038 + tier * 1.7) * 0.1;
      // Two passes per tier: most stars burn cool, a seeded ~18% burn warm
      // gold — the second temperature of starlight, scattered field-wide.
      for (let warmPass = 0; warmPass < 2; warmPass += 1) {
        const tone = warmPass === 1 ? "255, 206, 140" : tier === 2 ? "151, 205, 255" : "104, 228, 255";
        context.fillStyle = `rgba(${tone}, ${(0.045 + tier * 0.025) * pulse * (warmPass === 1 ? 1.7 : 1)})`;
        context.beginPath();
        this.ambientStars.forEach((star) => {
          if (star.tier !== tier) return;
          if ((seededFract(star.phase * 91.3) < 0.18) !== (warmPass === 1)) return;
          const x = ((star.x * this.width + driftX + this.width) % this.width);
          const y = ((star.y * this.height + driftY + this.height) % this.height);
          const shimmer = this.paused ? 1 : 0.82 + Math.sin(time * 0.0009 + star.phase) * 0.18;
          const radius = (0.38 + tier * 0.24) * shimmer * (warmPass === 1 ? 1.35 : 1);
          context.moveTo(x + radius, y);
          context.arc(x, y, radius, 0, Math.PI * 2);
        });
        context.fill();
      }
    }
    context.restore();
  }

  drawValidatedSourcePulse(context, center, time) {
    const remaining = this.validatedSourcePulseUntil - time;
    if (remaining <= 0) return;
    const progress = clamp(1 - remaining / 1800, 0, 1);
    const radius = clamp(34 * this.zoom, 24, 64) + progress * Math.min(this.width, this.height) * 0.17;
    context.save();
    context.globalCompositeOperation = "lighter";
    context.globalAlpha = 1 - progress;
    context.strokeStyle = "rgba(113, 246, 188, 0.9)";
    context.lineWidth = 1.8;
    context.shadowColor = "rgba(113, 246, 188, 0.75)";
    context.shadowBlur = 18;
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha *= 0.58;
    context.lineWidth = 0.8;
    context.beginPath();
    context.arc(center.x, center.y, radius * 0.72, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  drawDirectorPacket(context, center, time) {
    if (!this.directorRunning || this.paused) return;
    const focus = this.activeNeuron >= 0
      ? this.projectedNeurons[this.activeNeuron]
      : this.activeFamily >= 0
        ? this.projectedFamilies[this.activeFamily]
        : this.projectedDivisions[this.activeDivision];
    if (!focus) return;
    const start = this.directorStep === 0
      ? { x: this.width * 0.06, y: this.height * 0.72 }
      : center;
    const end = this.directorStep === 0 ? center : focus;
    const progress = (time % 4000) / 4000;
    const eased = 0.5 - Math.cos(progress * Math.PI) * 0.5;
    const controlX = (start.x + end.x) / 2 + (end.y - start.y) * 0.12;
    const controlY = (start.y + end.y) / 2 - (end.x - start.x) * 0.12;
    const pointAt = (value) => {
      const inverse = 1 - value;
      return {
        x: inverse * inverse * start.x + 2 * inverse * value * controlX + value * value * end.x,
        y: inverse * inverse * start.y + 2 * inverse * value * controlY + value * value * end.y,
      };
    };
    context.save();
    context.globalCompositeOperation = "lighter";
    const route = context.createLinearGradient(start.x, start.y, end.x, end.y);
    route.addColorStop(0, "rgba(104, 228, 255, 0.08)");
    route.addColorStop(0.55, "rgba(104, 228, 255, 0.38)");
    route.addColorStop(1, "rgba(113, 246, 188, 0.12)");
    context.strokeStyle = route;
    context.lineWidth = 1;
    context.setLineDash([3, 8]);
    context.lineDashOffset = -time * 0.018;
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.quadraticCurveTo(controlX, controlY, end.x, end.y);
    context.stroke();
    context.setLineDash([]);
    [0, 0.055, 0.11].forEach((lag, index) => {
      const packetProgress = clamp(eased - lag, 0, 1);
      const packet = pointAt(packetProgress);
      context.globalAlpha = 1 - index * 0.25;
      context.fillStyle = index === 0 ? "rgba(225, 253, 255, 0.98)" : "rgba(104, 228, 255, 0.72)";
      context.shadowColor = "rgba(104, 228, 255, 0.9)";
      context.shadowBlur = 12;
      context.beginPath();
      context.arc(packet.x, packet.y, index === 0 ? 2.8 : 1.8, 0, Math.PI * 2);
      context.fill();
    });
    context.restore();
  }

  draw(time = 0) {
    if (!this.context || !this.renderAvailable) return;
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    if (!this.divisions.length) {
      context.fillStyle = this.loadError ? "rgba(255, 141, 154, 0.82)" : "rgba(168, 182, 202, 0.72)";
      context.font = '700 13px "SFMono-Regular", Consolas, monospace';
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
    this.drawLivingField(context, time);
    this.drawAmbientStars(context, time);

    const profile = GALAXY_LENS_PROFILES[this.lens] || GALAXY_LENS_PROFILES.mastery;
    this.projectedDivisions = this.divisionGeometry.map((point) => this.project(point));
    this.projectedFamilies = this.familyGeometry.map((point) => this.project(point));
    this.projectedNeurons = this.neurons.map((point) => this.project(point));
    const center = this.project({ x: 0, y: 0, z: 0 });
    // One organism, one pulse: a slow systolic swell that every layer below
    // shares, delayed radially from the reactor so the body breathes outward.
    const globalBeat = this.paused ? 0 : Math.pow(Math.max(0, Math.sin(time * 0.0008976)), 3);
    const beatAt = (point) => (this.paused
      ? 0
      : Math.pow(Math.max(0, Math.sin(time * 0.0008976 - Math.hypot(point.x - center.x, point.y - center.y) * 0.0042)), 3));
    // Exposure guard: on small stages the projection compresses the cluster
    // and additive glow saturates to white. Pull accumulated light down so
    // individual stars stay resolvable exactly where the copy promises it.
    const exposure = clamp(Math.min(this.width, this.height) / 640, 0.55, 1) * (this.zoom < 1 ? 0.78 : 1);

    context.save();
    context.globalCompositeOperation = "lighter";
    this.drawOrganAuras(context, time, profile);
    const depthDivisions = depthSortGalaxyPoints(this.projectedDivisions.map((point, index) => ({ ...point, geometryIndex: index })));
    depthDivisions.forEach((point) => {
      const index = point.geometryIndex;
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

    this.drawNeuralWeb(context, profile);

    depthDivisions.forEach((point) => {
      const index = point.geometryIndex;
      const color = this.paletteColor(index);
      const active = index === this.activeDivision || index === this.hoverDivision;
      const radius = galaxyDivisionVisualRadius(point, this.zoom, profile, active) * (1 + beatAt(point) * 0.085);
      context.save();
      if (active) {
        context.shadowColor = `rgba(${color.join(",")}, 0.62)`;
        context.shadowBlur = 22;
      }
      const divisionGlow = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
      divisionGlow.addColorStop(0, `rgba(${color.join(",")}, ${(active ? 0.29 : 0.12) * profile.divisions})`);
      divisionGlow.addColorStop(0.5, `rgba(${color.join(",")}, ${(active ? 0.095 : 0.038) * profile.divisions})`);
      divisionGlow.addColorStop(0.78, `rgba(${color.join(",")}, ${(active ? 0.035 : 0.012) * profile.divisions})`);
      divisionGlow.addColorStop(1, `rgba(${color.join(",")}, 0)`);
      context.fillStyle = divisionGlow;
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
      if (active) {
        context.strokeStyle = "rgba(229, 253, 255, 0.76)";
        context.lineWidth = 1.05;
        context.beginPath();
        context.arc(point.x, point.y, radius * 0.64, -2.55, -0.48);
        context.stroke();
      }
      context.restore();
    });

    if (this.zoom > profile.familyThreshold) {
      this.projectedFamilies.forEach((family, familyGeometryIndex) => {
        if (family.divisionIndex !== this.activeDivision && family.divisionIndex !== this.hoverDivision) return;
        const divisionPoint = this.projectedDivisions[family.divisionIndex];
        const color = this.paletteColor(family.divisionIndex);
        const selected = familyGeometryIndex === this.activeFamily || familyGeometryIndex === this.hoverFamily;
        const familyFocused = this.activeFamily >= 0 || this.hoverFamily >= 0;
        const supporting = familyFocused && !selected;
        const bundle = this.familyMembershipBundle(familyGeometryIndex);
        context.strokeStyle = `rgba(${color.join(",")}, ${(selected ? 0.58 : supporting ? 0.075 : 0.2) * profile.families})`;
        context.lineWidth = selected ? 1.25 : supporting ? 0.5 : 0.68;
        context.beginPath();
        context.moveTo(divisionPoint.x, divisionPoint.y);
        if (bundle) context.quadraticCurveTo(bundle.sourceControl.x, bundle.sourceControl.y, family.x, family.y);
        else context.lineTo(family.x, family.y);
        context.stroke();
        const radius = clamp((selected ? 17 : 11) * family.perspective * Math.sqrt(this.zoom) * profile.families, 7, selected ? 34 : 22);
        const familyGlow = context.createRadialGradient(family.x, family.y, 0, family.x, family.y, radius);
        familyGlow.addColorStop(0, `rgba(${color.join(",")}, ${selected ? 0.31 : supporting ? 0.055 : 0.12})`);
        familyGlow.addColorStop(1, `rgba(${color.join(",")}, 0)`);
        context.fillStyle = familyGlow;
        context.beginPath();
        context.arc(family.x, family.y, radius, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = `rgba(${color.join(",")}, ${selected ? 0.7 : supporting ? 0.14 : 0.25})`;
        context.beginPath();
        context.arc(family.x, family.y, radius * 0.58, 0, Math.PI * 2);
        context.stroke();
      });
    }

    this.drawSynapticImpulses(context, time, profile);

    depthSortGalaxyPoints(this.projectedNeurons)
      .forEach((point) => {
        const color = this.paletteColor(point.divisionIndex);
        const selectedFamily = this.hoverFamily >= 0 ? this.hoverFamily : this.activeFamily;
        const activeDivision = point.divisionIndex === this.activeDivision || point.divisionIndex === this.hoverDivision;
        const active = activeDivision && (selectedFamily < 0 || point.familyGeometryIndex === selectedFamily);
        const compactOverview = this.width < 520 && selectedFamily < 0 && this.zoom < 1.5;
        const depth = clamp((point.z + 2.7) / 5.4, 0, 1);
        const shimmer = this.paused ? 0.86 : 0.78 + Math.sin(time * 0.0015 + point.phase) * 0.16;
        const alpha = clamp((active ? compactOverview ? 0.56 : 0.9 : 0.28 + depth * 0.44) * shimmer * (1 + globalBeat * 0.16) * profile.neurons, 0.16, 1);
        const depthScale = 0.72 + depth * 0.72;
        const radius = clamp((active ? compactOverview ? 1.38 : 2.08 : 1.28) * point.perspective * Math.sqrt(this.zoom) * Math.sqrt(profile.neurons) * depthScale, 0.82, 4.8) * (0.8 + 0.2 * exposure);
        context.fillStyle = `rgba(${color.join(",")}, ${alpha * (active ? 0.16 : 0.08) * exposure * (1 - globalBeat * (0.12 + 0.25 * (1 - exposure)))})`;
        context.beginPath();
        context.arc(point.x, point.y, radius * (active ? compactOverview ? 1.8 : 3.15 : 2.45) * (0.82 + 0.18 * exposure), 0, Math.PI * 2);
        context.fill();
        context.fillStyle = `rgba(${color.join(",")}, ${alpha * (1 - globalBeat * (0.1 + 0.22 * (1 - exposure)))})`;
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
        if (!this.paused) {
          // Rare deterministic star-birth: each neuron flares once per
          // ~26-40s cycle for 640ms with a four-ray diffraction cross.
          // Cycle constants cache on the source neuron, which persists
          // across frames (projected points are per-frame copies).
          const source = this.neurons[this.neuronIndexById.get(point.id)] || point;
          if (source.sparkleCycle === undefined) {
            source.sparkleCycle = 18000 + seededFract(point.phase * 51.7) * 10000;
            source.sparkleShift = seededFract(point.phase * 17.3) * source.sparkleCycle;
          }
          const sparkleCycle = source.sparkleCycle;
          const sparkleLocal = (time + source.sparkleShift) % sparkleCycle;
          if (sparkleLocal < 640) {
            const flare = Math.sin(Math.PI * (sparkleLocal / 640));
            const ray = radius * (2.6 + flare * 3.4);
            context.globalAlpha = flare * 0.6;
            context.strokeStyle = "rgba(255, 226, 170, 0.95)";
            context.lineWidth = 0.6;
            context.beginPath();
            context.moveTo(point.x - ray, point.y);
            context.lineTo(point.x + ray, point.y);
            context.moveTo(point.x, point.y - ray);
            context.lineTo(point.x, point.y + ray);
            context.stroke();
            context.globalAlpha = flare * 0.9;
            context.fillStyle = "rgba(255, 214, 150, 0.97)";
            context.beginPath();
            context.arc(point.x, point.y, radius * (1 + flare * 0.7), 0, Math.PI * 2);
            context.fill();
            context.globalAlpha = 1;
          }
        }
      });

    const reactorRadius = clamp(28 * this.zoom, 20, 58) * (1 + globalBeat * 0.1);
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
    this.drawValidatedSourcePulse(context, center, time);
    this.drawDirectorPacket(context, center, time);
    context.restore();

    context.drawImage(this.ensureAliveSprites().vignette, 0, 0, this.width, this.height);

    const occupiedLabels = this.labelOverlayObstacles.map((box) => ({ ...box }));
    const focusedNeuron = this.hoverNeuron >= 0 ? this.hoverNeuron : this.activeNeuron;
    if (focusedNeuron >= 0 && this.zoom > 1.52) {
      this.drawNeuronLabel(context, this.projectedNeurons[focusedNeuron], focusedNeuron, occupiedLabels);
    }
    // Label dwell lock: the chosen label order freezes for 8 seconds per
    // selection state, so slow orbital drift can never churn nameplates
    // mid-gaze. Selection changes (click/hover/lens/zoom band) reset it.
    const labelOrderKey = [
      this.activeDivision, this.hoverDivision, this.activeFamily, this.hoverFamily,
      this.lens, this.fullAtlas, Math.round(this.zoom * 2),
    ].join(":");
    if (this.labelOrder && this.labelOrder.key === labelOrderKey && time > this.labelOrder.until) {
      // Same selection state, window merely aged: extend it. Placed sets and
      // plate boxes survive rollovers, so a beat crossing the window
      // boundary can never re-deal the plates (the round-five A4 hop).
      this.labelOrder.until = time + 8000;
    }
    if (!this.labelOrder || this.labelOrder.key !== labelOrderKey) {
      const divisionOrder = this.projectedDivisions
        .map((point, index) => ({ point, index }))
        .filter(({ point, index }) => point.z > -0.7 || index === this.activeDivision || index === this.hoverDivision)
        .sort((left, right) => right.point.z - left.point.z)
        .map(({ index }) => index);
      const familyOrder = this.projectedFamilies
        .map((point, index) => ({ point, index }))
        .filter(({ point }) => point.divisionIndex === this.activeDivision || point.divisionIndex === this.hoverDivision)
        .sort((left, right) => {
          const leftSelected = left.index === this.activeFamily || left.index === this.hoverFamily;
          const rightSelected = right.index === this.activeFamily || right.index === this.hoverFamily;
          return Number(rightSelected) - Number(leftSelected) || right.point.z - left.point.z;
        })
        .map(({ index }) => index);
      this.labelOrder = { key: labelOrderKey, until: time + 8000, divisionOrder, familyOrder };
    }
    const availableLabels = this.labelOrder.divisionOrder
      .map((index) => ({ point: this.projectedDivisions[index], index }))
      .filter(({ point }) => Boolean(point));
    const labelLimit = this.fullAtlas && this.width >= 620 && this.zoom < 1.5
      ? this.divisions.length
      : this.zoom > 1.7
        ? 2
        : this.zoom > 1.35
          ? 4
          : GALAXY_OVERVIEW_LABEL_LIMIT;
    const priority = [this.hoverDivision, this.activeDivision].filter((index, position, values) => index >= 0 && values.indexOf(index) === position);
    const labelCandidates = priority
      .map((index) => availableLabels.find((candidate) => candidate.index === index))
      .filter(Boolean);
    availableLabels.forEach((candidate) => {
      if (labelCandidates.length >= labelLimit || labelCandidates.some(({ index }) => index === candidate.index)) return;
      labelCandidates.push(candidate);
    });
    // Placed-set freeze: the first frame of a dwell window records which
    // plates actually won placement; every later frame in the window draws
    // exactly that set with priority placement and never substitutes. The
    // churn lived in per-frame collision outcomes, not candidate order.
    if (!this.labelOrder.divisionPlaced) {
      const placedDivisions = [];
      labelCandidates.forEach(({ point, index }, position) => {
        if (this.drawDivisionLabel(context, point, index, occupiedLabels, position < 3)) {
          placedDivisions.push(index);
        }
      });
      this.labelOrder.divisionPlaced = placedDivisions;
    } else {
      const sticky = new Set(this.labelOrder.divisionPlaced);
      labelCandidates
        .filter(({ index }) => sticky.has(index))
        .forEach(({ point, index }, position) => {
          this.drawDivisionLabel(context, point, index, occupiedLabels, position < 3, true);
        });
    }
    if (this.zoom > profile.familyThreshold) {
      const familyCandidates = this.labelOrder.familyOrder
        .map((index) => ({ point: this.projectedFamilies[index], index }))
        .filter(({ point }) => point && (point.divisionIndex === this.activeDivision || point.divisionIndex === this.hoverDivision));
      if (!this.labelOrder.familyPlaced) {
        const placedFamilies = [];
        familyCandidates.forEach(({ point, index }) => {
          if (this.drawFamilyLabel(context, point, index, occupiedLabels)) placedFamilies.push(index);
        });
        this.labelOrder.familyPlaced = placedFamilies;
      } else {
        const sticky = new Set(this.labelOrder.familyPlaced);
        familyCandidates
          .filter(({ index }) => sticky.has(index))
          .forEach(({ point, index }) => this.drawFamilyLabel(context, point, index, occupiedLabels, true));
      }
    }
  }

  drawDivisionLabel(context, point, index, occupied, semanticAnchor = false, sticky = false) {
    const division = this.divisions[index];
    const active = index === this.activeDivision || index === this.hoverDivision;
    const hovered = index === this.hoverDivision;
    const fullName = titleCase(division.name);
    const nameLimit = this.width < 520 ? 23 : 34;
    const compactName = fullName.length > nameLimit ? `${fullName.slice(0, nameLimit - 1).trimEnd()}…` : fullName;
    const expansive = active && hovered && !this.fullAtlas && semanticAnchor && this.width >= 620;
    const label = expansive ? `${division.code} · ${compactName}` : division.code;
    context.save();
    const fontSize = active ? 19 : 17;
    context.font = `${active ? 800 : 700} ${fontSize}px "SFMono-Regular", "Cascadia Code", Consolas, monospace`;
    const width = context.measureText(label).width + (expansive ? 18 : 12);
    const height = active ? 38 : expansive ? 35 : 31;
    const calloutGap = clamp(36 * point.perspective * this.zoom, 30, 64);
    const desiredX = expansive
      ? (point.x >= this.width / 2 ? point.x - width - calloutGap : point.x + calloutGap)
      : point.x - width / 2;
    const desiredY = expansive
      ? point.y - height / 2 - clamp(18 * point.perspective * this.zoom, 10, 32)
      : point.y - clamp(52 * point.perspective * this.zoom, 34, 82);
    const box = this.glideStickyBox(`d${index}`, point, width, height, occupied)
      || this.placeSafeCanvasLabel(width, height, desiredX, desiredY, occupied, active || sticky);
    if (!box) {
      context.restore();
      return false;
    }
    if (this.labelOrder) {
      if (!this.labelOrder.plateBoxes) this.labelOrder.plateBoxes = {};
      if (!this.labelOrder.plateBoxes[`d${index}`]) {
        this.labelOrder.plateBoxes[`d${index}`] = {
          x: box.x, y: box.y, anchorX: point.x, anchorY: point.y,
          homeOffsetX: box.x - point.x, homeOffsetY: box.y - point.y,
        };
      }
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
    context.fillStyle = active ? "rgba(5, 11, 20, 0.95)" : "rgba(5, 10, 18, 0.93)";
    context.strokeStyle = active ? "rgba(104, 228, 255, 0.5)" : "rgba(169, 195, 224, 0.16)";
    context.lineWidth = 0.7;
    roundedRectPath(context, box.x, box.y, width, height, 5);
    context.fill();
    context.stroke();
    context.fillStyle = active ? "rgba(214, 249, 255, 0.96)" : "rgba(176, 191, 212, 0.88)";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, box.x + width / 2, box.y + height / 2 + 0.5);
    context.restore();
    return true;
  }

  drawFamilyLabel(context, point, familyGeometryIndex, occupied, sticky = false) {
    const geometry = this.familyGeometry[familyGeometryIndex];
    const family = this.divisions[geometry.divisionIndex]?.families?.[geometry.familyIndex];
    if (!family) return false;
    const selected = familyGeometryIndex === this.activeFamily || familyGeometryIndex === this.hoverFamily;
    const focusedFamily = this.hoverFamily >= 0 ? this.hoverFamily : this.activeFamily;
    if (focusedFamily >= 0 && familyGeometryIndex !== focusedFamily) return false;
    if (!selected && this.zoom < 1.55) return false;
    const familyName = titleCase(family.name);
    const nameLimit = selected ? 64 : this.width < 520 ? 14 : 20;
    const compactName = familyName.length > nameLimit ? `${familyName.slice(0, nameLimit - 1).trimEnd()}…` : familyName;
    const label = selected ? `${family.code} · ${compactName}` : family.code;
    context.save();
    context.font = `${selected ? 800 : 700} ${selected ? 18 : 16}px "SFMono-Regular", "Cascadia Code", Consolas, monospace`;
    const width = context.measureText(label).width + (selected ? 16 : 10);
    const height = selected ? 35 : 31;
    const desiredX = selected
      ? (point.x >= this.width * 0.46 ? point.x - width - 44 : point.x + 44)
      : point.x - width / 2;
    const desiredY = selected ? point.y - height / 2 : point.y + 10;
    const box = this.glideStickyBox(`f${familyGeometryIndex}`, point, width, height, occupied)
      || this.placeSafeCanvasLabel(width, height, desiredX, desiredY, occupied, selected || sticky);
    if (!box) {
      context.restore();
      return false;
    }
    if (this.labelOrder) {
      if (!this.labelOrder.plateBoxes) this.labelOrder.plateBoxes = {};
      if (!this.labelOrder.plateBoxes[`f${familyGeometryIndex}`]) {
        this.labelOrder.plateBoxes[`f${familyGeometryIndex}`] = {
          x: box.x, y: box.y, anchorX: point.x, anchorY: point.y,
          homeOffsetX: box.x - point.x, homeOffsetY: box.y - point.y,
        };
      }
    }
    const color = this.paletteColor(geometry.divisionIndex);
    if (selected) {
      context.strokeStyle = `rgba(${color.join(",")}, 0.34)`;
      context.lineWidth = 0.65;
      context.beginPath();
      context.moveTo(point.x, point.y);
      context.lineTo(
        point.x < box.x ? box.x : point.x > box.x + width ? box.x + width : clamp(point.x, box.x + 6, box.x + width - 6),
        point.y < box.y ? box.y : point.y > box.y + height ? box.y + height : box.y + height / 2,
      );
      context.stroke();
      context.shadowColor = `rgba(${color.join(",")}, 0.2)`;
      context.shadowBlur = 10;
    }
    context.fillStyle = "rgba(4, 9, 17, 0.94)";
    context.strokeStyle = `rgba(${color.join(",")}, ${selected ? 0.48 : 0.2})`;
    context.lineWidth = 0.7;
    roundedRectPath(context, box.x, box.y, width, height, 5);
    context.fill();
    context.stroke();
    context.fillStyle = selected ? "rgba(222, 250, 255, 0.96)" : "rgba(185, 208, 230, 0.9)";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, box.x + width / 2, box.y + height / 2 + 0.5);
    context.restore();
    return true;
  }

  drawNeuronLabel(context, point, neuronIndex, occupied) {
    const neuron = this.neurons[neuronIndex];
    if (!point || !neuron) return;
    context.save();
    context.font = '800 17px "SFMono-Regular", "Cascadia Code", Consolas, monospace';
    const width = context.measureText(neuron.id).width + 14;
    const height = 31;
    const box = this.placeSafeCanvasLabel(width, height, point.x + 8, point.y - 33, occupied, true);
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
      this.panX = this.targetPanX;
      this.panY = this.targetPanY;
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
    this.panX += (this.targetPanX - this.panX) * zoomDamping;
    this.panY += (this.targetPanY - this.panY) * zoomDamping;
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

function runAfterFirstPaint(label, start, delayMs = 0) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      if (delayMs > 0) window.setTimeout(() => runSafely(label, start), delayMs);
      else runSafely(label, start);
    });
  });
}

function wireSurfaceMode() {
  const STORAGE_KEY = "hive.publicSurfaceMode";
  const buttons = $$("[data-surface-mode-button]");
  if (!buttons.length) return;
  const apply = (mode, { persist = true, focusTarget = false } = {}) => {
    const next = mode === "proof" ? "proof" : "presentation";
    document.body.dataset.surfaceMode = next;
    buttons.forEach((button) => {
      const active = button.dataset.surfaceModeButton === next;
      button.setAttribute("aria-pressed", String(active));
    });
    if (persist) {
      try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore quota/private mode */ }
    }
    if (focusTarget && next === "proof") {
      const truth = $("#product-truth");
      truth?.scrollIntoView({ block: "start" });
      const heading = $("#product-truth-title");
      heading?.setAttribute("tabindex", "-1");
      heading?.focus({ preventScroll: true });
    }
  };
  let initial = "presentation";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "proof" || stored === "presentation") initial = stored;
  } catch { /* ignore */ }
  if (window.location.hash === "#product-truth" || window.location.hash === "#ide-download" || window.location.hash === "#tester") {
    initial = "proof";
  }
  apply(initial, { persist: false });
  buttons.forEach((button) => {
    button.addEventListener("click", () => apply(button.dataset.surfaceModeButton, { focusTarget: button.dataset.surfaceModeButton === "proof" }));
  });
  window.addEventListener("hashchange", () => {
    if (["#product-truth", "#ide-download", "#tester", "#platforms"].includes(window.location.hash)) {
      apply("proof", { persist: true });
    }
  });
}

runSafely("Motion controls", wireMotionToggle);
runSafely("Surface mode", wireSurfaceMode);
runSafely("Top navigation", wireTopbar);
runSafely("Local Body handoff boundary", enforceLocalHandoffBoundary);
runAfterFirstPaint("Section reveals", wireReveal, 0);
runAfterFirstPaint("Constellation Atlas", startGalaxy, 20);
runAfterFirstPaint("Offscreen scene control", wireSceneActivity, 40);
runAfterFirstPaint("Ambient field", startField, 60);
runAfterFirstPaint("Section navigation", wireSectionNav, 80);
runAfterFirstPaint("Platform table overflow focus", wirePlatformTableOverflow, 90);
runAfterFirstPaint("Galaxy lenses", wireLenses, 100);
runAfterFirstPaint("Living command cycle", wireCommandCycle, 120);
runAfterFirstPaint("Release copy controls", wireCopyButtons, 140);
runAfterFirstPaint("Hive IDE release copy", wireIdeReleaseCopy, 160);
runAfterFirstPaint("Product truth manifest", wireProductTruthManifest, 190);
runAfterFirstPaint("Source snapshot", () => {
  if ($("[data-source-stamp], [data-galaxy-canvas]")) {
    startSnapshotRefresh();
    void loadSourceSnapshot();
  }
}, 50);
runAfterFirstPaint("HivePoA quarantine", () => { renderHivePoaQuarantine(); }, 200);
runAfterFirstPaint("Hive IDE release", () => { void loadIdeRelease(); }, 220);
