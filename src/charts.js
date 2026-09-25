let curveSvgSeq = 0;
function curveSvg(chrono) {
  const pts = chrono.map(r => r.first);
  if (!pts.length) return "";
  // unique per call: the curve now renders in two tabs at once (Overview + Lebensliste), and
  // <linearGradient> ids must be unique in the document or url(#id) can resolve to the wrong (or a hidden, non-rendering) one
  const gradId = "curveGrad" + curveSvgSeq, lineId = "curveLine" + curveSvgSeq;
  curveSvgSeq++;
  // drawn at roughly the width it is shown at, so the axis text stays legible on a phone instead of shrinking with the whole picture
  const W = Math.round(Math.max(320, Math.min(720, document.documentElement.clientWidth - 66))), H = 230, L = 38, R = 10, Tp = 10, B = 24;
  // the curve ends with the export's last observation, not today: an older export would otherwise trail off in a long flat line
  const t0 = Date.UTC(MIN_Y, 0, 1), t1 = Date.UTC(MAX_Y + 1, 0, 1), tEnd = Date.parse(OBS[OBS.length - 1].d + "T00:00:00Z");
  const x = ms => L + (ms - t0) / (t1 - t0) * (W - L - R);
  const mag = Math.pow(10, Math.floor(Math.log10(pts.length)));
  const step = Math.max(1, mag / (pts.length / mag < 2.5 ? 2 : 1));
  const yMax = Math.ceil(pts.length / step) * step;
  const y = n => H - B - n / yMax * (H - B - Tp);
  let g = "", d = `M${x(t0)},${y(0)}`, prev = 0, dots = "";
  for (let v = 0; v <= yMax; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  // a year label needs about 40 units of width; thin them out when the years get too narrow for that
  const every = Math.max(1, Math.ceil(40 / ((W - L - R) / (MAX_Y - MIN_Y + 1))));
  for (let yr = MIN_Y; yr <= MAX_Y; yr += every)
    g += `<text x="${x(Date.UTC(yr, 0, 1)) + 2}" y="${H - 6}">${yr}</text>`;
  pts.forEach((o, i) => {
    const ms = Date.parse(o.d + "T00:00:00Z");
    d += ` L${x(ms)},${y(prev)} L${x(ms)},${y(i + 1)}`;
    prev = i + 1;
    const cur = o.y === S.year;
    dots += `<circle cx="${x(ms)}" cy="${y(i + 1)}" r="${cur ? 4.5 : 2.5}" fill="${cur ? "var(--accent)" : "var(--bar)"}" stroke="var(--card)" stroke-width="${cur ? 1.5 : 1}"><title>${i + 1}. ${esc(speciesName(SP[o.s]))}, ${fmtD(o.d)}</title></circle>`;
  });
  const baseline = ` L${x(tEnd)},${y(0)} L${x(t0)},${y(0)} Z`;
  const area = d + ` L${x(tEnd)},${y(prev)}` + baseline;
  d += ` L${x(tEnd)},${y(prev)}`;
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
// sequential scale in one hue, light (few) to dark (many); --heat-lo/--heat-hi flip for the dark theme
function heatColor(frac) {
  return `color-mix(in srgb, var(--heat-hi) ${Math.round(8 + Math.max(0, Math.min(1, frac)) * 92)}%, var(--heat-lo))`;
}
// cells past this share of the maximum are dark enough to need the light --heat-ink text
const HEAT_INK_FROM = 0.55;
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
  let h = `<table class="heat months"><thead><tr><th></th>${T.monthsShort.map(m => `<th><span class="m-long">${m.replace(".", "")}</span><span class="m-short">${m.slice(0, 1)}</span></th>`).join("")}</tr></thead><tbody>`;
  for (let y = MAX_Y; y >= MIN_Y; y--) {
    h += `<tr><td class="y">${y}</td>`;
    for (let m = 1; m <= 12; m++) {
      const n = (cell.get(y * 100 + m) || { size: 0 }).size;
      h += n ? `<td${n / max > HEAT_INK_FROM ? ' class="hot"' : ""} style="background:${heatColor(n / max)}">${n}</td>` : `<td></td>`;
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
function barChartSvg(values, labels, tips, every = 1) {
  const W = 720, H = 200, L = 36, R = 8, Tp = 10, B = 22, n = values.length;
  const max = Math.max(1, ...values), step = niceStep(max), yMax = Math.ceil(max / step) * step;
  const y = v => H - B - v / yMax * (H - B - Tp), slot = (W - L - R) / n, top = Math.max(...values);
  let g = "";
  for (let v = 0; v <= yMax; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  values.forEach((v, i) => {
    const x = L + i * slot + slot * 0.15;
    g += `<rect x="${x}" y="${y(v)}" width="${slot * 0.7}" height="${H - B - y(v)}" rx="2" fill="var(${v === top && v > 0 ? "--accent" : "--bar"})"><title>${esc(tips[i])}</title></rect>`;
    if (i % every === 0) g += `<text x="${x + slot * 0.35}" y="${H - 6}" text-anchor="middle">${esc(labels[i])}</text>`;
  });
  return `<svg class="curve" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
}
// colour follows the time of day (night, dawn, morning, midday, evening, dusk); [hour, light theme, dark theme]
/** @type {[number, string, string][]} */
const DAY_STOPS = [[0, "#2b3a67", "#7d8fd0"], [4, "#3b4a7a", "#8797d4"], [5.5, "#c46a8a", "#d98aa6"], [7, "#e8914a", "#eda066"],
  [9, "#e9b949", "#ecc462"], [12, "#6fb3d9", "#7cbde0"], [15, "#5a9fd0", "#6aaad8"], [17.5, "#e8914a", "#eda066"],
  [19.5, "#b0588f", "#c877a8"], [21, "#4a3f7a", "#9a8bd0"], [24, "#2b3a67", "#7d8fd0"]];
// [from hour, to hour, i18n key of the label, rgb of the band]
const DAY_BANDS = [[0, 5, "dayNight", "43,58,103"], [5, 8, "dayMorning", "232,145,74"], [8, 17, "dayDay", "233,185,73"],
  [17, 21, "dayEvening", "176,88,143"], [21, 24, "dayNight", "43,58,103"]];
// canvas charts read their colours once when drawn, so they follow the explicit theme attribute (set to
// "light" while printing, see app.js) or the OS preference; every theme change redraws the active tab
const isDarkTheme = () => {
  const attr = document.documentElement.getAttribute("data-theme");
  return attr ? attr === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
};
/** @returns {[number, string][]} [hour, colour] for the active theme */
const dayStops = () => { const dark = isDarkTheme(); return DAY_STOPS.map(([h, light, dk]) => /** @type {[number, string]} */ ([h, dark ? dk : light])); };
/** Time-of-day colour at `hour` (0-24, fractional), interpolated between `stops`. */
function dayColor(hour, stops) {
  const rgb = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  for (let i = 0; i < stops.length - 1; i++) {
    const [h0, c0] = stops[i], [h1, c1] = stops[i + 1];
    if (hour >= h0 && hour <= h1) {
      const f = (hour - h0) / (h1 - h0), a = rgb(c0), b = rgb(c1);
      return "#" + a.map((v, j) => Math.round(v + (b[j] - v) * f).toString(16).padStart(2, "0")).join("");
    }
  }
  return stops[0][1];
}

// Chart.js is vendored into the page (see lifelist.py's vendor-JS embedding), not fetched from a CDN, so
// it's always present; the upgrade functions replace the hand-drawn SVG chart already in the card with a
// nicer Chart.js one. If Chart is somehow missing (a broken build), the SVG just stays as-is.
const BAR_CHARTS = {};  // card.id -> Chart instance; id stays stable across re-renders even though the DOM node is recreated each time
const cssVar = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
/** Swaps the card's content for a canvas of the given height and draws `config` on it; false without Chart.js. */
function mountChart(card, height, config) {
  if (!card || typeof Chart === "undefined") return false;
  if (BAR_CHARTS[card.id]) { BAR_CHARTS[card.id].destroy(); delete BAR_CHARTS[card.id]; }
  card.innerHTML = "";
  const box = document.createElement("div");
  box.style.height = height + "px";
  const canvas = document.createElement("canvas");
  box.append(canvas);
  card.append(box);
  BAR_CHARTS[card.id] = new Chart(canvas, config);
  return true;
}
const axisTicks = extra => ({ color: cssVar("--muted"), ...extra });
// one colour for every bar; only the highest one stands out in the accent colour
function upgradeBarChart(card, labels, values, tips) {
  const bar = cssVar("--bar"), accent = cssVar("--accent"), max = Math.max(...values);
  const hue = v => v === max && v > 0 ? accent : bar;
  mountChart(card, 220, {
    type: "bar",
    data: { labels, datasets: [{
      data: values,
      backgroundColor: values.map(v => hue(v) + "cc"),
      hoverBackgroundColor: values.map(hue),
      borderRadius: 4, maxBarThickness: 34,
    }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
      plugins: { legend: { display: false }, tooltip: { displayColors: false, callbacks: { title: () => "", label: item => tips[item.dataIndex] } } },
      scales: {
        y: { beginAtZero: true, ticks: axisTicks({ precision: 0 }), grid: { color: cssVar("--line") } },
        x: { grid: { display: false }, ticks: axisTicks() },
      },
    },
  });
}
// Replaces the SVG bar chart in `card` with a smoothed 24-hour curve over shaded night/morning/day/evening bands.
function upgradeDayCurve(card, values, titles, valueName, stops) {
  const dark = isDarkTheme(), muted = cssVar("--muted");
  const gradient = (chart, alpha) => {
    if (!chart.chartArea) return stops[0][1];
    const g = chart.ctx.createLinearGradient(chart.scales.x.getPixelForValue(0), 0, chart.scales.x.getPixelForValue(24), 0);
    for (const [h, c] of stops) g.addColorStop(h / 24, c + alpha);
    return g;
  };
  const bands = {
    id: "dayBands",
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea: a, scales: { x } } = chart;
      ctx.save();
      for (const [h0, h1, key, rgb] of DAY_BANDS) {
        const x0 = x.getPixelForValue(h0), x1 = x.getPixelForValue(h1);
        ctx.fillStyle = `rgba(${rgb},${dark ? 0.1 : 0.09})`;
        ctx.fillRect(x0, a.top, x1 - x0, a.bottom - a.top);
        ctx.fillStyle = muted;
        ctx.font = "11px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(t(key), (x0 + x1) / 2, a.top + 13);
      }
      ctx.restore();
    },
    afterDatasetsDraw(chart) {
      const active = chart.tooltip && chart.tooltip.getActiveElements();
      if (!active || !active.length) return;
      const { ctx, chartArea: a } = chart, px = active[0].element.x;
      ctx.save();
      ctx.strokeStyle = muted;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(px, a.top); ctx.lineTo(px, a.bottom); ctx.stroke();
      ctx.restore();
    },
  };
  mountChart(card, 240, {
    type: "line",
    plugins: [bands],
    data: { datasets: [{
      data: values.map((v, h) => ({ x: h + 0.5, y: v })),
      fill: "origin", cubicInterpolationMode: "monotone", borderWidth: 2,
      pointRadius: 0, pointHoverRadius: 5, pointHoverBorderWidth: 2, pointHoverBorderColor: cssVar("--card"),
      pointHoverBackgroundColor: ctx => dayColor(ctx.parsed.x, stops),
      borderColor: ctx => gradient(ctx.chart, ""),
      backgroundColor: ctx => gradient(ctx.chart, dark ? "55" : "40"),
    }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 300 }, parsing: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { displayColors: false, callbacks: { title: items => titles[items[0].dataIndex], label: item => `${valueName}: ${fmtN(item.parsed.y)}` } } },
      scales: {
        x: { type: "linear", min: 0, max: 24, ticks: axisTicks({ stepSize: 3 }), grid: { display: false } },
        y: { beginAtZero: true, ticks: axisTicks({ precision: 0 }), grid: { color: cssVar("--line") } },
      },
    },
  });
}
