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

  const apply = (paused, announce = false) => {
    document.body.classList.toggle("motion-paused", paused);
    button.setAttribute("aria-pressed", String(paused));
    button.textContent = paused ? "Resume motion" : "Pause motion";
    window.dispatchEvent(new CustomEvent("hive:motion", { detail: { paused } }));
    if (announce) showToast(paused ? "Ambient motion paused." : "Ambient motion resumed.");
  };

  apply(reduceMotion.matches || safeStorageGet("hive-hub-motion") === "paused");
  button.addEventListener("click", () => {
    const paused = button.getAttribute("aria-pressed") !== "true";
    safeStorageSet("hive-hub-motion", paused ? "paused" : "active");
    apply(paused, true);
  });
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
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8%", threshold: 0.08 });
  items.forEach((item) => observer.observe(item));
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

const LENSES = Object.freeze({
  mastery: {
    index: "01",
    code: "MST",
    eyebrow: "Organization",
    title: "Mastery organizes the swarm.",
    copy: "Sixteen divisions give 640 neurons a legible home without turning the map into a claim that every process is currently running.",
    statA: "640",
    labelA: "neurons",
    statB: "16",
    labelB: "divisions",
    boundary: "Visualization only. No execution or training authority is granted.",
  },
  artifact: {
    index: "02",
    code: "ART",
    eyebrow: "Durable structure",
    title: "Artifacts make work inspectable.",
    copy: "Four hundred thirty-three mapped components become navigable evidence when paths, ownership, and generated graph bindings stay explicit.",
    statA: "433",
    labelA: "components",
    statB: "84",
    labelB: "organs",
    boundary: "A visible artifact is not automatically current, approved, or releasable.",
  },
  evidence: {
    index: "03",
    code: "EVD",
    eyebrow: "Provenance",
    title: "Evidence gives every edge a reason.",
    copy: "The source-generated graph records 1,219 typed links across 1,183 nodes. The public view exposes structure, not private corpus contents.",
    statA: "1,219",
    labelA: "typed links",
    statB: "1,183",
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
    copy: "Hive-AI supplies reasoning and evidence navigation. HivePoA supplies content-addressed transport, storage challenges, receipts, and test-only credits.",
    statA: "2",
    labelA: "system layers",
    statB: "1",
    labelB: "central hub",
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
  setText(".inspector-topline span:first-child", `Lens ${lens.index}`);
  setText("[data-lens-code]", lens.code);
  setText("[data-lens-eyebrow]", lens.eyebrow);
  setText("[data-lens-title]", lens.title);
  setText("[data-lens-copy]", lens.copy);
  setText("[data-lens-stat-a]", lens.statA);
  setText("[data-lens-label-a]", lens.labelA);
  setText("[data-lens-stat-b]", lens.statB);
  setText("[data-lens-label-b]", lens.labelB);
  setText("[data-lens-boundary]", lens.boundary);
  if (focusNode) $(`[data-lens="${name}"]`)?.focus();
}

function wireLenses() {
  $$('[data-lens]').forEach((button, index, buttons) => {
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
  $$('[data-node]').forEach((node) => node.addEventListener("click", () => selectLens(node.dataset.node, true)));
}

function validSnapshot(snapshot) {
  const facts = snapshot?.hiveAi;
  return snapshot?.schema === "hive.ecosystem.public-source-snapshot.v1"
    && snapshot?.boundaries?.snapshotOnly === true
    && snapshot?.boundaries?.runtimeTelemetry === false
    && snapshot?.boundaries?.grantsAuthority === false
    && /^[a-f0-9]{40}$/.test(facts?.sourceCommit || "")
    && /^[a-f0-9]{64}$/.test(facts?.graphHash || "")
    && [facts?.neurons, facts?.components, facts?.organs, facts?.nodes, facts?.edges, facts?.moons]
      .every((value) => Number.isSafeInteger(value) && value > 0);
}

async function loadSourceSnapshot() {
  try {
    const response = await fetch("/hub-assets/hub-facts.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`snapshot HTTP ${response.status}`);
    const snapshot = await response.json();
    if (!validSnapshot(snapshot)) throw new Error("snapshot contract rejected");
    const facts = snapshot.hiveAi;
    const values = {
      neurons: facts.neurons,
      components: facts.components,
      nodes: facts.nodes.toLocaleString("en-US"),
      edges: facts.edges.toLocaleString("en-US"),
      moons: facts.moons,
    };
    Object.entries(values).forEach(([key, value]) => {
      $$(`[data-fact="${key}"]`).forEach((node) => { node.textContent = String(value); });
    });
    setText("[data-source-stamp]", `Hive-AI main @ ${facts.sourceCommit.slice(0, 7)}`);
  } catch (error) {
    // Embedded values remain visible and explicitly labeled as a source snapshot.
    console.warn("Hive source snapshot could not be refreshed:", error);
  }
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

function wireLocalChatNotice() {
  $$('[href="http://127.0.0.1:5002/chat"]').forEach((link) => {
    link.addEventListener("click", () => {
      showToast("Opening the local Hive-AI runtime. If it is offline, the new tab will stay unavailable.");
    });
  });
}

class FieldRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: true });
    this.nodes = [];
    this.pointer = { x: -9999, y: -9999, active: false };
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.raf = 0;
    this.lastFrame = 0;
    this.paused = reduceMotion.matches || document.body.classList.contains("motion-paused");
    this.visible = !document.hidden;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(document.documentElement);
    window.addEventListener("pointermove", (event) => {
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
      this.pointer.active = true;
    }, { passive: true });
    window.addEventListener("pointerout", (event) => {
      if (!event.relatedTarget) this.pointer.active = false;
    }, { passive: true });
    document.addEventListener("visibilitychange", () => {
      this.visible = !document.hidden;
      this.syncLoop();
    });
    window.addEventListener("hive:motion", (event) => {
      this.paused = Boolean(event.detail?.paused) || reduceMotion.matches;
      this.syncLoop();
    });
    this.resize();
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
    while (this.nodes.length < target) this.nodes.push(this.createNode());
    if (this.nodes.length > target) this.nodes.length = target;
    this.draw();
    this.syncLoop();
  }

  createNode() {
    const cyan = Math.random() > 0.24;
    return {
      x: Math.random() * Math.max(this.width, 1),
      y: Math.random() * Math.max(this.height, 1),
      vx: (Math.random() - 0.5) * 0.11,
      vy: (Math.random() - 0.5) * 0.11,
      r: Math.random() * 1.25 + 0.45,
      color: cyan ? "104, 228, 255" : "175, 123, 255",
      phase: Math.random() * Math.PI * 2,
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
    if (time - this.lastFrame < 32) {
      this.raf = window.requestAnimationFrame((next) => this.frame(next));
      return;
    }
    this.lastFrame = time;
    this.step();
    this.draw(time);
    this.raf = window.requestAnimationFrame((next) => this.frame(next));
  }

  step() {
    this.nodes.forEach((node) => {
      if (this.pointer.active) {
        const dx = this.pointer.x - node.x;
        const dy = this.pointer.y - node.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < 18000 && distanceSquared > 20) {
          const force = (1 - distanceSquared / 18000) * 0.0018;
          node.vx -= dx * force;
          node.vy -= dy * force;
        }
      }
      node.vx *= 0.992;
      node.vy *= 0.992;
      node.vx += (Math.random() - 0.5) * 0.003;
      node.vy += (Math.random() - 0.5) * 0.003;
      node.x += node.vx;
      node.y += node.vy;
      if (node.x < -20) node.x = this.width + 20;
      if (node.x > this.width + 20) node.x = -20;
      if (node.y < -20) node.y = this.height + 20;
      if (node.y > this.height + 20) node.y = -20;
    });
  }

  draw(time = 0) {
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    const linkDistance = this.width < 700 ? 88 : 125;
    const linkSquared = linkDistance * linkDistance;
    for (let i = 0; i < this.nodes.length; i += 1) {
      const a = this.nodes[i];
      for (let j = i + 1; j < this.nodes.length; j += 1) {
        const b = this.nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared > linkSquared) continue;
        const alpha = (1 - distanceSquared / linkSquared) * 0.105;
        context.strokeStyle = `rgba(${a.color}, ${alpha})`;
        context.lineWidth = 0.55;
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
      }
    }
    this.nodes.forEach((node) => {
      const shimmer = 0.5 + Math.sin(time * 0.0007 + node.phase) * 0.22;
      context.fillStyle = `rgba(${node.color}, ${shimmer})`;
      context.shadowColor = `rgba(${node.color}, 0.55)`;
      context.shadowBlur = 8;
      context.beginPath();
      context.arc(node.x, node.y, node.r, 0, Math.PI * 2);
      context.fill();
    });
    context.shadowBlur = 0;
  }
}

function startField() {
  const canvas = $("[data-field-canvas]");
  if (!canvas || !("ResizeObserver" in window)) return;
  new FieldRenderer(canvas);
}

wireMotionToggle();
wireTopbar();
wireReveal();
wireSectionNav();
wireLenses();
wireCopyButtons();
wireLocalChatNotice();
startField();
loadSourceSnapshot();
loadAuthorizedRelease();
