// The little JavaScript the portal needs. Every page works without it except the video upload.
export const js = String.raw`
(() => {
  // Public writes. A POST to a route under routes.challenge without a solved challenge gets a
  // 403 CHALLENGE_REQUIRED carrying one: find n with sha256(salt + n) = challenge and send again
  // with the solution in X-Altcha. fetch always goes through this; forms do on pages marked
  // data-challenge, and are sent again with the solution in the altcha field.
  const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
  const solve = async (c) => {
    const enc = new TextEncoder();
    for (let n = 0; n <= c.maxnumber; n++)
      if (hex(await crypto.subtle.digest("SHA-256", enc.encode(c.salt + n))) === c.challenge)
        return btoa(JSON.stringify({ algorithm: c.algorithm, challenge: c.challenge, number: n, salt: c.salt, signature: c.signature }));
    throw new Error("The challenge could not be solved.");
  };
  const challengeOf = async (res) => (res.status === 403 ? ((await res.clone().json().catch(() => ({}))).error || {}) : {}).details?.challenge;
  const plainFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const res = await plainFetch(input, init);
    const c = await challengeOf(res);
    if (!c) return res;
    const headers = new Headers(init.headers);
    headers.set("X-Altcha", await solve(c));
    return plainFetch(input, { ...init, headers });
  };
  const hidden = (name, value) => Object.assign(document.createElement("input"), { type: "hidden", name, value });

  // Ask before anything that removes work.
  document.addEventListener("submit", (e) => {
    const msg = e.target.getAttribute("data-confirm");
    if (msg && !confirm(msg)) e.preventDefault();
  });

  if (document.documentElement.hasAttribute("data-challenge"))
    document.addEventListener("submit", async (e) => {
      const form = e.target;
      if (e.defaultPrevented || form.method !== "post" || form.dataset.solved) return;
      e.preventDefault();
      const res = await plainFetch(form.action, { method: "POST", body: new URLSearchParams(new FormData(form, e.submitter)) });
      const c = await challengeOf(res);
      if (c) {
        if (e.submitter?.name) form.append(hidden(e.submitter.name, e.submitter.value));
        form.append(hidden("altcha", await solve(c)));
        form.dataset.solved = "1";
        return form.submit();
      }
      if (res.redirected) return location.assign(res.url);
      document.open();
      document.write(await res.text());
      document.close();
    });

  // Copy buttons.
  document.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
    const field = document.getElementById(b.getAttribute("data-copy"));
    try { await navigator.clipboard.writeText(field.value); } catch { field.select(); document.execCommand("copy"); }
    const label = b.querySelector(".label");
    if (label) { const was = label.textContent; label.textContent = "Copied"; setTimeout(() => (label.textContent = was), 1500); }
  }));

  // Write / Preview tabs on the lesson editor.
  document.querySelectorAll("[data-preview]").forEach((root) => {
    const area = root.querySelector("textarea");
    const out = root.querySelector(".preview");
    const tabs = root.querySelectorAll(".tabs button");
    tabs.forEach((t) => t.addEventListener("click", async () => {
      tabs.forEach((x) => x.setAttribute("aria-selected", String(x === t)));
      const preview = t.dataset.tab === "preview";
      area.hidden = preview; out.hidden = !preview;
      if (preview) {
        out.innerHTML = "<p class=muted>Loading…</p>";
        const res = await fetch("/edit/preview", { method: "POST", headers: { "content-type": "text/plain" }, body: area.value });
        out.innerHTML = res.ok ? await res.text() : "<p class=muted>Preview is not available right now.</p>";
      }
    }));
  });

  // Video upload: the app asks Whisk for a one-off upload address, the browser sends the file
  // straight to storage, then the app stores the upload id on the lesson.
  document.querySelectorAll("[data-upload]").forEach((box) => {
    const input = box.querySelector("input[type=file]");
    const status = box.querySelector(".status");
    const bar = box.querySelector(".bar i");
    const lesson = box.getAttribute("data-upload");
    input.addEventListener("change", async () => {
      const file = input.files[0];
      if (!file) return;
      status.textContent = "Getting ready…";
      box.querySelector(".bar").hidden = false;
      const ask = await fetch("/edit/lessons/" + lesson + "/upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filename: file.name, content_type: file.type || "video/mp4", size: file.size }) });
      const up = await ask.json().catch(() => ({}));
      if (!ask.ok) { status.textContent = up.error || "The upload could not start."; return; }
      const form = new FormData();
      Object.entries(up.fields || {}).forEach(([k, v]) => form.append(k, v));
      form.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", up.url);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) { const p = Math.round((e.loaded / e.total) * 100); bar.style.width = p + "%"; status.textContent = "Uploading… " + p + "%"; } };
      xhr.onerror = () => (status.textContent = "The upload failed. Check your connection and try again.");
      xhr.onload = async () => {
        if (xhr.status >= 300) { status.textContent = "Storage refused the file (" + xhr.status + ")."; return; }
        status.textContent = "Saving…";
        const save = await fetch("/edit/lessons/" + lesson + "/video", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ upload_id: up.id }) });
        if (save.ok) location.reload(); else status.textContent = "Uploaded, but the lesson could not be saved. Try again.";
      };
      xhr.send(form);
    });
  });

  // Coursework: each chosen file gets its own upload address and goes straight to storage;
  // the form then hands in the list of uploads.
  document.querySelectorAll("[data-coursework]").forEach((form) => {
    const ask = form.getAttribute("data-coursework");
    const input = form.querySelector("input[type=file]");
    const list = form.querySelector(".files.pending");
    const hidden = form.querySelector("input[name=files]");
    const submit = form.querySelector("button.primary");
    const status = form.querySelector(".status");
    const done = new Map();
    let busy = 0;
    const refresh = () => {
      hidden.value = JSON.stringify([...done.keys()]);
      submit.disabled = busy > 0 || done.size === 0;
    };
    const size = (n) => n < 1048576 ? Math.max(1, Math.round(n / 1024)) + " KB" : (n / 1048576).toFixed(1) + " MB";
    const upload = async (file) => {
      if (done.size + busy >= 10) { status.textContent = "Hand in at most 10 files."; return; }
      const li = document.createElement("li");
      const name = document.createElement("span"); name.className = "name"; name.textContent = file.name;
      const right = document.createElement("span"); right.className = "small muted"; right.textContent = size(file.size);
      const bar = document.createElement("div"); bar.className = "bar"; bar.innerHTML = "<i style='width:0%'></i>";
      li.append(name, bar, right); list.append(li);
      if (file.size > 200 * 1048576) { li.classList.add("failed"); bar.remove(); right.textContent = "Over 200 MB"; return; }
      busy++; refresh();
      const fail = (why) => { li.classList.add("failed"); bar.remove(); right.textContent = why; busy--; refresh(); };
      const res = await fetch(ask, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filename: file.name, content_type: file.type, size: file.size }) }).catch(() => null);
      const up = res ? await res.json().catch(() => ({})) : {};
      if (!res || !res.ok) return fail(up.error || "Could not start");
      const data = new FormData();
      Object.entries(up.fields || {}).forEach(([k, v]) => data.append(k, v));
      data.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", up.url);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) bar.firstChild.style.width = Math.round((e.loaded / e.total) * 100) + "%"; };
      xhr.onerror = () => fail("Upload failed");
      xhr.onload = () => {
        if (xhr.status >= 300) return fail("Storage refused it");
        busy--; done.set(up.id, file.name); bar.remove();
        const remove = document.createElement("button");
        remove.type = "button"; remove.className = "icon-btn"; remove.setAttribute("aria-label", "Remove " + file.name); remove.textContent = "✕";
        remove.addEventListener("click", () => { done.delete(up.id); li.remove(); refresh(); });
        li.append(remove); refresh();
      };
      xhr.send(data);
    };
    input.addEventListener("change", () => { [...input.files].forEach(upload); input.value = ""; });
    form.addEventListener("submit", () => { submit.disabled = true; submit.textContent = "Handing in…"; });
  });

  // Confetti for a finished course.
  const canvas = document.getElementById("confetti");
  if (canvas && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const ctx = canvas.getContext("2d");
    const dpr = devicePixelRatio || 1;
    const size = () => { canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; };
    size(); addEventListener("resize", size);
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#e85d2a";
    const colors = [accent, "#f6c344", "#4cb3a3", "#6c7ce0", "#ef6f9a"];
    const bits = Array.from({ length: 160 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 16 - 6,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, c: colors[Math.floor(Math.random() * colors.length)],
    }));
    let frames = 0;
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      bits.forEach((b) => {
        b.vy += 0.35; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.r += b.vr;
        ctx.save(); ctx.translate(b.x * dpr, b.y * dpr); ctx.rotate(b.r); ctx.fillStyle = b.c;
        ctx.fillRect((-b.w / 2) * dpr, (-b.h / 2) * dpr, b.w * dpr, b.h * Math.cos(frames / 6 + b.r) * dpr); ctx.restore();
      });
      if (++frames < 260) requestAnimationFrame(tick); else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    requestAnimationFrame(tick);
  }
})();
`;
