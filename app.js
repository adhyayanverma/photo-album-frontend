(function () {
  const { API_BASE_URL, API_KEY } = window.APP_CONFIG;
  const $ = (id) => document.getElementById(id);

  // ---------- Search: GET /search?q=... through the generated SDK (SDK1) ----------
  let apigClient = null;
  if (typeof apigClientFactory !== "undefined") {
    apigClient = apigClientFactory.newClient({ apiKey: API_KEY });
  } else {
    console.warn("API Gateway SDK not found in ./sdk; falling back to fetch for search.");
  }

  async function searchPhotos(q) {
    if (apigClient) {
      // The SDK method name comes from the resource path + verb: /search GET -> searchGet
      const res = await apigClient.searchGet({ q }, {}, {});
      return res.data;
    }
    const res = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(q)}`, {
      headers: { "x-api-key": API_KEY },
    });
    if (!res.ok) throw new Error(`Search failed: HTTP ${res.status}`);
    return res.json();
  }

  function renderResults(results) {
    const grid = $("results");
    grid.innerHTML = "";
    results.forEach((photo) => {
      const card = document.createElement("figure");
      card.className = "photo";
      const img = document.createElement("img");
      img.src = photo.url;
      img.alt = (photo.labels || []).join(", ");
      img.loading = "lazy";
      const caption = document.createElement("figcaption");
      (photo.labels || []).slice(0, 8).forEach((label) => {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = label;
        caption.appendChild(chip);
      });
      card.appendChild(img);
      card.appendChild(caption);
      grid.appendChild(card);
    });
  }

  $("search-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = $("search-input").value.trim();
    if (!q) return;
    const status = $("search-status");
    status.textContent = "Searching...";
    try {
      const data = await searchPhotos(q);
      const results = (data && data.results) || [];
      renderResults(results);
      status.textContent = results.length
        ? `${results.length} photo${results.length === 1 ? "" : "s"} found for "${q}".`
        : `No photos found for "${q}".`;
    } catch (err) {
      console.error(err);
      status.textContent = `Search error: ${err.message || err}`;
    }
  });

  // ---------- Upload: PUT /photos/{object} (API Gateway S3 proxy) ----------
  // Sent with fetch because the generated SDK drops File/Blob bodies (it treats an object with no
  // enumerable keys as an empty body). Same endpoint and API key as the SDK uses.
  function safeKey(name) {
    const clean = name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
    return `${Date.now()}-${clean}`;
  }

  $("upload-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = $("file-input").files[0];
    const status = $("upload-status");
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      status.textContent = "Please choose a JPEG or PNG (Rekognition supports only these).";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      status.textContent = "File is over 10 MB, the API Gateway payload limit.";
      return;
    }

    const labels = $("labels-input").value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const headers = { "Content-Type": file.type, "x-api-key": API_KEY };
    if (labels.length) headers["x-amz-meta-customLabels"] = labels.join(", ");

    const key = safeKey(file.name);
    status.textContent = `Uploading ${file.name}...`;
    try {
      const res = await fetch(`${API_BASE_URL}/photos/${encodeURIComponent(key)}`, {
        method: "PUT",
        headers,
        body: file,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
      status.textContent = `Uploaded as ${key}${labels.length ? ` with labels: ${labels.join(", ")}` : ""}. ` +
        "It will be searchable in a few seconds once indexing finishes.";
      $("upload-form").reset();
    } catch (err) {
      console.error(err);
      status.textContent = `Upload error: ${err.message || err}`;
    }
  });
})();
