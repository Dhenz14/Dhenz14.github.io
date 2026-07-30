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

  function authorize(index) {
    if (!index || index.schemaVersion !== 1) return { ok: false, reason: "unsupported index schema" };
    if (!index.signed || !Array.isArray(index.signatures) || index.signatures.length < 1) {
      return { ok: false, reason: "missing signatures" };
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
    if (index._fixtureAuthorization !== true) {
      // Pages embeds fixtures only. Real publication authority is separate.
      return { ok: false, reason: "v2 publication authority not granted for Pages front door" };
    }
    if (index._mirrorParity !== true) {
      return { ok: false, reason: "mirror parity not proven" };
    }
    return { ok: true, release: selected, signed: signed };
  }

  function fillMeta(release, signed) {
    function set(field, value) {
      document.querySelectorAll('[data-field="' + field + '"]').forEach(function (node) {
        node.textContent = value;
      });
    }
    if (!release) return;
    set("version", release.version || "unavailable");
    set("platform", release.platform || "windows/linux");
    set("architecture", release.architecture || "x64");
    set("bytes", release.bytes != null ? String(release.bytes) : "see manifest");
    set("sha256", release.sha256 || release.manifestSha256 || "unavailable");
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

  function wireHashing(expected) {
    var input = document.getElementById("file-input");
    var status = document.querySelector("[data-hash-status]");
    if (!input || !status) return;
    input.addEventListener("change", async function () {
      var file = input.files && input.files[0];
      if (!file) return;
      status.textContent = "Hashing locally…";
      try {
        var digest = await hashLocalFile(file);
        if (expected && digest === expected) {
          status.textContent = "Match: " + digest;
        } else if (expected) {
          status.textContent = "Mismatch. Local=" + digest + " expected=" + expected;
          status.setAttribute("data-state", "blocked");
        } else {
          status.textContent = "Local SHA-256: " + digest;
        }
      } catch (error) {
        status.textContent = "Local hashing failed";
        status.setAttribute("data-state", "blocked");
      }
    });
  }

  var loaded = readFixture();
  if (!loaded.ok) {
    failClosed(loaded.reason);
    return;
  }
  var auth = authorize(loaded.index);
  fillMeta(auth.release, loaded.index.signed);
  fillList(loaded.index.signed);
  var ceiling = document.querySelector("[data-capability-ceiling]");
  if (ceiling && loaded.index.signed && loaded.index.signed.capabilityCeilingText) {
    ceiling.textContent = "Capability ceiling: " + loaded.index.signed.capabilityCeilingText;
  }
  if (!auth.ok) {
    failClosed(auth.reason);
  } else {
    var status = document.querySelector("[data-status]");
    if (status) status.textContent = "Authorized for dual-channel download buttons.";
    var github = document.getElementById("btn-github");
    var ipfs = document.getElementById("btn-ipfs");
    var release = auth.release;
    if (github) {
      github.disabled = false;
      github.addEventListener("click", function () {
        var tag = release.githubReleaseTag || ("storage-preview-" + release.version);
        var repo = release.githubRepository || "Dhenz14/HivePoA-Distribution";
        window.location.href = "https://github.com/" + repo + "/releases/tag/" + encodeURIComponent(tag);
      });
    }
    if (ipfs) {
      ipfs.disabled = false;
      ipfs.addEventListener("click", function () {
        var cid = release.manifestCid;
        var gateways = (release.ipfsGateways && release.ipfsGateways.length)
          ? release.ipfsGateways
          : ["https://dweb.link/ipfs"];
        if (!cid) {
          failClosed("missing manifest CID");
          return;
        }
        window.location.href = gateways[0].replace(/\/$/, "") + "/" + cid;
      });
    }
  }
  wireHashing(auth.release && (auth.release.sha256 || auth.release.manifestSha256));
}());
