(function () {
  "use strict";

  // Out-of-band Pages pin (operator-controlled). The fixture PEM must match this
  // fingerprint; Pages alone must not introduce a substitute key+signature pair.
  var PINNED_CHANNEL_INDEX_PUBLIC_KEY_SHA256 =
    "11098a69d338689c46e2ac08b66f315fd7ded7f794b74d8c0bf09bf03715c081";

  function readFixture() {
    var node = document.getElementById("release-index-fixture");
    if (!node) return { ok: false, reason: "missing release-index fixture" };
    try {
      var parsed = JSON.parse(node.textContent || "");
      return { ok: true, index: parsed };
    } catch (error) {
      return { ok: false, reason: "malformed release-index fixture" };
    }
  }

  function failClosed(reason) {
    var status = document.querySelector("[data-status]");
    if (status) {
      status.textContent = "Downloads blocked: " + reason;
      status.setAttribute("data-state", "blocked");
    }
    var github = document.getElementById("btn-github");
    var ipfs = document.getElementById("btn-ipfs");
    if (github) {
      github.disabled = true;
      github.textContent = "GitHub mirror (not trust root)";
    }
    if (ipfs) ipfs.disabled = true;
  }

  function canonicalStringify(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) {
      return "[" + value.map(canonicalStringify).join(",") + "]";
    }
    var keys = Object.keys(value).sort();
    return "{" + keys.map(function (key) {
      return JSON.stringify(key) + ":" + canonicalStringify(value[key]);
    }).join(",") + "}";
  }

  function pemToSpki(pem) {
    var b64 = String(pem || "")
      .replace(/-----BEGIN PUBLIC KEY-----/g, "")
      .replace(/-----END PUBLIC KEY-----/g, "")
      .replace(/\s+/g, "");
    var raw = atob(b64);
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return bytes.buffer;
  }

  function b64ToBuf(b64) {
    var raw = atob(b64);
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return bytes.buffer;
  }

  async function sha256Hex(buffer) {
    var digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest)).map(function (b) {
      return b.toString(16).padStart(2, "0");
    }).join("");
  }

  async function verifySignatures(index) {
    if (!index || index.schemaVersion !== 1) return { ok: false, reason: "unsupported index schema" };
    if (!index.signed || !Array.isArray(index.signatures) || index.signatures.length < 1) {
      return { ok: false, reason: "missing signatures" };
    }
    var bootstrap = index.trustBootstrap;
    if (!bootstrap || !bootstrap.publicKeyPem || !bootstrap.publicKeySha256) {
      return { ok: false, reason: "missing trust bootstrap public key" };
    }
    if (bootstrap.publicKeySha256 !== PINNED_CHANNEL_INDEX_PUBLIC_KEY_SHA256) {
      return { ok: false, reason: "trust bootstrap fingerprint is not the pinned Pages key" };
    }
    var signed = index.signed;
    if (!signed.expiresAt || Date.now() >= Date.parse(signed.expiresAt)) {
      return { ok: false, reason: "expired or missing expiry" };
    }
    if (!Array.isArray(signed.releases) || signed.releases.length < 1) {
      return { ok: false, reason: "no releases in index" };
    }
    var tipSeq = Number(signed.latestBetaSequence || 0);
    if (!Number.isFinite(tipSeq) || tipSeq < 1) {
      return {
        ok: false,
        reason: "no approved tester tip (public .2/.3 withdrawn — use operator three-file handoff)",
        signed: signed,
      };
    }
    var selected = signed.releases.find(function (item) {
      return item && item.revoked !== true && Number(item.releaseSequence) === tipSeq;
    });
    if (!selected) {
      return {
        ok: false,
        reason: "approved tip sequence missing or revoked — not tester authority",
        signed: signed,
      };
    }
    if (signed.mirrorParity !== true) {
      return { ok: false, reason: "mirror parity not proven in signed index", signed: signed };
    }
    if (!selected.githubReleaseTag || !selected.manifestCid || !selected.manifestSha256) {
      return { ok: false, reason: "release missing dual-channel pointers" };
    }

    var payload = new TextEncoder().encode(canonicalStringify(signed));
    var keyBytes = pemToSpki(bootstrap.publicKeyPem);
    var keyHash = await sha256Hex(keyBytes);
    if (keyHash !== bootstrap.publicKeySha256 || keyHash !== PINNED_CHANNEL_INDEX_PUBLIC_KEY_SHA256) {
      return { ok: false, reason: "trust bootstrap key fingerprint mismatch" };
    }

    var cryptoKey;
    try {
      cryptoKey = await crypto.subtle.importKey(
        "spki",
        keyBytes,
        { name: "Ed25519" },
        false,
        ["verify"],
      );
    } catch (error) {
      return { ok: false, reason: "browser cannot import Ed25519 trust key" };
    }

    var valid = 0;
    for (var i = 0; i < index.signatures.length; i += 1) {
      var entry = index.signatures[i];
      if (!entry || entry.algorithm !== "ed25519") {
        return { ok: false, reason: "unsupported signature algorithm" };
      }
      if (entry.publicKeySha256 !== bootstrap.publicKeySha256) {
        return { ok: false, reason: "signature key is not the trust bootstrap key" };
      }
      if (String(entry.signature || "").indexOf("RESTORE_AUTHORIZED") === 0) {
        return { ok: false, reason: "stub signature rejected" };
      }
      var ok = await crypto.subtle.verify(
        { name: "Ed25519" },
        cryptoKey,
        b64ToBuf(entry.signature),
        payload,
      );
      if (!ok) return { ok: false, reason: "invalid ed25519 signature" };
      valid += 1;
    }
    if (valid < 1) return { ok: false, reason: "no valid signatures" };
    return { ok: true, release: selected, signed: signed };
  }

  function fillMeta(release, signed) {
    function set(field, value) {
      document.querySelectorAll('[data-field="' + field + '"]').forEach(function (node) {
        node.textContent = value;
      });
    }
    if (!release) return;
    var primary = release.primaryArtifact;
    var digest = primary && release.artifactDigests ? release.artifactDigests[primary] : null;
    set("version", release.version || "unavailable");
    set("platform", release.platform || "windows/linux");
    set("architecture", release.architecture || "x64");
    // "125623659" is not a size a person can sanity-check against their
    // download; "119.8 MiB" is.
    set("bytes", release.bytes != null ? formatBytes(release.bytes) : "see manifest");
    set("sha256", digest || release.manifestSha256 || "unavailable");
    set("signer", (signed && signed.signer) || "signed index");
    set("ceiling", (signed && signed.capabilityCeilingText) || "storage-preview only");
    document.querySelectorAll('[data-field="sha256"]').forEach(function (node) {
      var value = digest || release.manifestSha256;
      if (!value) return;
      node.setAttribute("data-copy", "");
      node.setAttribute("data-copy-value", value);
    });
    if (release.primaryArtifact) {
      document.querySelectorAll("[data-field-filename]").forEach(function (node) {
        node.textContent = release.primaryArtifact;
        node.setAttribute("data-copy", "");
        node.setAttribute("data-copy-value", release.primaryArtifact);
      });
    }
  }

  function fillList(signed) {
    var list = document.querySelector("[data-release-list]");
    if (!list || !signed) return;
    var tipSeq = Number(signed.latestBetaSequence || 0);
    var reasons = {};
    (signed.revocations || []).forEach(function (entry) {
      if (entry && entry.releaseSequence != null) {
        // Reasons already begin "WITHDRAWN:", which rendered as
        // "WITHDRAWN — do not install (WITHDRAWN: …)" and read like a copy bug.
        reasons[String(entry.releaseSequence)] =
          String(entry.reason || "").replace(/^\s*withdrawn:\s*/i, "");
      }
    });
    list.innerHTML = "";
    signed.releases.forEach(function (release) {
      // A tester must never have to guess which row is installable. Every row
      // states its own standing: current tip, withdrawn, or simply superseded.
      var seq = Number(release.releaseSequence);
      var state;
      if (release.revoked) state = "WITHDRAWN — do not install";
      else if (seq === tipSeq) state = "CURRENT TIP — install this one";
      else state = "superseded — not the current tip";
      var li = document.createElement("li");
      li.setAttribute("data-release-state", release.revoked ? "withdrawn" : (seq === tipSeq ? "tip" : "superseded"));
      var head = document.createElement("strong");
      head.textContent = release.version + " · seq " + release.releaseSequence + " · " + release.channel;
      var tail = document.createElement("span");
      var reason = reasons[String(seq)];
      tail.textContent = " · " + state + (release.revoked && reason ? " (" + reason + ")" : "");
      li.appendChild(head);
      li.appendChild(tail);
      list.appendChild(li);
    });
  }

  function fillArtifactTable(release) {
    var table = document.querySelector("[data-artifact-digests]");
    if (!table || !release || !release.artifactDigests) return;
    table.innerHTML = "";
    Object.keys(release.artifactDigests).sort().forEach(function (name) {
      var row = document.createElement("tr");
      var tdName = document.createElement("td");
      var tdHash = document.createElement("td");
      tdName.textContent = name;
      var code = document.createElement("code");
      code.textContent = release.artifactDigests[name];
      code.setAttribute("data-copy", "");
      code.setAttribute("data-copy-value", release.artifactDigests[name]);
      tdHash.appendChild(code);
      row.appendChild(tdName);
      row.appendChild(tdHash);
      table.appendChild(row);
    });
  }

  function hex(buffer) {
    return Array.from(new Uint8Array(buffer)).map(function (b) {
      return b.toString(16).padStart(2, "0");
    }).join("");
  }

  var SHA256_K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);

  /**
   * Incremental SHA-256. crypto.subtle.digest cannot stream, so verifying the
   * ~120 MB portable meant allocating the whole file at once and showing the
   * tester nothing for the duration — a progress-free pause long enough to look
   * like the page had hung on the one step that actually protects them.
   * This hashes 4 MiB at a time and reports progress. It is never trusted
   * blind: see incrementalDigestTrustworthy().
   */
  function Sha256Stream() {
    this.h = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ]);
    this.w = new Uint32Array(64);
    this.block = new Uint8Array(64);
    this.blockLen = 0;
    this.totalLen = 0;
  }

  Sha256Stream.prototype.compress = function (bytes, offset) {
    var w = this.w;
    var i, x, y, s0, s1, ch, maj, t1, t2;
    for (i = 0; i < 16; i += 1) {
      var o = offset + i * 4;
      w[i] = (bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3];
    }
    for (i = 16; i < 64; i += 1) {
      x = w[i - 15];
      y = w[i - 2];
      s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    var a = this.h[0], b = this.h[1], c = this.h[2], d = this.h[3];
    var e = this.h[4], f = this.h[5], g = this.h[6], hh = this.h[7];
    for (i = 0; i < 64; i += 1) {
      s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      ch = (e & f) ^ (~e & g);
      t1 = (hh + s1 + ch + SHA256_K[i] + w[i]) | 0;
      s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      maj = (a & b) ^ (a & c) ^ (b & c);
      t2 = (s0 + maj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    this.h[0] = (this.h[0] + a) | 0;
    this.h[1] = (this.h[1] + b) | 0;
    this.h[2] = (this.h[2] + c) | 0;
    this.h[3] = (this.h[3] + d) | 0;
    this.h[4] = (this.h[4] + e) | 0;
    this.h[5] = (this.h[5] + f) | 0;
    this.h[6] = (this.h[6] + g) | 0;
    this.h[7] = (this.h[7] + hh) | 0;
  };

  Sha256Stream.prototype.update = function (bytes) {
    var offset = 0;
    var len = bytes.length;
    this.totalLen += len;
    if (this.blockLen > 0) {
      var take = Math.min(64 - this.blockLen, len);
      this.block.set(bytes.subarray(0, take), this.blockLen);
      this.blockLen += take;
      offset = take;
      if (this.blockLen === 64) {
        this.compress(this.block, 0);
        this.blockLen = 0;
      }
    }
    while (offset + 64 <= len) {
      this.compress(bytes, offset);
      offset += 64;
    }
    if (offset < len) {
      this.block.set(bytes.subarray(offset), 0);
      this.blockLen = len - offset;
    }
  };

  Sha256Stream.prototype.hex = function () {
    var total = this.totalLen;
    var padLen = this.blockLen < 56 ? 56 - this.blockLen : 120 - this.blockLen;
    var tail = new Uint8Array(padLen + 8);
    tail[0] = 0x80;
    // 64-bit bit length without overflowing a 32-bit int on multi-GB inputs.
    var hi = Math.floor(total / 536870912);
    var lo = (total % 536870912) * 8;
    tail[padLen] = (hi >>> 24) & 0xff;
    tail[padLen + 1] = (hi >>> 16) & 0xff;
    tail[padLen + 2] = (hi >>> 8) & 0xff;
    tail[padLen + 3] = hi & 0xff;
    tail[padLen + 4] = (lo >>> 24) & 0xff;
    tail[padLen + 5] = (lo >>> 16) & 0xff;
    tail[padLen + 6] = (lo >>> 8) & 0xff;
    tail[padLen + 7] = lo & 0xff;
    this.update(tail);
    var out = "";
    for (var i = 0; i < 8; i += 1) {
      out += (this.h[i] >>> 0).toString(16).padStart(8, "0");
    }
    return out;
  };

  var incrementalTrust = null;

  /**
   * A wrong hash here would tell a tester that a bad file is good, so the
   * streaming implementation is checked against the browser's own SHA-256 on
   * every page load before it is used, over random bytes fed at deliberately
   * awkward block boundaries. If it does not agree exactly, it is not used.
   */
  /** crypto.getRandomValues rejects anything over 65536 bytes per call. */
  function randomSample(length) {
    var out = new Uint8Array(length);
    for (var offset = 0; offset < length; offset += 65536) {
      crypto.getRandomValues(out.subarray(offset, Math.min(offset + 65536, length)));
    }
    return out;
  }

  async function incrementalDigestTrustworthy() {
    if (incrementalTrust !== null) return incrementalTrust;
    try {
      var sample = randomSample(200000);
      var expected = await sha256Hex(sample.buffer);
      var streamed = new Sha256Stream();
      var cuts = [0, 1, 64, 65, 127, 128, 4096, 100003, sample.length];
      for (var i = 1; i < cuts.length; i += 1) {
        streamed.update(sample.subarray(cuts[i - 1], cuts[i]));
      }
      incrementalTrust = streamed.hex() === expected;
    } catch (error) {
      incrementalTrust = false;
    }
    return incrementalTrust;
  }

  async function streamFileDigest(file, onProgress) {
    var hasher = new Sha256Stream();
    var CHUNK = 4 * 1024 * 1024;
    var read = 0;
    if (onProgress) onProgress(0, file.size);
    while (read < file.size) {
      var end = Math.min(read + CHUNK, file.size);
      var buffer = await file.slice(read, end).arrayBuffer();
      hasher.update(new Uint8Array(buffer));
      read = end;
      if (onProgress) onProgress(read, file.size);
      // Yield to the event loop so the progress bar actually paints.
      await new Promise(function (resolve) { setTimeout(resolve, 0); });
    }
    return hasher.hex();
  }

  /**
   * Below this, buffering the whole file is cheap and the native digest returns
   * faster than a progress bar could usefully render. Above it, the allocation
   * is worth avoiding and the wait is long enough to need feedback — the
   * ~120 MB portable takes about four seconds streamed, against a silent
   * whole-file allocation the other way.
   */
  var STREAMING_THRESHOLD_BYTES = 32 * 1024 * 1024;

  async function subtleFileDigest(file, onProgress) {
    if (onProgress) onProgress(0, file.size);
    var digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    if (onProgress) onProgress(file.size, file.size);
    return hex(digest);
  }

  async function hashLocalFile(file, onProgress) {
    if (file.size >= STREAMING_THRESHOLD_BYTES && await incrementalDigestTrustworthy()) {
      return streamFileDigest(file, onProgress);
    }
    // Fail safe: the platform digest beats a streaming implementation that just
    // failed its own agreement check, and beats it for small files anyway.
    return subtleFileDigest(file, onProgress);
  }

  function formatBytes(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    // MB/GB, not MiB/GiB: this number is compared against what Windows Explorer
    // shows next to the downloaded file, and Explorer says MB.
    var mib = n / (1024 * 1024);
    var pretty = mib >= 1024 ? (mib / 1024).toFixed(2) + " GB" : mib.toFixed(1) + " MB";
    return pretty + " (" + n.toLocaleString("en-US") + " bytes)";
  }

  /**
   * Reports whether the file was matched by its own name or only compared
   * against the primary artifact as a fallback. Without that distinction any
   * unrelated file a tester dropped was compared to the installer and reported
   * as "do not run this file", and the page's own "nothing to compare against"
   * branch could never be reached.
   */
  function expectedDigestFor(release, fileName) {
    if (!release || !release.artifactDigests) return null;
    if (release.artifactDigests[fileName]) {
      return { digest: release.artifactDigests[fileName], namedAsset: true };
    }
    if (release.primaryArtifact && release.artifactDigests[release.primaryArtifact]) {
      return { digest: release.artifactDigests[release.primaryArtifact], namedAsset: false };
    }
    return null;
  }

  function wireHashing(release) {
    var input = document.getElementById("file-input");
    var status = document.querySelector("[data-hash-status]");
    if (!input || !status) return;
    var dropzone = document.querySelector("[data-dropzone]");
    var progressWrap = document.querySelector("[data-hash-progress]");
    var progressBar = document.querySelector("[data-hash-progress] span");
    var verdict = document.querySelector("[data-hash-verdict]");
    var busy = false;

    function showVerdict(state, headline, detail) {
      if (!verdict) return;
      verdict.hidden = false;
      verdict.setAttribute("data-verdict", state);
      verdict.innerHTML = "";
      var strong = document.createElement("strong");
      strong.textContent = headline;
      verdict.appendChild(strong);
      if (detail) {
        var p = document.createElement("span");
        p.textContent = detail;
        verdict.appendChild(p);
      }
    }

    async function verifyFile(file) {
      if (!file || busy) return;
      busy = true;
      if (verdict) verdict.hidden = true;
      if (progressWrap) progressWrap.hidden = false;
      status.removeAttribute("data-state");
      try {
        var digest = await hashLocalFile(file, function (done, total) {
          var pct = total > 0 ? Math.round((done / total) * 100) : 0;
          if (progressBar) progressBar.style.width = pct + "%";
          if (progressBar && progressBar.parentNode) {
            progressBar.parentNode.setAttribute("aria-valuenow", String(pct));
          }
          status.textContent = "Hashing " + file.name + " locally… " + pct + "%";
        });
        if (progressWrap) progressWrap.hidden = true;
        var expected = expectedDigestFor(release, file.name);
        var streamed = incrementalTrust === true && file.size >= STREAMING_THRESHOLD_BYTES;
        var how = streamed ? "streamed in 4 MiB chunks" : "hashed with the browser digest";
        var primary = (release && release.primaryArtifact) || "the signed installer";
        if (!expected) {
          status.textContent = "SHA-256 " + digest;
          showVerdict("unknown", "Hashed, but there is nothing to compare it to.",
            "The signed tip lists no artifact digests, so this hash cannot be checked here.");
        } else if (digest === expected.digest) {
          status.textContent = "SHA-256 " + digest;
          showVerdict("match", "Match — this is the signed file.", expected.namedAsset
            ? file.name + " " + how + " in your browser. It matches the signed release index exactly. Safe to run."
            : file.name + " is not named like a release asset, but its contents " + how
              + " match " + primary + " exactly. Safe to run.");
        } else if (expected.namedAsset) {
          status.textContent = "Local " + digest + " · expected " + expected.digest;
          showVerdict("mismatch", "Does not match — do not run this file.",
            file.name + " does not hash to the signed digest. Delete it and download again from the front door.");
        } else {
          // Not a release asset name and not the installer's bytes either —
          // saying "do not run this file" would be a verdict on the wrong file.
          status.textContent = "SHA-256 " + digest;
          showVerdict("unknown", "This is not the signed installer.",
            file.name + " is not a release asset name, and its contents do not match " + primary
              + " either. If you meant to check the installer, drop that file instead.");
        }
      } catch (error) {
        if (progressWrap) progressWrap.hidden = true;
        status.textContent = "Local hashing failed";
        status.setAttribute("data-state", "blocked");
        showVerdict("mismatch", "Could not hash that file.", "Nothing was uploaded. Try choosing it again.");
      } finally {
        busy = false;
      }
    }

    input.addEventListener("change", function () {
      verifyFile(input.files && input.files[0]);
    });

    // The label has always said "drop a file here" while nothing listened for a
    // drop, so the browser navigated away from the page and opened the file.
    if (dropzone) {
      ["dragenter", "dragover"].forEach(function (name) {
        dropzone.addEventListener(name, function (event) {
          event.preventDefault();
          dropzone.setAttribute("data-dragging", "true");
        });
      });
      ["dragleave", "dragend"].forEach(function (name) {
        dropzone.addEventListener(name, function () {
          dropzone.removeAttribute("data-dragging");
        });
      });
      dropzone.addEventListener("drop", function (event) {
        event.preventDefault();
        dropzone.removeAttribute("data-dragging");
        var dropped = event.dataTransfer && event.dataTransfer.files;
        if (dropped && dropped.length) verifyFile(dropped[0]);
      });
    }
    // A drop that misses the zone must not navigate away mid-verification.
    ["dragover", "drop"].forEach(function (name) {
      window.addEventListener(name, function (event) {
        if (dropzone && dropzone.contains(event.target)) return;
        event.preventDefault();
      });
    });
  }

  /** Copy-to-clipboard for the long hex values a tester has to compare by eye. */
  function wireCopyButtons() {
    document.querySelectorAll("[data-copy]").forEach(function (node) {
      if (node.querySelector(".copy-button")) return;
      // Capture the value before the button joins the element, so the button's
      // own label can never end up in what gets copied.
      var value = (node.getAttribute("data-copy-value") || node.textContent || "").trim();
      if (!value || value === "unavailable") return;
      node.setAttribute("data-copy-value", value);

      var label = document.createElement("span");
      label.className = "copy-value";
      label.textContent = value;

      var button = document.createElement("button");
      button.type = "button";
      button.className = "copy-button";
      button.textContent = "Copy";
      button.setAttribute("aria-label", "Copy value to clipboard");

      node.textContent = "";
      node.appendChild(label);
      node.appendChild(button);

      button.addEventListener("click", async function (event) {
        event.preventDefault();
        try {
          await navigator.clipboard.writeText(value);
          button.textContent = "Copied";
        } catch (error) {
          // Clipboard access can be refused (insecure context, permissions).
          // Select the value so the keyboard shortcut still works instead of
          // telling the tester to press a key that would copy nothing.
          try {
            var range = document.createRange();
            range.selectNodeContents(label);
            var selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            button.textContent = "Selected — Ctrl+C";
          } catch (selectError) {
            button.textContent = "Select manually";
          }
        }
        setTimeout(function () { button.textContent = "Copy"; }, 2000);
      });
    });
  }

  function githubReleaseUrl(release) {
    var tag = release.githubReleaseTag || ("storage-preview-" + release.version);
    var repo = release.githubRepository || "Dhenz14/HivePoA-Distribution";
    return "https://github.com/" + repo + "/releases/tag/" + encodeURIComponent(tag);
  }

  function githubAssetUrl(release, assetName) {
    var tag = release.githubReleaseTag;
    var repo = release.githubRepository || "Dhenz14/HivePoA-Distribution";
    if (!tag || !assetName) return null;
    return "https://github.com/" + repo + "/releases/download/"
      + encodeURIComponent(tag) + "/" + encodeURIComponent(assetName);
  }

  function isPrivateOrLocalHostUrl(url) {
    try {
      var parsed = new URL(url);
      var host = String(parsed.hostname || "").toLowerCase();
      if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
      if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
      if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
      if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
      return false;
    } catch (error) {
      return true;
    }
  }

  async function probeUrl(url, expectedSha256) {
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = null;
    try {
      if (controller) {
        timer = setTimeout(function () {
          try { controller.abort(); } catch (error) { /* ignore */ }
        }, 8000);
      }
      var response = await fetch(url, {
        method: "GET",
        cache: "no-store",
        signal: controller ? controller.signal : undefined,
      });
      if (!response.ok) return { ok: false, status: response.status };
      var buffer = await response.arrayBuffer();
      if (expectedSha256) {
        var digest = await sha256Hex(buffer);
        if (digest !== expectedSha256) {
          return { ok: false, status: response.status, reason: "sha256 mismatch" };
        }
      }
      return { ok: true, status: response.status, url: url, buffer: buffer };
    } catch (error) {
      return { ok: false, reason: String(error && error.message || error) };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function resolveIpfsManifest(release) {
    var candidates = [];
    function pushCandidate(url) {
      if (!url || isPrivateOrLocalHostUrl(url)) return;
      if (candidates.indexOf(url) !== -1) return;
      candidates.push(url);
    }

    // 1) Optional unsigned live tip (cloudflared URL rotates); still sha256-checked.
    try {
      var tipResp = await fetch(new URL("../gateway.json", window.location.href).toString(), {
        cache: "no-store",
      });
      if (tipResp.ok) {
        var tip = await tipResp.json();
        if (tip && tip.ipfsGatewayBase) {
          pushCandidate(String(tip.ipfsGatewayBase).replace(/\/$/, "") + "/" + release.manifestCid);
        }
      }
    } catch (error) {
      // tip is optional
    }

    // 2) Pages cid-mirror + GitHub manifest asset before flaky public gateways.
    if (release.cidMirrorPath) {
      pushCandidate(new URL("../" + release.cidMirrorPath, window.location.href).toString());
    }
    var asset = githubAssetUrl(release, release.githubManifestAsset);
    if (asset) pushCandidate(asset);

    // 3) Signed public gateways only (skip LAN/RFC1918 — remote friends cannot use them).
    var gateways = (release.ipfsGateways && release.ipfsGateways.length)
      ? release.ipfsGateways.slice()
      : [];
    gateways.forEach(function (gw) {
      pushCandidate(String(gw).replace(/\/$/, "") + "/" + release.manifestCid);
    });

    for (var i = 0; i < candidates.length; i += 1) {
      var result = await probeUrl(candidates[i], release.manifestSha256);
      if (result.ok) {
        try {
          result.manifest = JSON.parse(new TextDecoder().decode(result.buffer));
        } catch (error) {
          result.manifest = null;
        }
        return result;
      }
    }
    return { ok: false, reason: "no reachable public IPFS/mirror source passed sha256 check" };
  }

  /**
   * The content address of the package itself, when the release actually
   * published one.
   *
   * Preferred source is the SIGNED index entry: `primaryArtifactCid` is covered
   * by the operator signature this page already verified, so it needs no
   * further trust and no network round-trip. storage-preview.5 is the first tip
   * to carry it.
   *
   * The manifest fallbacks are for older releases: .1 carried a CID per
   * artifact in `signed.artifacts[]`, and the `github-primary-manifest.v1`
   * shape carries `primaryArtifactCid` at the top level. A release that
   * published neither is metadata-only, and this returns null so the page says
   * so instead of implying an IPFS package exists.
   */
  function packageCidFromRelease(release, manifest) {
    if (release && typeof release.primaryArtifactCid === "string" && release.primaryArtifactCid) {
      return { cid: release.primaryArtifactCid, bytes: release.bytes };
    }
    var name = release && release.primaryArtifact;
    var artifacts = manifest && manifest.signed && manifest.signed.artifacts;
    if (Array.isArray(artifacts) && name) {
      for (var i = 0; i < artifacts.length; i += 1) {
        var entry = artifacts[i];
        if (entry && entry.name === name && typeof entry.cid === "string" && entry.cid) {
          return { cid: entry.cid, bytes: entry.bytes };
        }
      }
    }
    if (manifest && typeof manifest.primaryArtifactCid === "string" && manifest.primaryArtifactCid
      && (!name || manifest.primaryArtifact === name)) {
      return { cid: manifest.primaryArtifactCid, bytes: manifest.bytes };
    }
    return null;
  }

  var CHANNEL_LABELS = {
    checking: "checking…",
    package: "package available",
    "metadata-only": "signed metadata only",
    unavailable: "unavailable",
  };

  function setChannelState(channel, state, detail) {
    var row = document.querySelector('[data-channel="' + channel + '"]');
    if (!row) return;
    row.setAttribute("data-state", state);
    var stateNode = row.querySelector("[data-channel-state]");
    var detailNode = row.querySelector("[data-channel-detail]");
    if (stateNode) stateNode.textContent = CHANNEL_LABELS[state] || state;
    if (detailNode) detailNode.textContent = detail || "";
  }

  /**
   * Both channels are stated up front rather than implied by two equal buttons.
   * GitHub and IPFS are not interchangeable for every build: .1 published the
   * package to IPFS, .2/.3/.4 publish only signed metadata there.
   */
  async function renderChannels(release) {
    // Only the download page carries the channel table; everywhere else this
    // would be a network round-trip for markup that does not exist.
    if (!document.querySelector("[data-channels]")) return;
    setChannelState("github", "package",
      release.primaryArtifact + " · " + formatBytes(release.bytes));
    // The signed index already states whether a package CID exists, and that
    // claim is covered by the signature this page verified — no fetch needed.
    var signedPkg = packageCidFromRelease(release, null);
    if (signedPkg) {
      setChannelState("ipfs", "package", "Package CID " + signedPkg.cid);
      return;
    }
    setChannelState("ipfs", "checking", "Resolving the signed manifest…");
    var resolved = await resolveIpfsManifest(release);
    if (!resolved.ok) {
      setChannelState("ipfs", "unavailable",
        "No reachable IPFS source passed the SHA-256 check.");
      return;
    }
    var pkg = packageCidFromRelease(release, resolved.manifest);
    if (pkg) {
      setChannelState("ipfs", "package", "Package CID " + pkg.cid);
    } else {
      setChannelState("ipfs", "metadata-only",
        "Signed manifest only — this build's package bytes are on GitHub.");
    }
  }

  /** Public gateway URLs for a package CID, LAN gateways excluded. */
  function ipfsPackageUrls(release, cid) {
    var out = [];
    ((release.ipfsGateways && release.ipfsGateways.length) ? release.ipfsGateways : []).forEach(function (gw) {
      var url = String(gw).replace(/\/$/, "") + "/" + cid;
      if (!isPrivateOrLocalHostUrl(url) && out.indexOf(url) === -1) out.push(url);
    });
    return out;
  }

  function githubPrimaryDownloadUrl(release) {
    return githubAssetUrl(release, release.primaryArtifact) || githubReleaseUrl(release);
  }

  async function boot() {
    var loaded = readFixture();
    if (!loaded.ok) {
      failClosed(loaded.reason);
      return;
    }
    var auth = await verifySignatures(loaded.index);
    fillMeta(auth.release, loaded.index.signed);
    fillList(loaded.index.signed);
    fillArtifactTable(auth.release);
    var ceiling = document.querySelector("[data-capability-ceiling]");
    if (ceiling && loaded.index.signed && loaded.index.signed.capabilityCeilingText) {
      ceiling.textContent = "Capability ceiling: " + loaded.index.signed.capabilityCeilingText;
    }
    if (!auth.ok) {
      failClosed(auth.reason);
      wireHashing(auth.release);
      wireCopyButtons();
      return;
    }

    var status = document.querySelector("[data-status]");
    if (status) status.textContent = "Signed dual-channel index verified. Downloads enabled.";
    var github = document.getElementById("btn-github");
    var ipfs = document.getElementById("btn-ipfs");
    var release = auth.release;
    if (github) {
      github.disabled = false;
      github.textContent = release.primaryArtifact
        ? ("Download " + release.primaryArtifact)
        : "Download via GitHub Releases";
      github.addEventListener("click", function () {
        // One click → portable exe bytes. Do not drop grandma on a tag page.
        window.location.href = githubPrimaryDownloadUrl(release);
      });
    }
    if (ipfs) {
      ipfs.disabled = false;
      ipfs.addEventListener("click", async function () {
        if (status) status.textContent = "Resolving the signed manifest over IPFS…";
        ipfs.disabled = true;
        var resolved = await resolveIpfsManifest(release);
        if (!resolved.ok) {
          // Scoped to this channel: GitHub still has the bytes, so do not
          // fail-closed the whole page over an unreachable gateway.
          setChannelState("ipfs", "unavailable",
            "No reachable IPFS source passed the SHA-256 check. Use the GitHub download above.");
          if (status) status.textContent = "IPFS unreachable — the GitHub download above still works.";
          ipfs.disabled = false;
          return;
        }
        var pkg = packageCidFromRelease(release, resolved.manifest);
        if (!pkg) {
          setChannelState("ipfs", "metadata-only",
            "This build published signed metadata to IPFS, not the package. The bytes are on GitHub.");
          if (status) {
            status.textContent = "Signed manifest verified over IPFS. This build does not publish "
              + "the package itself to IPFS — use the GitHub download above.";
          }
          ipfs.disabled = false;
          return;
        }
        var urls = ipfsPackageUrls(release, pkg.cid);
        if (!urls.length) {
          setChannelState("ipfs", "unavailable", "The signed index lists no public IPFS gateway.");
          ipfs.disabled = false;
          return;
        }
        setChannelState("ipfs", "package", "Package CID " + pkg.cid);
        if (status) {
          status.textContent = "Manifest verified. Fetching " + release.primaryArtifact
            + " from IPFS — check its SHA-256 on Verify before running it.";
        }
        window.location.href = urls[0];
      });
    }
    wireHashing(release);
    wireCopyButtons();
    void renderChannels(release);
  }

  boot();
}());
