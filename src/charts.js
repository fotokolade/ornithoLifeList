let curveSvgSeq = 0;
function curveSvg(chrono) {
  const pts = chrono.map(r => r.first);
  if (!pts.length) return "";
  // unique per call: the curve now renders in two tabs at once (Overview + Lebensliste), and
  // <linearGradient> ids must be unique in the document or url(#id) can resolve to the wrong (or a hidden, non-rendering) one
  const gradId = "curveGrad" + curveSvgSeq, lineId = "curveLine" + curveSvgSeq;
  curveSvgSeq++;
  const W = 720, H = 230, L = 38, R = 10, Tp = 10, B = 24;
  const t0 = Date.UTC(MIN_Y, 0, 1), t1 = Date.UTC(Math.max(MAX_Y, TODAY_Y) + 1, 0, 1);
  const x = ms => L + (ms - t0) / (t1 - t0) * (W - L - R);
  const mag = Math.pow(10, Math.floor(Math.log10(pts.length)));
  const step = Math.max(1, mag / (pts.length / mag < 2.5 ? 2 : 1));
  const yMax = Math.ceil(pts.length / step) * step;
  const y = n => H - B - n / yMax * (H - B - Tp);
  const yearColor = yr => `var(${CHART_PALETTE[(yr - MIN_Y) % CHART_PALETTE.length]})`;
  let g = "", d = `M${x(t0)},${y(0)}`, prev = 0, dots = "";
  for (let v = 0; v <= yMax; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  const every = (Math.max(MAX_Y, TODAY_Y) - MIN_Y) > 8 ? 2 : 1;
  for (let yr = MIN_Y; yr <= Math.max(MAX_Y, TODAY_Y); yr += every)
    g += `<text x="${x(Date.UTC(yr, 0, 1)) + 2}" y="${H - 6}">${yr}</text>`;
  pts.forEach((o, i) => {
    const ms = Date.parse(o.d + "T00:00:00Z");
    d += ` L${x(ms)},${y(prev)} L${x(ms)},${y(i + 1)}`;
    prev = i + 1;
    const cur = o.y === S.year;
    dots += `<circle cx="${x(ms)}" cy="${y(i + 1)}" r="${cur ? 4.5 : 2.5}" fill="${cur ? "var(--accent)" : yearColor(o.y)}" stroke="var(--card)" stroke-width="${cur ? 1.5 : 1}"><title>${i + 1}. ${esc(speciesName(SP[o.s]))}, ${fmtD(o.d)}</title></circle>`;
  });
  const baseline = ` L${x(Date.now())},${y(0)} L${x(t0)},${y(0)} Z`;
  const area = d + ` L${x(Date.now())},${y(prev)}` + baseline;
  d += ` L${x(Date.now())},${y(prev)}`;
  return `<svg class="curve" viewBox="0 0 ${W} ${H}" role="img" aria-label="${t("curve")}">
    <defs>
      <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="${lineId}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="var(--k3)"/>
        <stop offset="100%" stop-color="var(--accent)"/>
      </linearGradient>
    </defs>
    ${g}<path d="${area}" fill="url(#${gradId})" stroke="none"/><path d="${d}" fill="none" stroke="url(#${lineId})" stroke-width="2.25" stroke-linejoin="round"/>${dots}</svg>`;
}
// shared cool-to-warm intensity scale, reused by the heatmaps and the map markers
function heatColor(frac) {
  return `color-mix(in srgb, var(--accent) ${Math.round(15 + Math.max(0, Math.min(1, frac)) * 85)}%, var(--k3))`;
}
function heatLegend(max) {
  return `<div class="legend"><span>0</span><div class="grad"></div><span>${max}</span></div>`;
}
function heatTable(list) {
  const cell = new Map();
  for (const o of list) {
    const k = o.y * 100 + o.m;
    if (!cell.has(k)) cell.set(k, new Set());
    cell.get(k).add(o.s);
  }
  let max = 1;
  for (const s of cell.values()) max = Math.max(max, s.size);
  let h = `<table class="heat"><thead><tr><th></th>${T.monthsShort.map(m => `<th>${m.replace(".", "")}</th>`).join("")}</tr></thead><tbody>`;
  for (let y = MAX_Y; y >= MIN_Y; y--) {
    h += `<tr><td class="y">${y}</td>`;
    for (let m = 1; m <= 12; m++) {
      const n = (cell.get(y * 100 + m) || { size: 0 }).size;
      h += n ? `<td style="background:${heatColor(n / max)}">${n}</td>` : `<td></td>`;
    }
    h += `</tr>`;
  }
  return { html: h + `</tbody></table>`, max };
}
function niceStep(max) {
  const mag = Math.pow(10, Math.floor(Math.log10(max)));
  for (const m of [1, 2, 5, 10]) if (max / (m * mag) <= 5) return Math.max(1, m * mag);
  return mag;
}
// Vertical bars with a light grid; `tips[i]` becomes the hover text of bar i.
function barChartSvg(values, labels, tips, every = 1, color = "--bar") {
  const W = 720, H = 200, L = 36, R = 8, Tp = 10, B = 22, n = values.length;
  const max = Math.max(1, ...values), step = niceStep(max), yMax = Math.ceil(max / step) * step;
  const y = v => H - B - v / yMax * (H - B - Tp), slot = (W - L - R) / n, top = Math.max(...values);
  const gid = "barGrad" + color.replace(/[^a-z0-9]/gi, "");
  let g = `<defs>
    <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(${color})"/><stop offset="100%" stop-color="var(${color})" stop-opacity="0.6"/></linearGradient>
    <linearGradient id="${gid}Top" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent)"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0.65"/></linearGradient>
  </defs>`;
  for (let v = 0; v <= yMax; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  values.forEach((v, i) => {
    const x = L + i * slot + slot * 0.15;
    g += `<rect x="${x}" y="${y(v)}" width="${slot * 0.7}" height="${H - B - y(v)}" rx="2" fill="url(#${v === top && v > 0 ? gid + "Top" : gid})"><title>${esc(tips[i])}</title></rect>`;
    if (i % every === 0) g += `<text x="${x + slot * 0.35}" y="${H - 6}" text-anchor="middle">${esc(labels[i])}</text>`;
  });
  return `<svg class="curve" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
}
// Chart.js is vendored into the page (see lifelist.py's vendor-JS embedding), not fetched from a CDN, so
// it's always present; upgradeBarChart() replaces the hand-drawn SVG bar chart already in the card
// with a nicer Chart.js one. If Chart is somehow missing (a broken build), the SVG just stays as-is.
const CHART_PALETTE = ["--k1", "--k2", "--k3", "--k4", "--k5", "--k6"];
const BAR_CHARTS = {};  // card.id -> Chart instance; id stays stable across re-renders even though the DOM node is recreated each time
function upgradeBarChart(card, labels, values, paletteOffset, tips) {
  if (!card || typeof Chart === "undefined") return;
  if (BAR_CHARTS[card.id]) { BAR_CHARTS[card.id].destroy(); delete BAR_CHARTS[card.id]; }
  const style = getComputedStyle(document.documentElement);
  const palette = CHART_PALETTE.map(v => style.getPropertyValue(v).trim());
  const accent = style.getPropertyValue("--accent").trim();
  const max = Math.max(...values);
  const hue = (v, i) => v === max && v > 0 ? accent : palette[(i + paletteOffset) % palette.length];
  card.innerHTML = "";
  const box = document.createElement("div");
  box.style.height = "220px";
  const canvas = document.createElement("canvas");
  box.append(canvas);
  card.append(box);
  BAR_CHARTS[card.id] = new Chart(canvas, {
    type: "bar",
    data: { labels, datasets: [{
      data: values,
      backgroundColor: values.map((v, i) => hue(v, i) + "cc"),
      hoverBackgroundColor: values.map((v, i) => hue(v, i)),
      borderColor: values.map((v, i) => hue(v, i)),
      borderWidth: 1.5, borderRadius: 5, maxBarThickness: 34,
    }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
      plugins: { legend: { display: false }, tooltip: tips ? { callbacks: { title: items => tips[items[0].dataIndex] } } : {} },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } },
    },
  });
}
