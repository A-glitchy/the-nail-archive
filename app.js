(() => {
  const cfg = window.NAIL_ARCHIVE_CONFIG || {};
  const configured = cfg.supabaseUrl && !cfg.supabaseUrl.startsWith("ADD_") && cfg.supabaseAnonKey && !cfg.supabaseAnonKey.startsWith("ADD_");
  const $ = id => document.getElementById(id);

  let db, user;
  let inspirations = [], diary = [];
  let activeView = "all", activeSeason = "all", signingUp = false;
  let signedUrlCache = new Map();

  let inspoEditor = null, diaryEditor = null;
  let mixSelection = [];
  let lbItems = [], lbIndex = 0, touchStartX = 0;

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const show = (id, on) => $(id).classList.toggle("hidden", !on);
  const msg = (id, s) => { $(id).textContent = s; };

  function init() {
    if (!configured || !window.supabase) {
      $("auth-heading").textContent = "Almost ready";
      msg("auth-message", "Connect your Supabase project using the README setup guide.");
      $("auth-submit").disabled = true;
      $("auth-toggle").disabled = true;
      return;
    }
    db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    db.auth.getSession().then(({ data }) => setSession(data.session));
    db.auth.onAuthStateChange((_e, s) => setSession(s));

    $("auth-form").addEventListener("submit", authSubmit);
    $("auth-toggle").onclick = () => {
      signingUp = !signingUp;
      $("auth-heading").textContent = signingUp ? "Create your account" : "Welcome back";
      $("auth-submit").textContent = signingUp ? "Create account" : "Sign in";
      $("auth-toggle").textContent = signingUp ? "Already have an account? Sign in" : "New here? Create an account";
      msg("auth-message", "");
    };
    $("signout").onclick = () => db.auth.signOut();

    document.querySelectorAll(".main-tab").forEach(b => b.onclick = () => setView(b.dataset.view));
    document.querySelectorAll(".season").forEach(b => b.onclick = () => {
      activeSeason = b.dataset.season;
      document.querySelectorAll(".season").forEach(x => x.classList.toggle("active", x === b));
      renderInspirations();
    });

    $("add-inspo").onclick = () => {
      $("inspo-form").reset();
      $("inspo-editor-box").classList.add("hidden");
      inspoEditor = null;
      msg("inspo-message", "");
      $("inspo-dialog").showModal();
    };

    $("design-photos").addEventListener("change", async e => {
      const files = [...e.target.files].filter(f => f.type.startsWith("image/"));
      inspoEditor = files.length ? await createPhotoEditor("inspo-editor-box", files) : null;
    });

    $("open-mix").onclick = openMixDialog;
    $("mix-form").addEventListener("submit", saveMixedDesign);

    $("add-diary").onclick = async () => {
      $("diary-form").reset();
      $("diary-date").value = new Date().toISOString().slice(0, 10);
      $("diary-editor-box").classList.add("hidden");
      diaryEditor = null;
      msg("diary-message", "");
      await populateDiaryInspoSelect();
      $("diary-dialog").showModal();
    };

    $("diary-photos").addEventListener("change", async e => {
      const files = [...e.target.files].filter(f => f.type.startsWith("image/"));
      diaryEditor = files.length ? await createPhotoEditor("diary-editor-box", files) : null;
    });

    document.querySelectorAll("[data-close]").forEach(b => b.onclick = () => $(b.dataset.close).close());
    $("inspo-form").addEventListener("submit", saveInspirations);
    $("diary-form").addEventListener("submit", saveDiary);

    initLightbox();
  }

  async function authSubmit(e) {
    e.preventDefault();
    msg("auth-message", "Please wait…");
    const email = $("email").value.trim(), password = $("password").value;
    const r = signingUp ? await db.auth.signUp({ email, password }) : await db.auth.signInWithPassword({ email, password });
    if (r.error) msg("auth-message", r.error.message);
    else if (signingUp && !r.data.session) msg("auth-message", "Check your email to confirm your account, then sign in.");
    else msg("auth-message", "");
  }

  async function setSession(s) {
    user = s?.user || null;
    show("auth-view", !user);
    show("app-view", !!user);
    show("signout", !!user);
    $("user-label").textContent = user?.email || "";
    if (user) await loadData();
  }

  async function loadData() {
    const [a, d] = await Promise.all([
      db.from("inspirations").select("*").order("created_at", { ascending: false }),
      db.from("manicure_entries").select("*").order("date_done", { ascending: false })
    ]);
    if (a.error || d.error) {
      alert("Could not load archive: " + (a.error || d.error).message);
      return;
    }
    inspirations = a.data || [];
    diary = d.data || [];
    $("count-all").textContent = inspirations.length;
    await Promise.all([renderInspirations(), renderDiary()]);
  }

  function setView(v) {
    activeView = v;
    document.querySelectorAll(".main-tab").forEach(b => b.classList.toggle("active", b.dataset.view === v));
    show("gallery-view", v !== "diary");
    show("diary-view", v === "diary");
  }

  async function signedPhoto(path) {
    if (!path) return "";
    if (signedUrlCache.has(path)) return signedUrlCache.get(path);
    const r = await db.storage.from("nail-photos").createSignedUrl(path, 3600);
    const url = r.error ? "" : r.data.signedUrl;
    if (url) signedUrlCache.set(path, url);
    return url;
  }

  function getInspoPhotos(row) {
    if (Array.isArray(row.photo_paths) && row.photo_paths.length) return row.photo_paths;
    return row.photo_path ? [row.photo_path] : [];
  }

  async function createPhotoEditor(containerId, files) {
    const box = $(containerId);
    box.classList.remove("hidden");
    const items = await Promise.all(files.map(file => new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve({ file, img, zoom: 1, rot: 0, offX: 0, offY: 0 });
      img.src = URL.createObjectURL(file);
    })));
    let idx = 0;

    box.innerHTML = `
      <div class="editor-tabs"></div>
      <div class="crop-stage"><canvas width="480" height="600"></canvas></div>
      <div class="crop-controls">
        <label>Zoom <input type="range" min="1" max="3" step="0.02" value="1"></label>
        <button type="button" class="rotate-btn">↻ Rotate</button>
      </div>
      <p class="field-hint" style="margin:6px 0 0">Drag photo to frame the nails.</p>
    `;

    const tabs = box.querySelector(".editor-tabs");
    const stage = box.querySelector(".crop-stage");
    const canvas = box.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const zoomInput = box.querySelector('input[type="range"]');
    const rotBtn = box.querySelector(".rotate-btn");

    function renderTabs() {
      tabs.innerHTML = items.map((_, i) => `<button type="button" class="editor-tab ${i === idx ? "active" : ""}">Photo ${i + 1}</button>`).join("");
      tabs.querySelectorAll(".editor-tab").forEach((b, i) => b.onclick = () => {
        idx = i;
        zoomInput.value = items[idx].zoom;
        renderTabs();
        draw();
      });
    }

    function drawToCanvas(targetCtx, w, h, item) {
      targetCtx.fillStyle = "#ebe7df";
      targetCtx.fillRect(0, 0, w, h);
      targetCtx.save();
      targetCtx.translate(w / 2 + item.offX * (w / 240), h / 2 + item.offY * (h / 300));
      targetCtx.rotate((item.rot * Math.PI) / 180);
      const swapped = item.rot % 180 !== 0;
      const iw = swapped ? item.img.height : item.img.width;
      const ih = swapped ? item.img.width : item.img.height;
      const baseScale = Math.max(w / iw, h / ih) * item.zoom;
      targetCtx.drawImage(item.img, (-item.img.width * baseScale) / 2, (-item.img.height * baseScale) / 2, item.img.width * baseScale, item.img.height * baseScale);
      targetCtx.restore();
    }

    function draw() { drawToCanvas(ctx, canvas.width, canvas.height, items[idx]); }

    zoomInput.oninput = () => { items[idx].zoom = Number(zoomInput.value); draw(); };
    rotBtn.onclick = () => { items[idx].rot = (items[idx].rot + 90) % 360; draw(); };

    let dragging = false, sx = 0, sy = 0;
    stage.onpointerdown = e => { dragging = true; sx = e.clientX; sy = e.clientY; stage.setPointerCapture(e.pointerId); };
    stage.onpointermove = e => {
      if (!dragging) return;
      items[idx].offX += e.clientX - sx;
      items[idx].offY += e.clientY - sy;
      sx = e.clientX; sy = e.clientY;
      draw();
    };
    stage.onpointerup = () => { dragging = false; };

    renderTabs();
    draw();

    return {
      async exportBlobs() {
        const blobs = [];
        for (const item of items) {
          const out = document.createElement("canvas");
          out.width = 960; out.height = 1200;
          drawToCanvas(out.getContext("2d"), 960, 1200, item);
          const blob = await new Promise(r => out.toBlob(r, "image/jpeg", 0.9));
          blobs.push(blob);
        }
        return blobs;
      }
    };
  }

  async function generateCollageBlob(imageSources) {
    const imgs = await Promise.all(imageSources.slice(0, 4).map(src => new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = typeof src === "string" ? src : URL.createObjectURL(src);
    })));

    const W = 960, H = 1200, gap = 10;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fffefa";
    ctx.fillRect(0, 0, W, H);

    function drawCover(img, x, y, w, h) {
      const s = Math.max(w / img.width, h / img.height);
      const dw = img.width * s, dh = img.height * s;
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      ctx.restore();
    }

    if (imgs.length === 2) {
      const half = (W - gap) / 2;
      drawCover(imgs[0], 0, 0, half, H);
      drawCover(imgs[1], half + gap, 0, half, H);
    } else if (imgs.length === 3) {
      const halfW = (W - gap) / 2, halfH = (H - gap) / 2;
      drawCover(imgs[0], 0, 0, halfW, H);
      drawCover(imgs[1], halfW + gap, 0, halfW, halfH);
      drawCover(imgs[2], halfW + gap, halfH + gap, halfW, halfH);
    } else {
      const halfW = (W - gap) / 2, halfH = (H - gap) / 2;
      drawCover(imgs[0], 0, 0, halfW, halfH);
      drawCover(imgs[1], halfW + gap, 0, halfW, halfH);
      drawCover(imgs[2], 0, halfH + gap, halfW, halfH);
      drawCover(imgs[3], halfW + gap, halfH + gap, halfW, halfH);
    }
    return new Promise(r => canvas.toBlob(r, "image/jpeg", 0.9));
  }

  async function uploadBlob(blob) {
    const path = `${user.id}/${crypto.randomUUID()}.jpg`;
    const up = await db.storage.from("nail-photos").upload(path, blob, { contentType: "image/jpeg" });
    if (up.error) throw up.error;
    return path;
  }

  async function renderInspirations() {
    const grid = $("inspo-grid");
    if (!grid) return;
    let rows = inspirations.filter(x => activeView !== "wishlist" || x.status === "wishlist");
    if (activeSeason !== "all") rows = rows.filter(x => (x.seasons || []).includes(activeSeason));
    $("result-count").textContent = `${rows.length} ${rows.length === 1 ? "set" : "sets"}`;

    if (!rows.length) {
      grid.innerHTML = '<div class="empty-state"><strong>Your archive starts here.</strong>Save a design you love or mix two sets together.</div>';
      return;
    }

    const resolved = await Promise.all(rows.map(async row => {
      const origPaths = getInspoPhotos(row);
      const origUrls = (await Promise.all(origPaths.map(signedPhoto))).filter(Boolean);
      const collageUrl = row.collage_path ? await signedPhoto(row.collage_path) : "";
      return { row, origUrls, collageUrl };
    }));

    grid.innerHTML = resolved.map(({ row, origUrls, collageUrl }, cardIdx) => {
      const hasCollage = !!collageUrl;
      const dots = origUrls.length > 1
        ? `<div class="slide-dots">${origUrls.map((_, i) => `<span class="slide-dot ${i === 0 ? "active" : ""}"></span>`).join("")}</div>`
        : "";
      const arrows = origUrls.length > 1
        ? `<button type="button" class="slide-btn prev" aria-label="Previous">‹</button><button type="button" class="slide-btn next" aria-label="Next">›</button>`
        : "";

      return `
        <article class="inspo-card" data-card="${cardIdx}">
          <div class="media-pair ${hasCollage ? "has-collage" : ""}">
            ${hasCollage ? `
              <div class="photo-wrap collage-box" data-open-lb="collage">
                <span class="media-badge">Collage</span>
                <img src="${esc(collageUrl)}" loading="lazy" alt="Collage">
              </div>
            ` : ""}
            <div class="photo-wrap slideshow-box" data-slide="0" data-open-lb="slide">
              <span class="media-badge">${origUrls.length > 1 ? `Original 1/${origUrls.length}` : "Original"}</span>
              <img src="${esc(origUrls[0] || "")}" loading="lazy" alt="Nail design">
              ${arrows}
              ${dots}
            </div>
          </div>
          <div class="card-meta">
            <div class="season-labels">${esc((row.seasons || []).join(" · ") || "ALL SEASONS")}</div>
            <button type="button" class="status-toggle" data-toggle-id="${row.id}">${row.status === "tried" ? "Tried ✓" : "Wishlist"}</button>
          </div>
        </article>
      `;
    }).join("");

    resolved.forEach(({ row, origUrls, collageUrl }, cardIdx) => {
      const card = grid.querySelector(`[data-card="${cardIdx}"]`);
      const slideBox = card.querySelector(".slideshow-box");
      const slideImg = slideBox.querySelector("img");
      const badge = slideBox.querySelector(".media-badge");
      const dots = [...slideBox.querySelectorAll(".slide-dot")];
      let currentSlide = 0;

      const setSlide = next => {
        currentSlide = (next + origUrls.length) % origUrls.length;
        slideImg.src = origUrls[currentSlide];
        badge.textContent = `Original ${currentSlide + 1}/${origUrls.length}`;
        dots.forEach((d, i) => d.classList.toggle("active", i === currentSlide));
      };

      const prevBtn = slideBox.querySelector(".prev");
      const nextBtn = slideBox.querySelector(".next");
      if (prevBtn) prevBtn.onclick = e => { e.stopPropagation(); setSlide(currentSlide - 1); };
      if (nextBtn) nextBtn.onclick = e => { e.stopPropagation(); setSlide(currentSlide + 1); };

      const allViewerUrls = collageUrl ? [collageUrl, ...origUrls] : [...origUrls];
      const collageBox = card.querySelector(".collage-box");
      if (collageBox) collageBox.onclick = () => openLightbox(allViewerUrls, 0);
      slideBox.onclick = () => openLightbox(allViewerUrls, collageUrl ? currentSlide + 1 : currentSlide);

      card.querySelector("[data-toggle-id]").onclick = async () => {
        const nextStatus = row.status === "tried" ? "wishlist" : "tried";
        const { error } = await db.from("inspirations").update({ status: nextStatus }).eq("id", row.id);
        if (!error) {
          row.status = nextStatus;
          renderInspirations();
          toast(`Moved to ${nextStatus}`);
        }
      };
    });
  }

  async function saveInspirations(e) {
    e.preventDefault();
    if (!inspoEditor) return;
    const seasons = [...document.querySelectorAll('input[name="season"]:checked')].map(x => x.value);
    const status = $("design-status").value;
    const btn = $("inspo-form").querySelector("[type=submit]");
    btn.disabled = true;
    msg("inspo-message", "Cropping & uploading…");

    try {
      const blobs = await inspoEditor.exportBlobs();
      const photoPaths = [];
      for (const b of blobs) photoPaths.push(await uploadBlob(b));

      let collagePath = null;
      if (blobs.length >= 2) {
        msg("inspo-message", "Generating collage…");
        const collageBlob = await generateCollageBlob(blobs);
        collagePath = await uploadBlob(collageBlob);
      }

      const { data, error } = await db.from("inspirations").insert({
        user_id: user.id,
        name: null,
        photo_path: photoPaths[0],
        photo_paths: photoPaths,
        collage_path: collagePath,
        seasons,
        status
      }).select().single();

      if (error) throw error;
      inspirations.unshift(data);
      $("inspo-dialog").close();
      $("count-all").textContent = inspirations.length;
      await renderInspirations();
      toast("Added to your archive.");
    } catch (err) {
      msg("inspo-message", err.message || "Upload failed.");
    } finally {
      btn.disabled = false;
    }
  }

  async function openMixDialog() {
    mixSelection = [];
    msg("mix-message", "");
    $("mix-form").reset();
    const grid = $("mix-picker-grid");
    const allPhotos = [];

    for (const row of inspirations) {
      for (const p of getInspoPhotos(row)) {
        const url = await signedPhoto(p);
        if (url) allPhotos.push({ path: p, url });
      }
    }

    if (allPhotos.length < 2) {
      toast("Save at least 2 photos first to mix designs.");
      return;
    }

    grid.innerHTML = allPhotos.map((item, i) => `
      <div class="mix-thumb" data-mix-idx="${i}">
        <img src="${esc(item.url)}" alt="Option">
      </div>
    `).join("");

    grid.querySelectorAll(".mix-thumb").forEach((el, i) => {
      el.onclick = () => {
        const existing = mixSelection.findIndex(x => x.path === allPhotos[i].path);
        if (existing >= 0) mixSelection.splice(existing, 1);
        else if (mixSelection.length < 2) mixSelection.push(allPhotos[i]);
        else { mixSelection.shift(); mixSelection.push(allPhotos[i]); }

        grid.querySelectorAll(".mix-thumb").forEach((node, idx) => {
          const order = mixSelection.findIndex(x => x.path === allPhotos[idx].path);
          node.classList.toggle("selected", order >= 0);
          const badge = node.querySelector(".mix-order");
          if (badge) badge.remove();
          if (order >= 0) node.insertAdjacentHTML("beforeend", `<span class="mix-order">${order + 1}</span>`);
        });
      };
    });

    $("mix-dialog").showModal();
  }

  async function saveMixedDesign(e) {
    e.preventDefault();
    if (mixSelection.length !== 2) {
      msg("mix-message", "Please select 2 designs to mix.");
      return;
    }
    const btn = $("mix-form").querySelector("[type=submit]");
    btn.disabled = true;
    msg("mix-message", "Creating split collage…");

    try {
      const seasons = [...document.querySelectorAll('input[name="mix-season"]:checked')].map(x => x.value);
      const collageBlob = await generateCollageBlob(mixSelection.map(x => x.url));
      const collagePath = await uploadBlob(collageBlob);
      const photoPaths = mixSelection.map(x => x.path);

      const { data, error } = await db.from("inspirations").insert({
        user_id: user.id,
        name: null,
        photo_path: photoPaths[0],
        photo_paths: photoPaths,
        collage_path: collagePath,
        seasons,
        status: "wishlist"
      }).select().single();

      if (error) throw error;
      inspirations.unshift(data);
      $("mix-dialog").close();
      $("count-all").textContent = inspirations.length;
      await renderInspirations();
      toast("Mixed design created!");
    } catch (err) {
      msg("mix-message", err.message || "Could not create mix.");
    } finally {
      btn.disabled = false;
    }
  }

  async function populateDiaryInspoSelect() {
    const sel = $("diary-inspo-link");
    sel.innerHTML = '<option value="">None</option>' + inspirations.map((x, i) => {
      const label = `Saved set #${inspirations.length - i}${x.seasons?.length ? " (" + x.seasons.join(", ") + ")" : ""}`;
      return `<option value="${x.id}">${esc(label)}</option>`;
    }).join("");
  }

  async function saveDiary(e) {
    e.preventDefault();
    const btn = $("diary-form").querySelector("[type=submit]");
    btn.disabled = true;
    msg("diary-message", "Saving…");

    try {
      let photoPaths = [];
      if (diaryEditor) {
        const blobs = await diaryEditor.exportBlobs();
        for (const b of blobs) photoPaths.push(await uploadBlob(b));
      }
      const linkedId = $("diary-inspo-link").value || null;
      if (!photoPaths.length && linkedId) {
        const linked = inspirations.find(x => x.id === linkedId);
        if (linked) photoPaths = linked.collage_path ? [linked.collage_path, ...getInspoPhotos(linked)] : getInspoPhotos(linked);
      }

      const row = {
        user_id: user.id,
        design_name: null,
        date_done: $("diary-date").value,
        start_time: $("diary-start").value || null,
        finish_time: $("diary-finish").value || null,
        price: $("diary-price").value ? Number($("diary-price").value) : null,
        season: $("diary-season").value || null,
        photo_paths: photoPaths,
        inspiration_id: linkedId
      };

      const r = await db.from("manicure_entries").insert(row).select().single();
      if (r.error) throw r.error;
      diary.unshift(r.data);
      $("diary-dialog").close();
      await renderDiary();
      toast("Manicure saved.");
    } catch (err) {
      msg("diary-message", err.message || "Save failed.");
    } finally {
      btn.disabled = false;
    }
  }

  async function renderDiary() {
    const list = $("diary-list");
    if (!list) return;
    if (!diary.length) {
      list.innerHTML = '<div class="empty-state"><strong>Your manicure story goes here.</strong>Log your finished nail photos, date, time, and price.</div>';
      return;
    }

    const resolved = await Promise.all(diary.map(async row => {
      const urls = (await Promise.all((row.photo_paths || []).map(signedPhoto))).filter(Boolean);
      return { row, urls };
    }));

    list.innerHTML = resolved.map(({ row, urls }, idx) => `
      <article class="diary-item ${urls.length ? "" : "no-photo"}" data-diary="${idx}">
        ${urls.length ? `
          <div class="diary-photos">
            ${urls.length > 1 ? `<span class="media-badge">1/${urls.length}</span>` : ""}
            <img src="${esc(urls[0])}" loading="lazy" alt="Manicure photo">
          </div>
        ` : ""}
        <div>
          <h3 class="diary-date-title">${esc(row.date_done)}</h3>
          <div class="diary-detail">
            ${row.season ? esc(row.season) : "All seasons"}
            ${row.start_time ? ` · ${esc(row.start_time)}${row.finish_time ? "–" + esc(row.finish_time) : ""}` : ""}
          </div>
        </div>
        <div class="diary-price">${row.price == null ? "" : esc(row.price)}</div>
      </article>
    `).join("");

    resolved.forEach(({ urls }, idx) => {
      if (!urls.length) return;
      const box = list.querySelector(`[data-diary="${idx}"] .diary-photos`);
      box.onclick = () => openLightbox(urls, 0);
    });
  }

  function initLightbox() {
    const lb = $("lightbox");
    const wrap = $("lightbox-img-wrap");
    const img = $("lightbox-img");

    $("lightbox-close").onclick = () => { lb.classList.add("hidden"); wrap.classList.remove("zoomed"); };
    $("lightbox-prev").onclick = () => showLightboxSlide(lbIndex - 1);
    $("lightbox-next").onclick = () => showLightboxSlide(lbIndex + 1);
    img.onclick = () => wrap.classList.toggle("zoomed");

    document.addEventListener("keydown", e => {
      if (lb.classList.contains("hidden")) return;
      if (e.key === "Escape") $("lightbox-close").click();
      if (e.key === "ArrowLeft") showLightboxSlide(lbIndex - 1);
      if (e.key === "ArrowRight") showLightboxSlide(lbIndex + 1);
    });

    lb.addEventListener("touchstart", e => { touchStartX = e.changedTouches.screenX; }, { passive: true });
    lb.addEventListener("touchend", e => {
      if (wrap.classList.contains("zoomed")) return;
      const dx = e.changedTouches.screenX - touchStartX;
      if (Math.abs(dx) > 45) showLightboxSlide(lbIndex + (dx < 0 ? 1 : -1));
    }, { passive: true });
  }

  function openLightbox(urls, startIdx = 0) {
    lbItems = urls;
    $("lightbox").classList.remove("hidden");
    showLightboxSlide(startIdx);
  }

  function showLightboxSlide(next) {
    lbIndex = (next + lbItems.length) % lbItems.length;
    $("lightbox-img-wrap").classList.remove("zoomed");
    $("lightbox-img").src = lbItems[lbIndex];
    $("lightbox-counter").textContent = `${lbIndex + 1} / ${lbItems.length}`;
    show("lightbox-prev", lbItems.length > 1);
    show("lightbox-next", lbItems.length > 1);
  }

  function toast(s) {
    $("toast").textContent = s;
    $("toast").classList.add("show");
    setTimeout(() => $("toast").classList.remove("show"), 2500);
  }

  init();
})();
