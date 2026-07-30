(function () {
  "use strict";

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
    if (github) github.disabled = true;
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
    var signed = index.signed;
    if (!signed.expiresAt || Date.now() >= Date.parse(signed.expiresAt)) {
      return { ok: false, reason: "expired or missing expiry" };
    }
    if (!Array.isArray(signed.releases) || signed.releases.length < 1) {
      return { ok: false, reason: "no releases in index" };
    }
    var selected = signed.releases.find(function (item) { return item.revoked !== true; });
    if (!selected) return { ok: false, reason: "all releases revoked" };
    if (signed.mirrorParity !== true) {
      return { ok: false, reason: "mirror parity not proven in signed index" };
    }
    if (!selected.githubReleaseTag || !selected.manifestCid || !selected.manifestSha256) {
      return { ok: false, reason: "release missing dual-channel pointers" };
    }

    var payload = new TextEncoder().encode(canonicalStringify(signed));
    var keyBytes = pemToSpki(bootstrap.publicKeyPem);
    var keyHash = await sha256Hex(keyBytes);
    if (keyHash !== bootstrap.publicKeySha256) {
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
    set("bytes", release.bytes != null ? String(release.bytes) : "see manifest");
    set("sha256", digest || release.manifestSha256 || "unavailable");
    set("signer", (signed && signed.signer) || "signed index");
    set("ceiling", (signed && signed.capabilityCeilingText) || "storage-preview only");
  }

  function fillList(signed) {
    var list = document.querySelector("[data-release-list]");
    if (!list || !signed) return;
    list.innerHTML = "";
    signed.releases.forEach(function (release) {
      var li = document.createElement("li");
      li.textContent = release.version + " · seq " + release.releaseSequence + " · " + release.channel
        + (release.revoked ? " · REVOKED" : "");
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
      tdHash.innerHTML = "<code>" + release.artifactDigests[name] + "</code>";
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

  async function hashLocalFile(file) {
    var buffer = await file.arrayBuffer();
    var digest = await crypto.subtle.digest("SHA-256", buffer);
    return hex(digest);
  }

  function wireHashing(release) {
    var input = document.getElementById("file-input");
    var status = document.querySelector("[data-hash-status]");
    if (!input || !status) return;
    input.addEventListener("change", async function () {
      var file = input.files && input.files[0];
      if (!file) return;
      status.textContent = "Hashing locally…";
      try {
        var digest = await hashLocalFile(file);
        var expected = null;
        if (release && release.artifactDigests && release.artifactDigests[file.name]) {
          expected = release.artifactDigests[file.name];
        } else if (release && release.primaryArtifact && release.artifactDigests) {
          expected = release.artifactDigests[release.primaryArtifact];
        }
        if (expected && digest === expected) {
          status.textContent = "Match for " + file.name + ": " + digest;
          status.removeAttribute("data-state");
        } else if (expected) {
          status.textContent = "Mismatch for " + file.name + ". Local=" + digest + " expected=" + expected;
          status.setAttribute("data-state", "blocked");
        } else {
          status.textContent = "Local SHA-256 (" + file.name + "): " + digest
            + " — rename to a known release asset for automatic match, or compare against SHA256SUMS.";
        }
      } catch (error) {
        status.textContent = "Local hashing failed";
        status.setAttribute("data-state", "blocked");
      }
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

  async function probeUrl(url, expectedSha256) {
    try {
      var response = await fetch(url, { method: "GET", cache: "no-store" });
      if (!response.ok) return { ok: false, status: response.status };
      var buffer = await response.arrayBuffer();
      if (expectedSha256) {
        var digest = await sha256Hex(buffer);
        if (digest !== expectedSha256) {
          return { ok: false, status: response.status, reason: "sha256 mismatch" };
        }
      }
      return { ok: true, status: response.status, url: url };
    } catch (error) {
      return { ok: false, reason: String(error && error.message || error) };
    }
  }

  async function resolveIpfsManifest(release) {
    var candidates = [];
    // Optional unsigned live tip (cloudflared URL rotates); still sha256-checked.
    try {
      var tipResp = await fetch(new URL("../gateway.json", window.location.href).toString(), {
        cache: "no-store",
      });
      if (tipResp.ok) {
        var tip = await tipResp.json();
        if (tip && tip.ipfsGatewayBase) {
          candidates.push(String(tip.ipfsGatewayBase).replace(/\/$/, "") + "/" + release.manifestCid);
        }
      }
    } catch (error) {
      // tip is optional
    }
    var gateways = (release.ipfsGateways && release.ipfsGateways.length)
      ? release.ipfsGateways.slice()
      : [];
    gateways.forEach(function (gw) {
      candidates.push(String(gw).replace(/\/$/, "") + "/" + release.manifestCid);
    });
    if (release.cidMirrorPath) {
      candidates.push(new URL("../" + release.cidMirrorPath, window.location.href).toString());
    }
    var asset = githubAssetUrl(release, release.githubManifestAsset);
    if (asset) candidates.push(asset);

    for (var i = 0; i < candidates.length; i += 1) {
      var result = await probeUrl(candidates[i], release.manifestSha256);
      if (result.ok) return result;
    }
    return { ok: false, reason: "no reachable IPFS/mirror source passed sha256 check" };
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
      return;
    }

    var status = document.querySelector("[data-status]");
    if (status) status.textContent = "Signed dual-channel index verified. Downloads enabled.";
    var github = document.getElementById("btn-github");
    var ipfs = document.getElementById("btn-ipfs");
    var release = auth.release;
    if (github) {
      github.disabled = false;
      github.addEventListener("click", function () {
        window.location.href = githubReleaseUrl(release);
      });
    }
    if (ipfs) {
      ipfs.disabled = false;
      ipfs.addEventListener("click", async function () {
        if (status) status.textContent = "Resolving IPFS manifest via gateways/mirrors…";
        ipfs.disabled = true;
        var resolved = await resolveIpfsManifest(release);
        if (!resolved.ok) {
          failClosed(resolved.reason || "IPFS resolve failed");
          github.disabled = false;
          return;
        }
        if (status) status.textContent = "IPFS manifest verified at " + resolved.url;
        window.location.href = resolved.url;
      });
    }
    wireHashing(release);
  }

  boot();
}());
