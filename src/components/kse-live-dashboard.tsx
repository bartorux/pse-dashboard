"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ArrowDownRight, ArrowUpRight, RefreshCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const REFRESH_INTERVAL = 60;

const INSIGHT_THRESHOLDS = {
  forecastWarnPct: 8,
  forecastAlertPct: 15,
  volatilityWarnPct: 10,
  volatilityAlertPct: 18,
  rampWarnMw: 1200,
  rampAlertMw: 2000,
  ogrWarnCount: 5,
  ogrAlertCount: 12,
  reserveWarnPct: 10,
  reserveAlertPct: 20,
  priceJumpWarnPct: 20,
  priceJumpAlertPct: 35,
  priceVolWarnPct: 15,
  priceVolAlertPct: 25,
  priceAnomalyZ: 2.5,
  afrrWarnCount: 1,
  afrrAlertCount: 3,
  afrrAlertMw: 300
};

const ABBR = {
  kse: {
    full: "Krajowy System Elektroenergetyczny",
    abbr: "KSE"
  },
  lolp: {
    full: "Prawdopodobienstwo niedoboru rezerwy",
    abbr: "LOLP"
  },
  afrr: {
    full: "Automatyczna rezerwa regulacyjna",
    abbr: "aFRR"
  }
} as const;

const endpoints = [
  {
    key: "kse-load",
    label: "Obciazenie systemu elektroenergetycznego",
    description: "Biezace zapotrzebowanie systemu elektroenergetycznego.",
    unit: "MW",
    valueHints: ["wartosc", "value", "load", "moc"],
    labelHints: ["area", "node"],
    limit: "144"
  },
  {
    key: "pdgsz",
    label: "Godziny szczytu",
    description: "Wskaznik ryzyka zuzycia energii w najblizszych godzinach.",
    unit: "",
    valueHints: ["usage_fcst", "znacznik", "value"],
    labelHints: ["dtime", "time", "business_date"],
    limit: "96"
  },
  {
    key: "gen-jw",
    label: "Generacja JW",
    description: "Produkcja energii przez jednostki wytworcze.",
    unit: "MW",
    valueHints: ["wartosc", "value", "generation", "moc"],
    labelHints: [
      "power_plant",
      "plant",
      "resource_name",
      "resource_code",
      "unit",
      "node",
      "name"
    ],
    limit: "240"
  },
  {
    key: "ogr-oper",
    label: "Ograniczenia sieciowe",
    description: "Aktywne ograniczenia pracy sieci przesylowej.",
    unit: "MW",
    valueHints: ["pol_max_power_of_unit", "pol_min_power_of_unit", "value"],
    labelHints: [
      "limiting_element",
      "node",
      "resource_name",
      "resource_code",
      "direction",
      "line"
    ],
    limit: "120"
  },
  {
    key: "lolp",
    label: "Prawdopodobienstwo niedoboru rezerwy",
    description: "Parametry prawdopodobienstwa niedoboru rezerw mocy.",
    unit: "%",
    valueHints: ["p0", "p1", "p2", "p3"],
    labelHints: ["dtime", "period", "business_date"],
    limit: "96"
  },
  {
    key: "pk5l-wp",
    label: "Plan koordynacyjny 5-letni",
    description: "Prognoza rezerw mocy na 72 godziny.",
    unit: "MW",
    valueHints: ["req_pow_res", "surplus_cap_avail_tso", "avail_cap_gen_units_stor_prov"],
    labelHints: ["plan_dtime", "plan_dtime_utc"],
    limit: "240"
  },
  {
    key: "energy-prices",
    label: "Ceny energii",
    description: "Szybki podglad poziomu cen na rynku energii.",
    unit: "PLN/MWh",
    valueHints: ["price", "price_pln", "pln", "rce", "value"],
    labelHints: ["dtime", "period", "business_date"],
    limit: "144"
  },
  {
    key: "afrr-status",
    label: "Automatyczna rezerwa regulacyjna",
    description: "Status i aktywacje automatycznej rezerwy regulacyjnej.",
    unit: "MW",
    valueHints: ["status", "activation", "value", "volume", "mw"],
    labelHints: ["status", "state", "mode", "direction"],
    limit: "96"
  }
];

type PseResponse = {
  value?: Record<string, unknown>[];
  nextLink?: string;
};

type EndpointState = {
  loading: boolean;
  error?: string;
  data?: PseResponse;
};

type Stats = {
  min: number;
  max: number;
  avg: number;
  last: number;
  delta: number | null;
  deltaPct: number | null;
};

type SeriesPoint = {
  label: string;
  value: number;
};

type ChartPoint = {
  label: string;
  value: number;
};

type ReserveForecastPoint = {
  label: string;
  date: Date;
  available: number;
  required: number;
  margin: number;
};

type AlertLevel = "ok" | "warn" | "alert";

type SectionId =
  | "load"
  | "prices"
  | "afrr"
  | "reserve"
  | "network"
  | "generation"
  | "peak"
  | "forecast";
type PanelId = SectionId | "summary" | "trend" | "heatmap" | "alerts";

type AlertItem = {
  id: string;
  level: AlertLevel;
  title: string;
  detail: string;
  sectionId?: SectionId;
  context?: Array<{ label: string; value: string }>;
};

type HeatmapSelection = {
  day: string;
  hour: number;
  value: number | null;
};

const numberFormatter = new Intl.NumberFormat("pl-PL", {
  maximumFractionDigits: 2
});

const TIME_KEY_HINTS = [
  "time",
  "date",
  "dtime",
  "timestamp",
  "business_date",
  "publication",
  "from_dtime",
  "to_dtime"
];

const usageStatusMap: Record<
  number,
  { label: string; detail: string; level: AlertLevel }
> = {
  0: {
    label: "Zalecane uzytkowanie",
    detail: "Nadchodza godziny zalecanego uzytkowania energii.",
    level: "ok"
  },
  1: {
    label: "Normalne uzytkowanie",
    detail: "Brak specjalnych zalecen ograniczen.",
    level: "ok"
  },
  2: {
    label: "Zalecane oszczedzanie",
    detail: "Wskazane ograniczenie zuzycia energii.",
    level: "warn"
  },
  3: {
    label: "Wymagane ograniczanie",
    detail: "Wymagane sa dzialania ograniczajace zuzycie.",
    level: "alert"
  }
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function findKeyByHints(keys: string[], hints: string[]) {
  const normalized = keys.map((key) => ({ key, lower: key.toLowerCase() }));
  for (const hint of hints) {
    const loweredHint = hint.toLowerCase();
    const match = normalized.find((item) =>
      item.lower === loweredHint ? true : item.lower.includes(loweredHint)
    );
    if (match) return match.key;
  }
  return undefined;
}

function getRowValue(row: Record<string, unknown>, key: string) {
  const lower = key.toLowerCase();
  const match = Object.keys(row).find((candidate) => candidate.toLowerCase() === lower);
  return match ? row[match] : undefined;
}

function getBestTimeKey(rows: Record<string, unknown>[]) {
  const scores: Record<string, number> = {};
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
        scores[key] = (scores[key] || 0) + 1;
      }
    }
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (best) return best;

  const fallback = Object.keys(rows[0] || {}).find((key) =>
    TIME_KEY_HINTS.some((hint) => key.toLowerCase().includes(hint))
  );
  return fallback;
}

function getNumericKeyRanking(rows: Record<string, unknown>[]) {
  const scores: Record<string, number> = {};
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      const numeric = toNumber(value);
      if (numeric === null) continue;
      scores[key] = (scores[key] || 0) + 1;
    }
  }
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);
}

function pickNumericKey(rows: Record<string, unknown>[], hints: string[]) {
  const numericKeys = getNumericKeyRanking(rows);
  if (!numericKeys.length) return undefined;
  const hinted = findKeyByHints(numericKeys, hints);
  return hinted ?? numericKeys[0];
}

function pickLabelKey(rows: Record<string, unknown>[], hints: string[]) {
  if (!rows.length) return undefined;
  const keys = Object.keys(rows[0]);
  const hinted = findKeyByHints(keys, hints);
  if (hinted) return hinted;

  const candidates = keys.filter((key) => {
    const lower = key.toLowerCase();
    return !TIME_KEY_HINTS.some((hint) => lower.includes(hint));
  });

  const scores: Record<string, number> = {};
  for (const row of rows) {
    for (const key of candidates) {
      const value = row[key];
      if (typeof value === "string" && value.trim()) {
        scores[key] = (scores[key] || 0) + 1;
      }
    }
  }

  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0];
}

function pickExactKey(rows: Record<string, unknown>[], candidates: string[]) {
  if (!rows.length) return undefined;
  const keys = Object.keys(rows[0]);
  return candidates.find((candidate) => keys.includes(candidate));
}

function parseDate(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

function formatDateKeyLocal(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeLabel(date: Date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function sortRowsByTime(rows: Record<string, unknown>[], timeKey?: string) {
  if (!timeKey) return rows;
  return [...rows].sort((a, b) => {
    const aTime = Date.parse(String(a[timeKey] ?? ""));
    const bTime = Date.parse(String(b[timeKey] ?? ""));
    return aTime - bTime;
  });
}

function getLatestRows(rows: Record<string, unknown>[], timeKey?: string) {
  if (!timeKey) return rows;
  const timestamps = rows
    .map((row) => Date.parse(String(row[timeKey] ?? "")))
    .filter((value) => !Number.isNaN(value));
  const latestTime = timestamps.length ? Math.max(...timestamps) : null;
  if (!latestTime) return rows;
  return rows.filter(
    (row) => Date.parse(String(row[timeKey] ?? "")) === latestTime
  );
}

function computeStats(values: number[]): Stats | null {
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((acc, value) => acc + value, 0) / values.length;
  const last = values[values.length - 1];
  const prev = values.length > 1 ? values[values.length - 2] : null;
  const delta = prev !== null ? last - prev : null;
  const deltaPct = prev ? (delta / prev) * 100 : null;
  return { min, max, avg, last, delta, deltaPct };
}

function computeStd(values: number[]) {
  if (!values.length) return 0;
  const avg = values.reduce((acc, value) => acc + value, 0) / values.length;
  const variance =
    values.reduce((acc, value) => acc + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function computeVolatility(values: number[]) {
  if (!values.length) {
    return { std: 0, stdPct: null as number | null };
  }
  const std = computeStd(values);
  const avg = values.reduce((acc, value) => acc + value, 0) / values.length;
  const stdPct = avg ? (std / avg) * 100 : null;
  return { std, stdPct };
}

function computeRampRate(points: ChartPoint[]) {
  if (points.length < 2) {
    return { maxDelta: null as number | null, label: "" };
  }
  let maxDelta = 0;
  let maxLabel = "";
  for (let index = 1; index < points.length; index += 1) {
    const delta = points[index].value - points[index - 1].value;
    if (Math.abs(delta) >= Math.abs(maxDelta)) {
      maxDelta = delta;
      maxLabel = points[index].label;
    }
  }
  return { maxDelta, label: maxLabel };
}

function computeRangePosition(value: number | null, min: number | null, max: number | null) {
  if (value === null || min === null || max === null) return null;
  const range = max - min;
  if (!range) return 0;
  const pct = ((value - min) / range) * 100;
  return Math.min(100, Math.max(0, pct));
}

function detectAnomalies(points: ChartPoint[], threshold = 2.2) {
  if (points.length < 8) return [] as Array<ChartPoint & { z: number }>;
  const values = points.map((point) => point.value);
  const avg = values.reduce((acc, value) => acc + value, 0) / values.length;
  const std = computeStd(values);
  if (!std) return [] as Array<ChartPoint & { z: number }>;

  return points
    .map((point) => ({ ...point, z: (point.value - avg) / std }))
    .filter((point) => Math.abs(point.z) > threshold)
    .slice(-3);
}

function formatValue(value: number | null, unit?: string) {
  if (value === null) return "Brak danych";
  const formatted = numberFormatter.format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

function formatPercent(value: number | null) {
  if (value === null) return "Brak danych";
  return `${value.toFixed(1)}%`;
}

function formatSigned(value: number | null, unit?: string) {
  if (value === null) return "Brak danych";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatValue(Math.abs(value), unit)}`;
}

function normalizeProbability(value: number | null) {
  if (value === null) return null;
  if (value <= 1) return value * 100;
  if (value <= 100) return value;
  return value;
}

function extractReserveBuckets(row: Record<string, unknown>) {
  const buckets: Array<{ b: number; p: number }> = [];
  for (let index = 0; index <= 9; index += 1) {
    const bValue = toNumber(getRowValue(row, `b${index}`));
    const pValue = toNumber(getRowValue(row, `p${index}`));
    if (bValue === null || pValue === null) continue;
    buckets.push({ b: bValue, p: pValue });
  }
  return buckets;
}

function usageColor(value: number | null) {
  if (value === null) return "bg-muted";
  if (value >= 3) return "bg-rose-500";
  if (value >= 2) return "bg-amber-400";
  if (value >= 1) return "bg-sky-400";
  return "bg-emerald-400";
}

function heatColor(value: number | null, min: number, max: number) {
  if (value === null) return "transparent";
  const range = max - min || 1;
  const ratio = Math.min(Math.max((value - min) / range, 0), 1);
  const lightness = 92 - ratio * 45;
  return `hsl(204 80% ${lightness}%)`;
}

function InteractiveLineChart({
  points,
  unit,
  comparePoints,
  compareLabel,
  showChips,
  chipLabels,
  markers,
  getTooltipExtra
}: {
  points: ChartPoint[];
  unit?: string;
  comparePoints?: ChartPoint[];
  compareLabel?: string;
  showChips?: boolean;
  chipLabels?: { primary?: string; secondary?: string };
  markers?: Array<{ index: number; color: string }>;
  getTooltipExtra?: (
    index: number,
    point: ChartPoint,
    comparePoint: ChartPoint | null
  ) => React.ReactNode;
}) {
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);
  const [pinnedIndex, setPinnedIndex] = React.useState<number | null>(null);
  const svgRef = React.useRef<SVGSVGElement | null>(null);

  const width = 680;
  const height = 240;
  const padding = 18;
  const values = points.map((point) => point.value);
  const compareValues = comparePoints?.length
    ? comparePoints.map((point) => point.value)
    : [];
  const allValues = compareValues.length ? values.concat(compareValues) : values;
  const min = allValues.length ? Math.min(...allValues) : 0;
  const max = allValues.length ? Math.max(...allValues) : 1;
  const range = max - min || 1;
  const step = (width - padding * 2) / Math.max(points.length - 1, 1);

  const primary = React.useMemo(() => {
    if (points.length < 2) {
      return { coords: [] as Array<ChartPoint & { x: number; y: number }>, path: "", area: "" };
    }
    const coords = points.map((point, index) => {
      const x = padding + index * step;
      const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
      return { ...point, x, y };
    });
    const path = coords
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(" ");
    const area = `${path} L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z`;
    return { coords, path, area };
  }, [points, min, range, step, height, padding, width]);

  const compare = React.useMemo(() => {
    if (!comparePoints || comparePoints.length < 2) return null;
    const compareStep = (width - padding * 2) / (comparePoints.length - 1);
    const coords = comparePoints.map((point, index) => {
      const x = padding + index * compareStep;
      const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
      return { ...point, x, y };
    });
    const path = coords
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(" ");
    return { coords, path };
  }, [comparePoints, min, range, height, padding, width]);

  if (points.length < 2 || primary.coords.length < 2) {
    return <div className="text-sm text-muted-foreground">Brak danych do wykresu.</div>;
  }

  const getIndexFromClientX = (clientX: number) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const innerWidth = rect.width - padding * 2;
    if (innerWidth <= 0) return null;
    const pointerX = clientX - rect.left;
    const clampedX = Math.min(Math.max(pointerX, padding), rect.width - padding);
    const ratio = (clampedX - padding) / innerWidth;
    const index = Math.round(ratio * (primary.coords.length - 1));
    return Math.min(Math.max(index, 0), primary.coords.length - 1);
  };

  const showHover = hoverIndex !== null || pinnedIndex !== null;
  const activeIndex =
    hoverIndex !== null
      ? hoverIndex
      : pinnedIndex !== null
      ? pinnedIndex
      : primary.coords.length - 1;
  const activePoint = primary.coords[activeIndex];
  const activePercent = (activePoint.x / width) * 100;
  const activeComparePoint =
    compare?.coords?.length
      ? compare.coords[
          Math.min(
            Math.round((activeIndex / (primary.coords.length - 1)) * (compare.coords.length - 1)),
            compare.coords.length - 1
          )
        ]
      : null;

  return (
    <div
      className={`relative rounded-2xl border border-border/60 bg-gradient-to-b from-white to-muted/30 p-4 ${
        showChips ? "pt-12" : ""
      }`}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full cursor-crosshair text-primary"
        onPointerLeave={() => setHoverIndex(null)}
        onPointerMove={(event) => {
          const index = getIndexFromClientX(event.clientX);
          if (index === null) return;
          setHoverIndex(index);
        }}
        onPointerDown={(event) => {
          const index = getIndexFromClientX(event.clientX);
          if (index === null) return;
          setPinnedIndex((prev) => (prev === index ? null : index));
          setHoverIndex(index);
        }}
      >
        <defs>
          <linearGradient id="kse-line" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(49, 130, 206, 0.35)" />
            <stop offset="100%" stopColor="rgba(49, 130, 206, 0)" />
          </linearGradient>
        </defs>
        <path d={primary.area} fill="url(#kse-line)" className="chart-area" />
        <path
          d={primary.path}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          pathLength={1}
          className="chart-line"
        />
        {compare?.path ? (
          <path
            d={compare.path}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="6 6"
            strokeLinecap="round"
            className="chart-compare"
          />
        ) : null}
        {markers?.length
          ? markers.map((marker, idx) => {
              const markerPoint = primary.coords[marker.index];
              if (!markerPoint) return null;
              return (
                <g key={`${marker.index}-${idx}`} className="pointer-events-none">
                  <line
                    x1={markerPoint.x}
                    x2={markerPoint.x}
                    y1={padding}
                    y2={height - padding}
                    stroke={marker.color}
                    strokeOpacity={0.5}
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                  <circle
                    cx={markerPoint.x}
                    cy={markerPoint.y}
                    r="4"
                    fill={marker.color}
                    stroke="white"
                    strokeWidth="1.5"
                  />
                </g>
              );
            })
          : null}
        {showHover && activePoint ? (
          <g className="pointer-events-none">
            <line
              x1={activePoint.x}
              x2={activePoint.x}
              y1={padding}
              y2={height - padding}
              stroke="currentColor"
              strokeOpacity={0.2}
              strokeWidth="1"
            />
            <circle
              cx={activePoint.x}
              cy={activePoint.y}
              r="5"
              fill="white"
              stroke="currentColor"
              strokeWidth="2"
            />
          </g>
        ) : null}
      </svg>

      <div className="pointer-events-none absolute inset-0">
        {showHover ? (
          <div
            className="absolute top-2 rounded-xl border border-border/60 bg-white px-3 py-2 text-xs shadow-lg"
            style={{
              left: `${activePercent}%`,
              transform: "translate(-50%, 0)"
            }}
          >
            <div className="text-[11px] text-muted-foreground">{activePoint.label}</div>
            <div className="font-semibold text-foreground">
              {formatValue(activePoint.value, unit)}
            </div>
            {activeComparePoint ? (
              <div className="text-[11px] text-muted-foreground">
                {compareLabel ?? "Prognoza"}: {formatValue(activeComparePoint.value, unit)}
              </div>
            ) : null}
            {getTooltipExtra
              ? (
                <div className="text-[11px] text-muted-foreground">
                  {getTooltipExtra(activeIndex, activePoint, activeComparePoint)}
                </div>
              )
              : null}
            {pinnedIndex !== null && hoverIndex === null ? (
              <div className="mt-1 text-[10px] text-muted-foreground">Przypiete</div>
            ) : null}
          </div>
        ) : null}
      </div>

      {showChips ? (
        <div className="pointer-events-none absolute right-4 top-3 flex flex-wrap gap-2 text-[11px]">
          <div className="rounded-full border border-border/60 bg-white/90 px-3 py-1 text-foreground shadow-sm">
            {chipLabels?.primary ?? "Aktualnie"}: {formatValue(activePoint.value, unit)}
          </div>
          {activeComparePoint ? (
            <div className="rounded-full border border-border/60 bg-white/90 px-3 py-1 text-foreground shadow-sm">
              {chipLabels?.secondary ?? compareLabel ?? "Porownanie"}:{" "}
              {formatValue(activeComparePoint.value, unit)}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 text-xs text-muted-foreground">
        Najedz na wykres, aby zobaczyc wartosc. Kliknij, aby{" "}
        {pinnedIndex === null ? "przypiac" : "odpiac"} punkt.
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  helper,
  trend,
  className
}: {
  label: string;
  value: string;
  helper?: string;
  trend?: { value: number | null; percent: number | null };
  className?: string;
}) {
  const hasTrend = trend?.value !== null && trend?.value !== undefined;
  const isPositive = (trend?.value ?? 0) >= 0;
  return (
    <Card className={`border-border/60 bg-white/80 rise-in hover-lift ${className ?? ""}`}>
      <CardHeader className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          {label}
        </p>
        <CardTitle className="text-2xl">{value}</CardTitle>
        {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
      </CardHeader>
      {trend ? (
        <CardContent>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {hasTrend ? (
              isPositive ? (
                <ArrowUpRight className="h-4 w-4 text-emerald-500" />
              ) : (
                <ArrowDownRight className="h-4 w-4 text-amber-500" />
              )
            ) : null}
            <span>
              {!hasTrend
                ? "Brak porownania"
                : `${numberFormatter.format(trend.value)} (${trend.percent?.toFixed(1) ?? "0"}%)`}
            </span>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}

function InfoTip({ text }: { text: string }) {
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const [isOpen, setIsOpen] = React.useState(false);
  const [animateIn, setAnimateIn] = React.useState(false);
  const [coords, setCoords] = React.useState<{
    top: number;
    left: number;
    placement: "top" | "bottom";
  } | null>(null);
  const openTimer = React.useRef<number | null>(null);
  const closeTimer = React.useRef<number | null>(null);

  const clearTimers = React.useCallback(() => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);

  const show = React.useCallback(() => {
    clearTimers();
    openTimer.current = window.setTimeout(() => {
      const node = buttonRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const margin = 10;
      const tooltipHeight = 40;
      const placement =
        rect.bottom + margin + tooltipHeight < window.innerHeight ? "bottom" : "top";
      const top = placement === "bottom" ? rect.bottom + margin : rect.top - margin;
      const left = rect.left + rect.width / 2;
      setCoords({ top, left, placement });
      setIsOpen(true);
      setAnimateIn(false);
      window.requestAnimationFrame(() => setAnimateIn(true));
    }, 160);
  }, [clearTimers]);

  const hide = React.useCallback(() => {
    clearTimers();
    setAnimateIn(false);
    closeTimer.current = window.setTimeout(() => setIsOpen(false), 120);
  }, [clearTimers]);

  React.useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  return (
    <span className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        aria-label={text}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className="inline-flex h-7 w-7 flex-shrink-0 select-none items-center justify-center rounded-full border border-border/60 bg-white/95 text-[12px] font-semibold text-muted-foreground shadow-sm transition hover:border-border hover:text-foreground hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        ⓘ
        <span className="sr-only">{text}</span>
      </button>
      {isOpen && coords
        ? createPortal(
            <div
              className={`pointer-events-none z-[60] w-max max-w-[240px] whitespace-normal rounded-lg border border-border/70 bg-white px-2 py-1 text-left text-[11px] text-muted-foreground shadow-lg transition-all duration-200 ease-out ${
                animateIn ? "opacity-100" : "opacity-0"
              }`}
              style={{
                position: "fixed",
                top: coords.top,
                left: coords.left,
                transform:
                  coords.placement === "bottom"
                    ? `translate(-50%, ${animateIn ? "0" : "4px"})`
                    : `translate(-50%, ${animateIn ? "-100%" : "-96%"})`
              }}
            >
              {text}
            </div>,
            document.body
          )
        : null}
    </span>
  );
}

function LabelWithAbbr({ full, abbr }: { full: string; abbr: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-semibold text-foreground">{abbr}</span>
      <InfoTip text={`Pelna nazwa: ${full}`} />
    </span>
  );
}

function PanelRow({
  label,
  value
}: {
  label: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="max-w-[65%] leading-snug">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

function DetailTrigger({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" onClick={onClick}>
      Szczegoly
    </Button>
  );
}

function Sparkline({
  points,
  className
}: {
  points: ChartPoint[];
  className?: string;
}) {
  if (points.length < 2) {
    return <div className="text-xs text-muted-foreground">Brak danych</div>;
  }

  const width = 180;
  const height = 56;
  const padding = 6;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = (width - padding * 2) / Math.max(points.length - 1, 1);
  const coords = points.map((point, index) => {
    const x = padding + index * step;
    const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
    return { x, y };
  });
  const path = coords
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`h-14 w-full ${className ?? "text-primary"}`}
      aria-hidden="true"
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export default function KseLiveDashboard() {
  const [states, setStates] = React.useState<Record<string, EndpointState>>(() => {
    return endpoints.reduce((acc, endpoint) => {
      acc[endpoint.key] = { loading: true };
      return acc;
    }, {} as Record<string, EndpointState>);
  });
  const [autoRefresh, setAutoRefresh] = React.useState(true);
  const [secondsLeft, setSecondsLeft] = React.useState(REFRESH_INTERVAL);
  const [lastUpdated, setLastUpdated] = React.useState<string | null>(null);
  const [selectedHeatmap, setSelectedHeatmap] = React.useState<HeatmapSelection | null>(null);
  const [focusedSection, setFocusedSection] = React.useState<SectionId | null>(null);
  const [highlightSection, setHighlightSection] = React.useState<SectionId | null>(null);
  const [activePanel, setActivePanel] = React.useState<PanelId | null>(null);

  const sectionRefs = React.useRef<Record<SectionId, HTMLDivElement | null>>({
    load: null,
    prices: null,
    afrr: null,
    reserve: null,
    network: null,
    generation: null,
    peak: null,
    forecast: null
  });
  const panelAnchorRef = React.useRef<HTMLDivElement | null>(null);

  const setSectionRef = React.useCallback(
    (id: SectionId, node: HTMLDivElement | null) => {
      sectionRefs.current[id] = node;
    },
    []
  );

  const highlightClass = React.useCallback(
    (ids: SectionId | SectionId[]) => {
      const list = Array.isArray(ids) ? ids : [ids];
      return list.some((id) => highlightSection === id)
        ? "ring-2 ring-primary/40 ring-offset-2 ring-offset-white"
        : "";
    },
    [highlightSection]
  );

  const fetchEndpoint = React.useCallback(async (key: string, limit: string) => {
    const params = new URLSearchParams();
    params.set("endpoint", key);
    params.set("first", limit);

    const response = await fetch(`/api/pse?${params.toString()}`);
    const json = (await response.json()) as PseResponse;

    if (!response.ok) {
      throw new Error((json as { error?: string }).error || "Blad pobierania");
    }

    return json;
  }, []);

  const refreshAll = React.useCallback(async () => {
    setStates((prev) => {
      const next = { ...prev };
      for (const endpoint of endpoints) {
        next[endpoint.key] = { ...next[endpoint.key], loading: true, error: undefined };
      }
      return next;
    });

    await Promise.all(
      endpoints.map(async (endpoint) => {
        try {
          const data = await fetchEndpoint(endpoint.key, endpoint.limit);
          setStates((prev) => ({
            ...prev,
            [endpoint.key]: { loading: false, data }
          }));
        } catch (error) {
          setStates((prev) => ({
            ...prev,
            [endpoint.key]: {
              loading: false,
              error: error instanceof Error ? error.message : String(error)
            }
          }));
        }
      })
    );

    setLastUpdated(
      new Date().toLocaleTimeString("pl-PL", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      })
    );
    setSecondsLeft(REFRESH_INTERVAL);
  }, [fetchEndpoint]);

  React.useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  React.useEffect(() => {
    if (!autoRefresh) return;
    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          refreshAll();
          return REFRESH_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [autoRefresh, refreshAll]);

  React.useEffect(() => {
    if (!focusedSection) return;
    const node = sectionRefs.current[focusedSection];
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setHighlightSection(focusedSection);
    const timer = window.setTimeout(() => setHighlightSection(null), 3500);
    return () => window.clearTimeout(timer);
  }, [focusedSection]);

  const loadState = states["kse-load"];
  const loadRows = loadState?.data?.value ?? [];
  const loadConfig = endpoints.find((endpoint) => endpoint.key === "kse-load");
  const priceConfig = endpoints.find((endpoint) => endpoint.key === "energy-prices");
  const afrrConfig = endpoints.find((endpoint) => endpoint.key === "afrr-status");
  const loadTimeKey = loadRows.length ? getBestTimeKey(loadRows) : undefined;
  const loadSorted = sortRowsByTime(loadRows, loadTimeKey);
  const loadActualKey = pickExactKey(loadSorted, ["load_actual"]);
  const loadForecastKey = pickExactKey(loadSorted, ["load_fcst"]);
  const loadValueKey = loadConfig
    ? pickNumericKey(loadSorted, loadConfig.valueHints)
    : undefined;
  const loadPoints = React.useMemo(() => {
    const primaryKey = loadActualKey || loadValueKey;
    if (!primaryKey || !loadTimeKey) return [] as ChartPoint[];
    return loadSorted
      .map((row) => {
        const value = toNumber(row[primaryKey]);
        const label = String(row[loadTimeKey] ?? "");
        if (value === null || !label) return null;
        return { label, value };
      })
      .filter((point): point is ChartPoint => point !== null);
  }, [loadSorted, loadTimeKey, loadActualKey, loadValueKey]);
  const loadForecastPoints = React.useMemo(() => {
    if (!loadForecastKey || !loadTimeKey) return [] as ChartPoint[];
    return loadSorted
      .map((row) => {
        const value = toNumber(row[loadForecastKey]);
        const label = String(row[loadTimeKey] ?? "");
        if (value === null || !label) return null;
        return { label, value };
      })
      .filter((point): point is ChartPoint => point !== null);
  }, [loadSorted, loadForecastKey, loadTimeKey]);
  const windowPoints = loadPoints.slice(-96);
  const windowSeries = windowPoints.map((point) => point.value);
  const loadStats = computeStats(windowSeries);
  const loadLatestTime = loadTimeKey
    ? String(loadSorted.at(-1)?.[loadTimeKey] ?? "")
    : "";
  const loadForecastSeries = loadForecastPoints.map((point) => point.value);
  const loadForecastLast = loadForecastSeries.length
    ? loadForecastSeries[loadForecastSeries.length - 1]
    : null;
  const canCompareForecast =
    Boolean(loadActualKey) && Boolean(loadForecastKey) && loadForecastLast !== null;
  const forecastDelta =
    canCompareForecast && loadStats ? loadStats.last - loadForecastLast : null;
  const forecastDeltaPct =
    forecastDelta !== null && loadForecastLast !== 0
      ? (forecastDelta / loadForecastLast) * 100
      : null;

  const loadMetaPoints = React.useMemo(() => {
    return loadPoints
      .map((point) => {
        const date = parseDate(point.label);
        if (!date) return null;
        return {
          ...point,
          date,
          dateKey: formatDateKeyLocal(date),
          timeLabel: formatTimeLabel(date)
        };
      })
      .filter(
        (point): point is ChartPoint & { date: Date; dateKey: string; timeLabel: string } =>
          point !== null
      );
  }, [loadPoints]);

  const dayKeys = React.useMemo(() => {
    return Array.from(new Set(loadMetaPoints.map((point) => point.dateKey))).sort();
  }, [loadMetaPoints]);
  const latestDay = dayKeys.length ? dayKeys[dayKeys.length - 1] : null;
  const previousDay = dayKeys.length > 1 ? dayKeys[dayKeys.length - 2] : null;

  const todaySeries = React.useMemo(() => {
    if (!latestDay) return [] as Array<ChartPoint & { timeLabel: string }>;
    return loadMetaPoints
      .filter((point) => point.dateKey === latestDay)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [latestDay, loadMetaPoints]);

  const yesterdaySeries = React.useMemo(() => {
    if (!previousDay) return [] as Array<ChartPoint & { timeLabel: string }>;
    return loadMetaPoints
      .filter((point) => point.dateKey === previousDay)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [previousDay, loadMetaPoints]);

  const alignedTodayPoints = React.useMemo(() => {
    if (!todaySeries.length || !yesterdaySeries.length) {
      return [] as ChartPoint[];
    }
    const yesterdayMap = new Map(
      yesterdaySeries.map((point) => [point.timeLabel, point.value])
    );
    return todaySeries
      .filter((point) => yesterdayMap.has(point.timeLabel))
      .map((point) => ({ label: point.timeLabel, value: point.value }));
  }, [todaySeries, yesterdaySeries]);

  const alignedYesterdayPoints = React.useMemo(() => {
    if (!todaySeries.length || !yesterdaySeries.length) {
      return [] as ChartPoint[];
    }
    const yesterdayMap = new Map(
      yesterdaySeries.map((point) => [point.timeLabel, point.value])
    );
    return todaySeries
      .filter((point) => yesterdayMap.has(point.timeLabel))
      .map((point) => ({
        label: point.timeLabel,
        value: yesterdayMap.get(point.timeLabel) ?? point.value
      }));
  }, [todaySeries, yesterdaySeries]);

  const hasDayCompare =
    alignedTodayPoints.length > 4 &&
    alignedYesterdayPoints.length === alignedTodayPoints.length;

  const compareLabel = hasDayCompare
    ? `Wczoraj (${previousDay})`
    : loadForecastPoints.length
    ? "Prognoza"
    : undefined;

  const chartPoints = hasDayCompare ? alignedTodayPoints : loadPoints.slice(-96);
  const chartComparePoints = hasDayCompare
    ? alignedYesterdayPoints
    : loadForecastPoints.slice(-96);

  const yesterdayDelta = hasDayCompare
    ? chartPoints[chartPoints.length - 1].value -
      chartComparePoints[chartComparePoints.length - 1].value
    : null;
  const yesterdayDeltaPct =
    hasDayCompare && chartComparePoints[chartComparePoints.length - 1].value !== 0
      ? (yesterdayDelta / chartComparePoints[chartComparePoints.length - 1].value) * 100
      : null;

  const heatmap = React.useMemo(() => {
    if (!loadMetaPoints.length) {
      return { days: [] as string[], hours: [] as number[], matrix: [] as (number | null)[][], min: 0, max: 0 };
    }
    const byDayHour = new Map<string, Map<number, number[]>>();
    for (const point of loadMetaPoints) {
      const hour = point.date.getHours();
      const dayMap = byDayHour.get(point.dateKey) ?? new Map<number, number[]>();
      const bucket = dayMap.get(hour) ?? [];
      bucket.push(point.value);
      dayMap.set(hour, bucket);
      byDayHour.set(point.dateKey, dayMap);
    }

    const days = Array.from(byDayHour.keys()).sort().slice(-7);
    const hours = Array.from({ length: 24 }, (_, index) => index);
    const matrix = days.map((day) => {
      const dayMap = byDayHour.get(day);
      return hours.map((hour) => {
        const values = dayMap?.get(hour);
        if (!values || !values.length) return null;
        const avg = values.reduce((acc, value) => acc + value, 0) / values.length;
        return avg;
      });
    });

    const flat = matrix.flat().filter((value): value is number => value !== null);
    const min = flat.length ? Math.min(...flat) : 0;
    const max = flat.length ? Math.max(...flat) : 0;
    return { days, hours, matrix, min, max };
  }, [loadMetaPoints]);

  const { stdPct: volatilityPct } = computeVolatility(windowSeries);
  const ramp = computeRampRate(windowPoints);
  const firstValue = windowSeries.length ? windowSeries[0] : null;
  const loadRangePct = loadStats
    ? computeRangePosition(loadStats.last, loadStats.min, loadStats.max)
    : null;
  const loadLastHourDelta =
    windowSeries.length >= 5
      ? windowSeries[windowSeries.length - 1] - windowSeries[windowSeries.length - 5]
      : null;
  const windowChangePct =
    windowSeries.length > 1 && firstValue !== null && firstValue !== 0
      ? ((windowSeries[windowSeries.length - 1] - firstValue) / firstValue) * 100
      : null;
  const trendLabel =
    windowChangePct === null
      ? "brak danych"
      : windowChangePct > 1
      ? "rosnie"
      : windowChangePct < -1
      ? "spada"
      : "stabilny";
  const anomalies = detectAnomalies(windowPoints);

  const genState = states["gen-jw"];
  const genRows = genState?.data?.value ?? [];
  const genConfig = endpoints.find((endpoint) => endpoint.key === "gen-jw");
  const genTimeKey = genRows.length ? getBestTimeKey(genRows) : undefined;
  const genSnapshot = getLatestRows(genRows, genTimeKey);
  const genLatestTime = genTimeKey
    ? String(genSnapshot[0]?.[genTimeKey] ?? "")
    : "";
  const genValueKey = genConfig ? pickNumericKey(genSnapshot, genConfig.valueHints) : undefined;
  const genLabelKey = genConfig ? pickLabelKey(genSnapshot, genConfig.labelHints) : undefined;
  const genTop = React.useMemo(() => {
    if (!genValueKey || !genLabelKey) return [] as SeriesPoint[];
    const totals = new Map<string, number>();
    for (const row of genSnapshot) {
      const label = String(row[genLabelKey] ?? "Bez nazwy");
      const value = toNumber(row[genValueKey]) ?? 0;
      totals.set(label, (totals.get(label) ?? 0) + value);
    }
    return Array.from(totals.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, 6);
  }, [genLabelKey, genSnapshot, genValueKey]);

  const genTotal = genSnapshot.reduce((acc, row) => {
    if (!genValueKey) return acc;
    return acc + Math.abs(toNumber(row[genValueKey]) ?? 0);
  }, 0);
  const genTop1Share =
    genTotal && genTop.length ? Math.abs(genTop[0].value) / genTotal : null;
  const genTopShare = genTotal
    ? genTop.slice(0, 3).reduce((acc, item) => acc + Math.abs(item.value), 0) / genTotal
    : null;

  const peakState = states["pdgsz"];
  const peakRows = peakState?.data?.value ?? [];
  const peakTimeKey = peakRows.length ? getBestTimeKey(peakRows) : undefined;
  const peakSorted = sortRowsByTime(peakRows, peakTimeKey);
  const peakValueKey =
    pickExactKey(peakSorted, ["usage_fcst"]) ??
    pickNumericKey(peakSorted, ["usage_fcst", "znacznik", "value"]);
  const peakPoints = React.useMemo(() => {
    if (!peakValueKey || !peakTimeKey) return [] as ChartPoint[];
    return peakSorted
      .map((row) => {
        const value = toNumber(row[peakValueKey]);
        const label = String(row[peakTimeKey] ?? "");
        if (value === null || !label) return null;
        return { label, value };
      })
      .filter((point): point is ChartPoint => point !== null);
  }, [peakSorted, peakTimeKey, peakValueKey]);
  const peakLatest = peakPoints.length ? peakPoints[peakPoints.length - 1] : null;
  const peakLatestValue = peakLatest ? Math.round(peakLatest.value) : null;
  const peakStatus =
    peakLatestValue !== null && usageStatusMap[peakLatestValue]
      ? usageStatusMap[peakLatestValue]
      : null;
  const peakRiskCount = peakPoints.filter((point) => point.value >= 2).length;
  const peakStressHours = React.useMemo(() => {
    if (!peakPoints.length) return [] as Array<ChartPoint & { date: Date }>;
    const now = new Date();
    return peakPoints
      .map((point) => {
        const date = parseDate(point.label);
        if (!date) return null;
        return { ...point, date };
      })
      .filter((point): point is ChartPoint & { date: Date } => point !== null)
      .filter((point) => point.date >= now && point.value >= 2)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 6);
  }, [peakPoints]);

  const ogrState = states["ogr-oper"];
  const ogrRows = ogrState?.data?.value ?? [];
  const ogrFromKey = pickExactKey(ogrRows, ["from_dtime_utc", "from_dtime"]);
  const ogrToKey = pickExactKey(ogrRows, ["to_dtime_utc", "to_dtime"]);
  const ogrLabelKey = pickLabelKey(ogrRows, [
    "limiting_element",
    "node",
    "resource_name",
    "resource_code"
  ]);
  const ogrDirectionKey = pickExactKey(ogrRows, ["direction"]);
  const now = new Date();
  const ogrActiveRows = ogrRows.filter((row) => {
    if (!ogrFromKey || !ogrToKey) return true;
    const from = parseDate(row[ogrFromKey]);
    const to = parseDate(row[ogrToKey]);
    if (!from || !to) return true;
    return now >= from && now <= to;
  });
  const ogrActiveCount = ogrActiveRows.length;
  const ogrTotalCount = ogrRows.length;
  const ogrGrouped = new Map<string, number>();
  for (const row of ogrActiveRows) {
    const label = ogrLabelKey ? String(row[ogrLabelKey] ?? "Ograniczenie") : "Ograniczenie";
    const direction = ogrDirectionKey ? String(row[ogrDirectionKey] ?? "") : "";
    const key = direction ? `${label} (${direction})` : label;
    ogrGrouped.set(key, (ogrGrouped.get(key) ?? 0) + 1);
  }
  const ogrTop = Array.from(ogrGrouped.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({ label, value: count }));

  const reserveState = states["lolp"];
  const reserveRows = reserveState?.data?.value ?? [];
  const reserveTimeKey = reserveRows.length ? getBestTimeKey(reserveRows) : undefined;
  const reserveSorted = sortRowsByTime(reserveRows, reserveTimeKey);
  const reservePoints = React.useMemo(() => {
    if (!reserveTimeKey) return [] as Array<{ date: Date; maxP: number; maxB: number }>;
    return reserveSorted
      .map((row) => {
        const date = parseDate(row[reserveTimeKey]);
        if (!date) return null;
        const buckets = extractReserveBuckets(row);
        if (!buckets.length) return null;
        const maxBucket = buckets.reduce((acc, bucket) =>
          bucket.p > acc.p ? bucket : acc
        );
        return { date, maxP: maxBucket.p, maxB: maxBucket.b };
      })
      .filter((point): point is { date: Date; maxP: number; maxB: number } => point !== null);
  }, [reserveSorted, reserveTimeKey]);
  const reserveLatest = reservePoints.length ? reservePoints[reservePoints.length - 1] : null;
  const reserveMaxPct = normalizeProbability(reserveLatest?.maxP ?? null);
  const reserveMaxRange = reserveLatest?.maxB ?? null;
  const reserveRiskHours = reservePoints.filter((point) => {
    const pct = normalizeProbability(point.maxP);
    return pct !== null && pct > INSIGHT_THRESHOLDS.reserveWarnPct;
  }).length;

  const forecastState = states["pk5l-wp"];
  const forecastRows = forecastState?.data?.value ?? [];
  const forecastConfig = endpoints.find((endpoint) => endpoint.key === "pk5l-wp");
  const forecastTimeKey =
    pickExactKey(forecastRows, ["plan_dtime_utc", "plan_dtime"]) ??
    (forecastRows.length ? getBestTimeKey(forecastRows) : undefined);
  const forecastRequiredKey =
    pickExactKey(forecastRows, ["req_pow_res"]) ??
    pickNumericKey(forecastRows, ["req_pow_res", "required", "req"]);
  const forecastAvailablePrimary = pickExactKey(forecastRows, [
    "surplus_cap_avail_tso"
  ]);
  const forecastAvailableSecondary = pickExactKey(forecastRows, [
    "avail_cap_gen_units_stor_prov"
  ]);
  const reserveForecastPoints = React.useMemo(() => {
    if (!forecastTimeKey || !forecastRequiredKey) return [] as ReserveForecastPoint[];
    const today = new Date();
    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );

    const mapped = forecastRows
      .map((row) => {
        const date = parseDate(row[forecastTimeKey]);
        if (!date) return null;
        const required = toNumber(row[forecastRequiredKey]);
        if (required === null) return null;
        const available =
          toNumber(
            forecastAvailablePrimary
              ? row[forecastAvailablePrimary]
              : undefined
          ) ??
          toNumber(
            forecastAvailableSecondary
              ? row[forecastAvailableSecondary]
              : undefined
          );
        const safeAvailable =
          available === null ? required + 1000 : available;
        const label = `${formatDateKeyLocal(date)} ${formatTimeLabel(date)}`;
        return {
          date,
          label,
          available: safeAvailable,
          required,
          margin: safeAvailable - required
        };
      })
      .filter(
        (point): point is ReserveForecastPoint => point !== null
      )
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    const future = mapped.filter((point) => point.date >= startOfToday);
    const base = future.length ? future : mapped;
    return base.slice(0, 72);
  }, [
    forecastRows,
    forecastTimeKey,
    forecastRequiredKey,
    forecastAvailablePrimary,
    forecastAvailableSecondary
  ]);
  const forecastAvailableSeries = reserveForecastPoints.map((point) => ({
    label: point.label,
    value: point.available
  }));
  const forecastRequiredSeries = reserveForecastPoints.map((point) => ({
    label: point.label,
    value: point.required
  }));
  const forecastMargins = reserveForecastPoints.map((point) => point.margin);
  const forecastMinMargin = forecastMargins.length
    ? Math.min(...forecastMargins)
    : null;
  const forecastAlerts = reserveForecastPoints
    .map((point, index) => {
      const isRed =
        point.margin <= 300 || point.available < point.required;
      const isOrange = !isRed && point.margin <= 500;
      if (!isRed && !isOrange) return null;
      return {
        index,
        point,
        level: isRed ? "alert" : "warn",
        color: isRed ? "#e11d48" : "#f59e0b"
      };
    })
    .filter(
      (
        item
      ): item is { index: number; point: ReserveForecastPoint; level: AlertLevel; color: string } =>
        item !== null
    );
  const forecastRedCount = forecastAlerts.filter((item) => item.level === "alert").length;
  const forecastWarnCount = forecastAlerts.filter((item) => item.level === "warn").length;
  const forecastNextAlert = forecastAlerts.length ? forecastAlerts[0] : null;
  const forecastAlertHours = forecastRedCount + forecastWarnCount;
  const forecastRangeLabel = reserveForecastPoints.length
    ? `${reserveForecastPoints[0].label} – ${
        reserveForecastPoints[reserveForecastPoints.length - 1].label
      }`
    : "";
  const forecastAlertMarkers = forecastAlerts.map((item) => ({
    index: item.index,
    color: item.color
  }));

  const priceState = states["energy-prices"];
  const priceRows = priceState?.data?.value ?? [];
  const priceTimeKey = priceRows.length ? getBestTimeKey(priceRows) : undefined;
  const priceSorted = sortRowsByTime(priceRows, priceTimeKey);
  const priceValueKey = priceConfig
    ? pickNumericKey(priceSorted, priceConfig.valueHints)
    : pickNumericKey(priceSorted, ["price", "price_pln", "pln", "rce", "value"]);
  const pricePoints = React.useMemo(() => {
    if (!priceValueKey || !priceTimeKey) return [] as ChartPoint[];
    return priceSorted
      .map((row) => {
        const value = toNumber(row[priceValueKey]);
        const label = String(row[priceTimeKey] ?? "");
        if (value === null || !label) return null;
        return { label, value };
      })
      .filter((point): point is ChartPoint => point !== null);
  }, [priceSorted, priceTimeKey, priceValueKey]);
  const priceWindowPoints = pricePoints.slice(-96);
  const priceSeries = priceWindowPoints.map((point) => point.value);
  const priceStats = computeStats(priceSeries);
  const priceAvg = priceStats?.avg ?? null;
  const priceDeltaPct =
    priceStats && priceAvg
      ? ((priceStats.last - priceAvg) / priceAvg) * 100
      : null;
  const { stdPct: priceVolatilityPct } = computeVolatility(priceSeries);
  const priceAnomalies = detectAnomalies(priceWindowPoints, INSIGHT_THRESHOLDS.priceAnomalyZ);
  const priceMin = priceSeries.length ? Math.min(...priceSeries) : null;
  const priceMax = priceSeries.length ? Math.max(...priceSeries) : null;
  const priceRange =
    priceMin !== null && priceMax !== null ? priceMax - priceMin : null;
  const priceRangePct = computeRangePosition(priceStats?.last ?? null, priceMin, priceMax);
  const priceRamp = computeRampRate(priceWindowPoints);
  const priceLatestTime = priceTimeKey
    ? String(priceSorted.at(-1)?.[priceTimeKey] ?? "")
    : "";

  const afrrState = states["afrr-status"];
  const afrrRows = afrrState?.data?.value ?? [];
  const afrrTimeKey = afrrRows.length ? getBestTimeKey(afrrRows) : undefined;
  const afrrSorted = sortRowsByTime(afrrRows, afrrTimeKey);
  const afrrValueKey = afrrConfig
    ? pickNumericKey(afrrSorted, afrrConfig.valueHints)
    : pickNumericKey(afrrSorted, ["status", "activation", "value", "volume", "mw"]);
  const afrrStatusKey = afrrConfig
    ? pickLabelKey(afrrSorted, afrrConfig.labelHints)
    : pickLabelKey(afrrSorted, ["status", "state", "mode", "direction"]);
  const afrrPoints = React.useMemo(() => {
    if (!afrrValueKey || !afrrTimeKey) return [] as ChartPoint[];
    return afrrSorted
      .map((row) => {
        const value = toNumber(row[afrrValueKey]);
        const label = String(row[afrrTimeKey] ?? "");
        if (value === null || !label) return null;
        return { label, value };
      })
      .filter((point): point is ChartPoint => point !== null);
  }, [afrrSorted, afrrTimeKey, afrrValueKey]);
  const afrrWindowPoints = afrrPoints.slice(-96);
  const afrrActivationCount = afrrWindowPoints.filter((point) => point.value > 0).length;
  const afrrLatestValue = afrrPoints.length ? afrrPoints[afrrPoints.length - 1].value : null;
  const afrrMaxValue = afrrPoints.length
    ? Math.max(...afrrPoints.map((point) => point.value))
    : null;
  const afrrLatestTime = afrrTimeKey
    ? String(afrrSorted.at(-1)?.[afrrTimeKey] ?? "")
    : "";
  const afrrLatestRow = afrrSorted.at(-1);
  const afrrLatestStatus = afrrStatusKey
    ? String(afrrLatestRow?.[afrrStatusKey] ?? "")
    : "";
  const afrrStatusText =
    afrrLatestValue !== null
      ? afrrLatestValue > 0
        ? "Aktywna regulacja"
        : "Brak aktywacji"
      : afrrLatestStatus
      ? afrrLatestStatus
      : "Brak danych";

  const summary = React.useMemo(() => {
    const emptyBlocks = [
      { label: "Teraz", text: "Brak danych o obciazeniu." },
      { label: "Porownanie", text: "Brak danych do porownania." },
      {
        label: "Ryzyko",
        text: "Brak danych o ryzyku i ograniczeniach."
      }
    ];

    if (!loadStats) {
      return { line: "Brak danych do podsumowania.", blocks: emptyBlocks };
    }

    const nowText =
      windowChangePct !== null
        ? `Obciazenie ${trendLabel}, ${formatValue(
            loadStats.last,
            loadConfig?.unit
          )} (${formatPercent(windowChangePct)}).`
        : `Obciazenie ${formatValue(loadStats.last, loadConfig?.unit)}.`;

    const compareParts: string[] = [];
    if (forecastDelta !== null && forecastDeltaPct !== null) {
      compareParts.push(
        `Prognoza ${formatSigned(
          forecastDelta,
          loadConfig?.unit
        )} (${formatPercent(forecastDeltaPct)})`
      );
    }
    if (yesterdayDelta !== null && yesterdayDeltaPct !== null) {
      compareParts.push(
        `Wczoraj ${formatSigned(
          yesterdayDelta,
          loadConfig?.unit
        )} (${formatPercent(yesterdayDeltaPct)})`
      );
    }
    const compareText = compareParts.length
      ? compareParts.join(", ")
      : "Brak danych do porownania.";

    const riskText = `Godziny ryzyka ${peakRiskCount || 0}, ryzyko niedoboru rezerwy ${
      reserveMaxPct === null ? "brak danych" : formatPercent(reserveMaxPct)
    }, ograniczenia ${ogrActiveCount}.`;

    const blocks = [
      { label: "Teraz", text: nowText },
      { label: "Porownanie", text: compareText },
      { label: "Ryzyko", text: riskText }
    ];

    const line = blocks.map((item) => `${item.label}: ${item.text}`).join(" ");
    return { line, blocks };
  }, [
    loadStats,
    loadConfig?.unit,
    windowChangePct,
    loadRangePct,
    loadLastHourDelta,
    trendLabel,
    forecastDelta,
    forecastDeltaPct,
    yesterdayDelta,
    yesterdayDeltaPct,
    peakRiskCount,
    reserveMaxPct,
    ogrActiveCount
  ]);

  const selectedDetails = React.useMemo(() => {
    if (!selectedHeatmap) return null;
    const { day, hour, value } = selectedHeatmap;
    const candidates = loadMetaPoints.filter(
      (point) => point.dateKey === day && point.date.getHours() === hour
    );
    const average =
      candidates.length > 0
        ? candidates.reduce((acc, point) => acc + point.value, 0) / candidates.length
        : null;
    const latest = candidates.length ? candidates[candidates.length - 1] : null;

    const dayIndex = dayKeys.indexOf(day);
    const yesterdayKey = dayIndex > 0 ? dayKeys[dayIndex - 1] : null;
    const yesterdayCandidates = yesterdayKey
      ? loadMetaPoints.filter(
          (point) => point.dateKey === yesterdayKey && point.date.getHours() === hour
        )
      : [];
    const yesterdayAvg = yesterdayCandidates.length
      ? yesterdayCandidates.reduce((acc, point) => acc + point.value, 0) / yesterdayCandidates.length
      : null;
    const yesterdayDelta =
      yesterdayAvg !== null && average !== null ? average - yesterdayAvg : null;

    const stressForHour = peakPoints.find((point) => {
      const date = parseDate(point.label);
      if (!date) return false;
      return formatDateKeyLocal(date) === day && date.getHours() === hour;
    });
    const stressValue = stressForHour ? Math.round(stressForHour.value) : null;
    const stressStatus =
      stressValue !== null && usageStatusMap[stressValue]
        ? usageStatusMap[stressValue]
        : null;

    const reserveForHour = reservePoints.find(
      (point) =>
        formatDateKeyLocal(point.date) === day && point.date.getHours() === hour
    );
    const reservePct = normalizeProbability(reserveForHour?.maxP ?? null);
    const reserveRange = reserveForHour?.maxB ?? null;

    const hourDate = new Date(`${day}T${String(hour).padStart(2, "0")}:00:00`);
    const ogrHits = ogrRows.filter((row) => {
      if (!ogrFromKey || !ogrToKey) return true;
      const from = parseDate(row[ogrFromKey]);
      const to = parseDate(row[ogrToKey]);
      if (!from || !to) return true;
      return hourDate >= from && hourDate <= to;
    });
    const ogrHourGrouped = new Map<string, number>();
    for (const row of ogrHits) {
      const label = ogrLabelKey ? String(row[ogrLabelKey] ?? "Ograniczenie") : "Ograniczenie";
      const direction = ogrDirectionKey ? String(row[ogrDirectionKey] ?? "") : "";
      const key = direction ? `${label} (${direction})` : label;
      ogrHourGrouped.set(key, (ogrHourGrouped.get(key) ?? 0) + 1);
    }
    const ogrHourTop = Array.from(ogrHourGrouped.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([label, count]) => ({ label, value: count }));

    return {
      day,
      hour,
      value,
      average,
      latest,
      yesterdayAvg,
      yesterdayDelta,
      stressStatus,
      reservePct,
      reserveRange,
      ogrHits,
      ogrTop: ogrHourTop
    };
  }, [
    selectedHeatmap,
    loadMetaPoints,
    dayKeys,
    peakPoints,
    reservePoints,
    ogrRows,
    ogrFromKey,
    ogrToKey,
    ogrLabelKey,
    ogrDirectionKey
  ]);

  const alerts: AlertItem[] = [];

  if (loadState?.error) {
    alerts.push({
      id: "load-error",
      level: "alert",
      title: "Brak danych obciazenia",
      detail: "Nie udalo sie pobrac danych obciazenia.",
      sectionId: "load"
    });
  } else if (loadStats && windowSeries.length) {
    const forecastAbs = forecastDeltaPct !== null ? Math.abs(forecastDeltaPct) : null;
    if (forecastAbs !== null && forecastAbs > INSIGHT_THRESHOLDS.forecastWarnPct) {
      alerts.push({
        id: "forecast-delta",
        level:
          forecastAbs > INSIGHT_THRESHOLDS.forecastAlertPct ? "alert" : "warn",
        title: "Rozjazd z prognoza",
        detail: `Odchylenie ${formatPercent(forecastDeltaPct)} vs prognoza.`,
        sectionId: "load",
        context: [
          { label: "Obciazenie", value: formatValue(loadStats.last, loadConfig?.unit) },
          { label: "Prognoza", value: formatValue(loadForecastLast, loadConfig?.unit) },
          { label: "Odchylenie", value: formatSigned(forecastDelta, loadConfig?.unit) }
        ]
      });
    }

    if (ramp.maxDelta !== null && Math.abs(ramp.maxDelta) > INSIGHT_THRESHOLDS.rampWarnMw) {
      alerts.push({
        id: "ramp-rate",
        level:
          Math.abs(ramp.maxDelta) > INSIGHT_THRESHOLDS.rampAlertMw ? "alert" : "warn",
        title: "Gwaltowny skok obciazenia",
        detail: `Najwieksza zmiana: ${formatSigned(
          ramp.maxDelta,
          loadConfig?.unit
        )} (${ramp.label}).`,
        sectionId: "load",
        context: [
          { label: "Max zmiana", value: formatSigned(ramp.maxDelta, loadConfig?.unit) },
          { label: "Czas", value: ramp.label || "-" }
        ]
      });
    }

    if (volatilityPct !== null && volatilityPct > INSIGHT_THRESHOLDS.volatilityWarnPct) {
      alerts.push({
        id: "volatility",
        level:
          volatilityPct > INSIGHT_THRESHOLDS.volatilityAlertPct ? "alert" : "warn",
        title: "Wysoka zmiennosc",
        detail: `Zmiennosc w oknie: ${formatPercent(volatilityPct)}.`,
        sectionId: "load",
        context: [{ label: "Zmiennosc", value: formatPercent(volatilityPct) }]
      });
    }

    if (anomalies.length) {
      const lastAnomaly = anomalies[anomalies.length - 1];
      alerts.push({
        id: "anomalies",
        level: "warn",
        title: "Wykryto anomalie",
        detail: `Ostatnia anomalia: ${lastAnomaly.label} (${formatValue(
          lastAnomaly.value,
          loadConfig?.unit
        )}).`,
        sectionId: "load",
        context: [
          { label: "Liczba anomalii", value: String(anomalies.length) },
          { label: "Ostatnia", value: `${lastAnomaly.label}` }
        ]
      });
    }
  }

  if (genState?.error) {
    alerts.push({
      id: "gen-error",
      level: "warn",
      title: "Brak danych generacji",
      detail: "Nie udalo sie pobrac danych generacji.",
      sectionId: "generation"
    });
  } else if (genTopShare !== null && genTopShare > 0.6) {
    alerts.push({
      id: "gen-concentration",
      level: "warn",
      title: "Wysoka koncentracja generacji",
      detail: `Top 3 jednostki odpowiadaja za ${formatPercent(genTopShare * 100)} mocy.`,
      sectionId: "generation",
      context: [
        { label: "Koncentracja top3", value: formatPercent(genTopShare * 100) }
      ]
    });
  }

  if (peakState?.error) {
    alerts.push({
      id: "peak-error",
      level: "warn",
      title: "Brak danych godzin szczytu",
      detail: "Nie udalo sie pobrac danych godzin szczytu.",
      sectionId: "peak"
    });
  } else if (peakStatus && peakStatus.level !== "ok") {
    alerts.push({
      id: "peak-risk",
      level: peakStatus.level,
      title: peakStatus.label,
      detail: peakStatus.detail,
      sectionId: "peak",
      context: [
        { label: "Godziny ryzyka", value: String(peakRiskCount) }
      ]
    });
  }

  if (ogrState?.error) {
    alerts.push({
      id: "ogr-error",
      level: "warn",
      title: "Brak danych ograniczen",
      detail: "Nie udalo sie pobrac danych ograniczen sieciowych.",
      sectionId: "network"
    });
  } else if (ogrActiveCount >= INSIGHT_THRESHOLDS.ogrWarnCount) {
    alerts.push({
      id: "ogr-count",
      level:
        ogrActiveCount >= INSIGHT_THRESHOLDS.ogrAlertCount ? "alert" : "warn",
      title: "Aktywne ograniczenia sieciowe",
      detail: `${ogrActiveCount} ograniczen w oknie czasowym.`,
      sectionId: "network",
      context: [
        { label: "Aktywne", value: String(ogrActiveCount) },
        { label: "Wszystkie", value: String(ogrTotalCount) }
      ]
    });
  }

  if (reserveState?.error) {
    alerts.push({
      id: "reserve-error",
      level: "warn",
      title: "Brak danych rezerwy",
      detail: "Nie udalo sie pobrac danych o prawdopodobienstwie niedoboru rezerwy.",
      sectionId: "reserve"
    });
  } else if (reserveMaxPct !== null && reserveMaxPct > INSIGHT_THRESHOLDS.reserveWarnPct) {
    alerts.push({
      id: "reserve-risk",
      level:
        reserveMaxPct > INSIGHT_THRESHOLDS.reserveAlertPct ? "alert" : "warn",
      title: "Ryzyko niedoboru rezerwy",
      detail: `Prawdopodobienstwo niedoboru rezerwy: ${formatPercent(reserveMaxPct)}.`,
      sectionId: "reserve",
      context: [
        { label: "Prawdopodobienstwo niedoboru rezerwy", value: formatPercent(reserveMaxPct) },
        {
          label: "Przedzial mocy",
          value: reserveMaxRange !== null ? formatValue(reserveMaxRange, "MW") : "-"
        }
      ]
    });
  }

  if (forecastState?.error) {
    alerts.push({
      id: "forecast-error",
      level: "warn",
      title: "Brak danych prognozy rezerw",
      detail: "Nie udalo sie pobrac prognozy rezerw mocy.",
      sectionId: "forecast"
    });
  } else if (forecastAlerts.length) {
    const nextLabel = forecastNextAlert ? forecastNextAlert.point.label : "brak";
    alerts.push({
      id: "forecast-reserve",
      level: forecastRedCount ? "alert" : "warn",
      title: "Prognoza rezerw mocy",
      detail: `Czerwone: ${forecastRedCount}, Pomaranczowe: ${forecastWarnCount}. Najblizszy: ${nextLabel}.`,
      sectionId: "forecast",
      context: [
        { label: "Czerwone", value: String(forecastRedCount) },
        { label: "Pomaranczowe", value: String(forecastWarnCount) },
        { label: "Najblizszy alert", value: nextLabel }
      ]
    });
  }

  if (priceState?.error) {
    alerts.push({
      id: "price-error",
      level: "warn",
      title: "Brak danych cen",
      detail: "Nie udalo sie pobrac danych cen energii.",
      sectionId: "prices"
    });
  } else if (priceStats && priceSeries.length) {
    const priceDeltaAbs = priceDeltaPct !== null ? Math.abs(priceDeltaPct) : null;
    if (priceDeltaAbs !== null && priceDeltaAbs > INSIGHT_THRESHOLDS.priceJumpWarnPct) {
      alerts.push({
        id: "price-jump",
        level:
          priceDeltaAbs > INSIGHT_THRESHOLDS.priceJumpAlertPct ? "alert" : "warn",
        title: "Skok cen energii",
        detail: `Zmiana vs 24h srednia: ${formatPercent(priceDeltaPct)}.`,
        sectionId: "prices",
        context: [
          { label: "Cena teraz", value: formatValue(priceStats.last, priceConfig?.unit) },
          { label: "Srednia 24h", value: formatValue(priceStats.avg, priceConfig?.unit) }
        ]
      });
    }

    if (
      priceVolatilityPct !== null &&
      priceVolatilityPct > INSIGHT_THRESHOLDS.priceVolWarnPct
    ) {
      alerts.push({
        id: "price-volatility",
        level:
          priceVolatilityPct > INSIGHT_THRESHOLDS.priceVolAlertPct ? "alert" : "warn",
        title: "Wysoka zmiennosc cen",
        detail: `Zmiennosc: ${formatPercent(priceVolatilityPct)}.`,
        sectionId: "prices",
        context: [
          { label: "Zmiennosc", value: formatPercent(priceVolatilityPct) }
        ]
      });
    }

    if (priceAnomalies.length) {
      const lastPriceAnomaly = priceAnomalies[priceAnomalies.length - 1];
      alerts.push({
        id: "price-anomaly",
        level: "warn",
        title: "Anomalia cenowa",
        detail: `Ostatnia anomalia: ${lastPriceAnomaly.label} (${formatValue(
          lastPriceAnomaly.value,
          priceConfig?.unit
        )}).`,
        sectionId: "prices"
      });
    }
  }

  if (afrrState?.error) {
    alerts.push({
      id: "afrr-error",
      level: "warn",
      title: "Brak danych automatycznej rezerwy regulacyjnej",
      detail: "Nie udalo sie pobrac danych automatycznej rezerwy regulacyjnej.",
      sectionId: "afrr"
    });
  } else if (afrrPoints.length) {
    if (afrrActivationCount >= INSIGHT_THRESHOLDS.afrrWarnCount) {
      alerts.push({
        id: "afrr-activations",
        level:
          afrrActivationCount >= INSIGHT_THRESHOLDS.afrrAlertCount ? "alert" : "warn",
        title: "Aktywacje automatycznej rezerwy regulacyjnej",
        detail: `Aktywacje w 24h: ${afrrActivationCount}.`,
        sectionId: "afrr",
        context: [
          { label: "Aktywacje 24h", value: String(afrrActivationCount) },
          { label: "Ostatnia probka", value: afrrLatestTime || "-" }
        ]
      });
    }
    if (afrrLatestValue !== null && afrrLatestValue > INSIGHT_THRESHOLDS.afrrAlertMw) {
      alerts.push({
        id: "afrr-volume",
        level: "alert",
        title: "Wysoka aktywacja automatycznej rezerwy regulacyjnej",
        detail: `Aktywacja: ${formatValue(afrrLatestValue, afrrConfig?.unit)}.`,
        sectionId: "afrr"
      });
    }
  }

  if (!alerts.length) {
    alerts.push({
      id: "ok",
      level: "ok",
      title: "Brak sygnalow krytycznych",
      detail: "W ostatnim oknie nie wykryto odchylen statystycznych." 
    });
  }

  const alertCounts = React.useMemo(() => {
    return alerts.reduce(
      (acc, item) => {
        acc[item.level] += 1;
        return acc;
      },
      { ok: 0, warn: 0, alert: 0 }
    );
  }, [alerts]);

  const panel = React.useMemo(() => {
    if (!activePanel) return null;

    switch (activePanel) {
      case "load": {
        return {
          title: "Obciazenie systemu elektroenergetycznego",
          subtitle: loadLatestTime ? `Ostatnia probka: ${loadLatestTime}` : "",
          content: (
            <div className="space-y-2 text-xs text-muted-foreground">
              {chartPoints.length > 1 ? (
                <div className="rounded-lg border border-border/60 bg-white/70 p-2">
                  <Sparkline points={chartPoints} className="text-sky-600" />
                  <div className="text-[10px] text-muted-foreground text-center">
                    Ostatnie probki
                  </div>
                </div>
              ) : null}
              <PanelRow
                label="Aktualne obciazenie"
                value={formatValue(loadStats?.last ?? null, loadConfig?.unit)}
              />
              <PanelRow
                label="Srednia 24h"
                value={formatValue(loadStats?.avg ?? null, loadConfig?.unit)}
              />
              <PanelRow
                label="Min / Max"
                value={`${formatValue(loadStats?.min ?? null, loadConfig?.unit)} / ${formatValue(
                  loadStats?.max ?? null,
                  loadConfig?.unit
                )}`}
              />
              <PanelRow
                label="Pozycja w zakresie 24h"
                value={loadRangePct === null ? "-" : `${loadRangePct.toFixed(0)}%`}
              />
              <PanelRow
                label="Trend 24h"
                value={
                  windowChangePct === null
                    ? "-"
                    : `${trendLabel} (${formatPercent(windowChangePct)})`
                }
              />
              <PanelRow
                label="Vs prognoza"
                value={
                  forecastDelta === null
                    ? "-"
                    : `${formatSigned(
                        forecastDelta,
                        loadConfig?.unit
                      )} (${formatPercent(forecastDeltaPct)})`
                }
              />
              <PanelRow
                label="Vs wczoraj"
                value={
                  yesterdayDelta === null
                    ? "-"
                    : `${formatSigned(
                        yesterdayDelta,
                        loadConfig?.unit
                      )} (${formatPercent(yesterdayDeltaPct)})`
                }
              />
              <PanelRow
                label="Zmiana ostatniej godziny"
                value={
                  loadLastHourDelta === null
                    ? "-"
                    : formatSigned(loadLastHourDelta, loadConfig?.unit)
                }
              />
              <PanelRow label="Zmiennosc" value={formatPercent(volatilityPct)} />
              <PanelRow
                label="Najwiekszy skok"
                value={
                  ramp.maxDelta === null
                    ? "-"
                    : `${formatSigned(ramp.maxDelta, loadConfig?.unit)} (${ramp.label})`
                }
              />
              {anomalies.length ? (
                <div className="rounded-lg border border-border/60 bg-white/70 p-2 text-[11px]">
                  Ostatnia anomalia: {anomalies[anomalies.length - 1].label} (
                  {formatValue(anomalies[anomalies.length - 1].value, loadConfig?.unit)})
                </div>
              ) : null}
            </div>
          )
        };
      }
      case "heatmap": {
        return {
          title: "Heatmapa obciazenia",
          subtitle: "Ostatnie 7 dni",
          content: (
            <div className="space-y-2 text-xs text-muted-foreground">
              <PanelRow
                label="Min / Max"
                value={`${formatValue(heatmap.min, loadConfig?.unit)} / ${formatValue(
                  heatmap.max,
                  loadConfig?.unit
                )}`}
              />
              <PanelRow
                label="Godziny z danymi"
                value={heatmap.matrix.flat().filter((value) => value !== null).length}
              />
              {selectedDetails ? (
                <div className="rounded-lg border border-border/60 bg-white/70 p-2 text-[11px]">
                  Wybrana godzina: {selectedDetails.day}{" "}
                  {String(selectedDetails.hour).padStart(2, "0")}:00
                  <div>Obciazenie: {formatValue(selectedDetails.value, loadConfig?.unit)}</div>
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground">
                  Kliknij kafelek, aby zobaczyc szczegoly.
                </div>
              )}
            </div>
          )
        };
      }
      case "summary": {
        return {
          title: "Szybki opis sytuacji",
          subtitle: "Podsumowanie 24h",
          content: (
            <div className="space-y-2 text-xs text-muted-foreground">
              {summary.blocks.length ? (
                <div className="space-y-2 text-sm text-muted-foreground">
                  {summary.blocks.map((item) => (
                    <div key={item.label} className="rounded-lg border border-border/60 bg-muted/40 p-2">
                      <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                        {item.label}
                      </p>
                      <p className="mt-1 text-sm text-foreground">{item.text}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p>{summary.line}</p>
              )}
              <PanelRow
                label="Sygnaly ostrzegawcze"
                value={alerts.filter((item) => item.level !== "ok").length}
              />
              <PanelRow label="Ostatnia probka" value={loadLatestTime || "-"} />
              <PanelRow
                label="Trend 24h"
                value={
                  windowChangePct === null
                    ? "-"
                    : `${trendLabel} (${formatPercent(windowChangePct)})`
                }
              />
              <PanelRow
                label="Vs prognoza"
                value={
                  forecastDelta === null
                    ? "-"
                    : `${formatSigned(
                        forecastDelta,
                        loadConfig?.unit
                      )} (${formatPercent(forecastDeltaPct)})`
                }
              />
              <PanelRow
                label="Vs wczoraj"
                value={
                  yesterdayDelta === null
                    ? "-"
                    : `${formatSigned(
                        yesterdayDelta,
                        loadConfig?.unit
                      )} (${formatPercent(yesterdayDeltaPct)})`
                }
              />
              <PanelRow label="Zmiennosc" value={formatPercent(volatilityPct)} />
              <PanelRow
                label="Max zmiana"
                value={
                  ramp.maxDelta === null
                    ? "-"
                    : `${formatSigned(ramp.maxDelta, loadConfig?.unit)} (${ramp.label})`
                }
              />
              <PanelRow label="Anomalie" value={anomalies.length || 0} />
              <PanelRow label="Godziny ryzyka" value={peakRiskCount || 0} />
              <PanelRow
                label={<LabelWithAbbr full={ABBR.lolp.full} abbr={ABBR.lolp.abbr} />}
                value={reserveMaxPct === null ? "-" : formatPercent(reserveMaxPct)}
              />
              <PanelRow label="Ograniczenia aktywne" value={ogrActiveCount} />
            </div>
          )
        };
      }
      case "trend": {
        return {
          title: "Analiza trendu",
          subtitle: "Dynamika obciazenia",
          content: (
            <div className="space-y-2 text-xs text-muted-foreground">
              <PanelRow
                label="Trend 24h"
                value={
                  windowChangePct === null
                    ? "-"
                    : `${trendLabel} (${formatPercent(windowChangePct)})`
                }
              />
              <PanelRow label="Zmiennosc" value={formatPercent(volatilityPct)} />
              <PanelRow
                label="Zakres"
                value={formatValue(
                  loadStats ? loadStats.max - loadStats.min : null,
                  loadConfig?.unit
                )}
              />
              <PanelRow
                label="Max zmiana"
                value={
                  ramp.maxDelta === null
                    ? "-"
                    : `${formatSigned(ramp.maxDelta, loadConfig?.unit)} (${ramp.label})`
                }
              />
              <PanelRow label="Anomalie" value={anomalies.length || 0} />
              {anomalies.length ? (
                <div className="rounded-lg border border-border/60 bg-white/70 p-2 text-[11px]">
                  Ostatnia anomalia: {anomalies[anomalies.length - 1].label} (
                  {formatValue(anomalies[anomalies.length - 1].value, loadConfig?.unit)})
                </div>
              ) : null}
            </div>
          )
        };
      }
      case "peak": {
        return {
          title: "Godziny szczytu",
          subtitle: "Ryzyko zuzycia",
          content: (
            <div className="space-y-2 text-xs text-muted-foreground">
              <PanelRow
                label="Status"
                value={peakStatus ? peakStatus.label : "Brak danych"}
              />
              <PanelRow label="Godziny ryzyka" value={peakRiskCount} />
              <PanelRow
                label={<LabelWithAbbr full={ABBR.lolp.full} abbr={ABBR.lolp.abbr} />}
                value={reserveMaxPct === null ? "-" : formatPercent(reserveMaxPct)}
              />
              {peakStressHours.length ? (
                <div className="rounded-lg border border-border/60 bg-white/70 p-2 text-[11px]">
                  <p className="mb-1 uppercase tracking-[0.2em] text-muted-foreground">
                    Nadchodzace
                  </p>
                  <div className="space-y-1">
                    {peakStressHours.map((point, index) => (
                      <div key={`${point.label}-${index}`} className="flex justify-between">
                        <span>
                          {formatDateKeyLocal(point.date)} {formatTimeLabel(point.date)}
                        </span>
                        <span>{usageStatusMap[Math.round(point.value)]?.label ?? "-"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )
        };
      }
      case "prices": {
        const priceAvgLine =
          priceAvg !== null
            ? priceWindowPoints.map((point) => ({ label: point.label, value: priceAvg }))
            : [];
        return {
          title: "Ceny energii",
          subtitle: priceLatestTime ? `Ostatnia probka: ${priceLatestTime}` : "",
          content: (
            <div className="space-y-2 text-xs text-muted-foreground">
              {priceWindowPoints.length > 1 ? (
                <InteractiveLineChart
                  points={priceWindowPoints}
                  comparePoints={priceAvgLine.length > 1 ? priceAvgLine : undefined}
                  compareLabel="Srednia 24h"
                  unit={priceConfig?.unit}
                  showChips
                  chipLabels={{ primary: "Cena teraz", secondary: "Srednia 24h" }}
                />
              ) : (
                <div className="text-sm text-muted-foreground">Brak danych do wykresu.</div>
              )}
              {priceAvgLine.length > 1 ? (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="h-0.5 w-5 border-t-2 border-dashed border-primary/60" />
                  Srednia 24h
                </div>
              ) : null}
              <PanelRow
                label="Cena teraz"
                value={formatValue(priceStats?.last ?? null, priceConfig?.unit)}
              />
              <PanelRow
                label="Srednia 24h"
                value={formatValue(priceAvg, priceConfig?.unit)}
              />
              <PanelRow
                label="Pozycja w zakresie 24h"
                value={priceRangePct === null ? "-" : `${priceRangePct.toFixed(0)}%`}
              />
              <PanelRow
                label="Min / Max"
                value={`${formatValue(priceMin, priceConfig?.unit)} / ${formatValue(
                  priceMax,
                  priceConfig?.unit
                )}`}
              />
              <PanelRow
                label="Zakres dobowy"
                value={priceRange === null ? "-" : formatValue(priceRange, priceConfig?.unit)}
              />
              <PanelRow
                label="Zmiana vs srednia"
                value={priceDeltaPct === null ? "-" : formatPercent(priceDeltaPct)}
              />
              <PanelRow
                label="Najwiekszy skok 24h"
                value={
                  priceRamp.maxDelta === null
                    ? "-"
                    : `${formatSigned(priceRamp.maxDelta, priceConfig?.unit)} (${priceRamp.label})`
                }
              />
              <PanelRow
                label="Zmiennosc"
                value={formatPercent(priceVolatilityPct)}
              />
              <PanelRow
                label="Anomalie"
                value={priceAnomalies.length ? `${priceAnomalies.length} wykryte` : "brak"}
              />
              {priceAnomalies.length ? (
                <div className="rounded-lg border border-border/60 bg-white/70 p-2 text-[11px]">
                  <p className="mb-1 uppercase tracking-[0.2em] text-muted-foreground">
                    Ostatnie anomalie
                  </p>
                  <div className="space-y-1">
                    {priceAnomalies
                      .slice(-3)
                      .map((item) => (
                        <div key={item.label} className="flex justify-between">
                          <span>{item.label}</span>
                          <span>{formatValue(item.value, priceConfig?.unit)}</span>
                        </div>
                      ))
                      .reverse()}
                  </div>
                </div>
              ) : null}
            </div>
          )
        };
      }
      case "forecast": {
        return {
          title: "Prognoza rezerw mocy",
          subtitle: forecastRangeLabel ? `Zakres: ${forecastRangeLabel}` : "",
          content: (
            <div className="space-y-2 text-xs text-muted-foreground">
              {reserveForecastPoints.length > 1 ? (
                <InteractiveLineChart
                  points={forecastAvailableSeries}
                  comparePoints={forecastRequiredSeries}
                  compareLabel="Wymagana rezerwa"
                  unit={forecastConfig?.unit ?? "MW"}
                  markers={forecastAlertMarkers}
                  getTooltipExtra={(_, point, comparePoint) => {
                    const margin =
                      comparePoint !== null ? point.value - comparePoint.value : null;
                    return `Margines: ${formatValue(margin, "MW")}`;
                  }}
                />
              ) : (
                <div className="text-sm text-muted-foreground">Brak danych do wykresu.</div>
              )}
              <PanelRow
                label="Najnizszy margines"
                value={formatValue(forecastMinMargin, "MW")}
              />
              <PanelRow
                label="Godziny alertu"
                value={forecastAlertHours}
              />
              <PanelRow
                label="Najblizszy alert"
                value={forecastNextAlert ? forecastNextAlert.point.label : "brak"}
              />
            </div>
          )
        };
      }
      case "alerts": {
        return {
          title: "Sytuacje nienormatywne",
          subtitle: "Podsumowanie alertow",
          content: (
            <div className="space-y-2 text-xs text-muted-foreground">
              <PanelRow label="Krytyczne" value={alertCounts.alert} />
              <PanelRow label="Ostrzezenia" value={alertCounts.warn} />
              <PanelRow label="OK" value={alertCounts.ok} />
              {alerts.length ? (
                <div className="rounded-lg border border-border/60 bg-white/70 p-2 text-[11px]">
                  <p className="mb-1 uppercase tracking-[0.2em] text-muted-foreground">
                    Najwazniejsze
                  </p>
                  <div className="space-y-1">
                    {alerts.slice(0, 4).map((item) => (
                      <div key={item.id} className="flex justify-between">
                        <span>{item.title}</span>
                        <span>{item.level.toUpperCase()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="text-[11px] text-muted-foreground">
                To heurystyka statystyczna - nie jest to oficjalne ostrzezenie PSE.
              </div>
            </div>
          )
        };
      }
      case "generation": {
        return {
          title: "Generacja",
          subtitle: genLatestTime ? `Ostatni snapshot: ${genLatestTime}` : "",
          content: (
            <div className="space-y-2 text-xs text-muted-foreground">
              {genTop.length ? (
                <div className="rounded-lg border border-border/60 bg-white/70 p-2 text-[11px]">
                  <p className="mb-1 uppercase tracking-[0.2em] text-muted-foreground">
                    Top jednostki
                  </p>
                  <div className="space-y-1">
                    {genTop.slice(0, 5).map((item) => (
                      <div key={item.label} className="flex justify-between">
                        <span>{item.label}</span>
                        <span>{formatValue(item.value, genConfig?.unit)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div>Brak danych o generacji.</div>
              )}
              <PanelRow
                label="Koncentracja top3"
                value={genTopShare === null ? "-" : formatPercent(genTopShare * 100)}
              />
            </div>
          )
        };
      }
      case "network": {
        return {
          title: "Ograniczenia sieci",
          subtitle: `Aktywne: ${ogrActiveCount}`,
          content: (
            <div className="space-y-2 text-xs text-muted-foreground">
              <PanelRow label="Aktywne ograniczenia" value={ogrActiveCount} />
              <PanelRow label="Wszystkie" value={ogrTotalCount} />
              {ogrTop.length ? (
                <div className="rounded-lg border border-border/60 bg-white/70 p-2 text-[11px]">
                  <p className="mb-1 uppercase tracking-[0.2em] text-muted-foreground">
                    Top ograniczenia
                  </p>
                  <div className="space-y-1">
                    {ogrTop.map((item) => (
                      <div key={item.label} className="flex justify-between">
                        <span>{item.label}</span>
                        <span>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )
        };
      }
      case "reserve":
      case "afrr": {
        return {
          title: "Rezerwy i regulacja",
          subtitle: `${ABBR.lolp.full} i ${ABBR.afrr.full}`,
          content: (
            <div className="space-y-2 text-xs text-muted-foreground">
              <PanelRow
                label={
                  <span className="inline-flex items-center gap-2">
                    Szczyt ryzyka <LabelWithAbbr full={ABBR.lolp.full} abbr={ABBR.lolp.abbr} />
                  </span>
                }
                value={reserveMaxPct === null ? "-" : formatPercent(reserveMaxPct)}
              />
              <PanelRow label="Godziny ryzyka" value={reserveRiskHours} />
              <PanelRow
                label="Przedzial mocy"
                value={reserveMaxRange !== null ? formatValue(reserveMaxRange, "MW") : "-"}
              />
              <div className="h-px bg-border/60" />
              <PanelRow
                label={
                  <span className="inline-flex items-center gap-2">
                    Status <LabelWithAbbr full={ABBR.afrr.full} abbr={ABBR.afrr.abbr} />
                  </span>
                }
                value={afrrStatusText}
              />
              <PanelRow
                label={
                  <span className="inline-flex items-center gap-2">
                    Aktywacje 24h <LabelWithAbbr full={ABBR.afrr.full} abbr={ABBR.afrr.abbr} />
                  </span>
                }
                value={afrrPoints.length ? afrrActivationCount : "-"}
              />
              <PanelRow
                label={
                  <span className="inline-flex items-center gap-2">
                    Maksymalna aktywacja <LabelWithAbbr full={ABBR.afrr.full} abbr={ABBR.afrr.abbr} />
                  </span>
                }
                value={afrrMaxValue !== null ? formatValue(afrrMaxValue, afrrConfig?.unit) : "-"}
              />
            </div>
          )
        };
      }
      default:
        return null;
    }
  }, [
    activePanel,
    loadLatestTime,
    loadStats,
    loadConfig?.unit,
    windowChangePct,
    trendLabel,
    forecastDelta,
    forecastDeltaPct,
    yesterdayDelta,
    yesterdayDeltaPct,
    volatilityPct,
    ramp.maxDelta,
    ramp.label,
    anomalies,
    heatmap,
    selectedDetails,
    summary.line,
    summary.blocks,
    alerts,
    alertCounts,
    peakStatus,
    peakRiskCount,
    peakStressHours,
    priceLatestTime,
    priceStats,
    priceConfig?.unit,
    priceMin,
    priceMax,
    priceRange,
    priceRangePct,
    priceRamp,
    priceAvg,
    priceDeltaPct,
    priceVolatilityPct,
    priceAnomalies,
    forecastRangeLabel,
    reserveForecastPoints,
    forecastAvailableSeries,
    forecastRequiredSeries,
    forecastAlertMarkers,
    forecastMinMargin,
    forecastAlertHours,
    forecastNextAlert,
    forecastConfig?.unit,
    genLatestTime,
    genTop,
    genConfig?.unit,
    genTopShare,
    ogrActiveCount,
    ogrTotalCount,
    ogrTop,
    reserveMaxPct,
    reserveMaxRange,
    reserveRiskHours,
    afrrStatusText,
    afrrActivationCount,
    afrrPoints.length,
    afrrMaxValue,
    afrrConfig?.unit
  ]);

  const hasPanel = Boolean(panel);
  const panelItemClass = hasPanel ? "is-panel-item" : "";
  const activePanelClass = (id: PanelId) =>
    hasPanel && activePanel === id ? "is-panel-item-active" : "";
  const metricsGridClass = hasPanel
    ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-1"
    : "grid gap-6 md:grid-cols-2 xl:grid-cols-4";
  const summaryGridClass = hasPanel
    ? "grid gap-4 lg:grid-cols-1"
    : "grid gap-6 md:grid-cols-2 lg:grid-cols-2";
  const pairGridClass = hasPanel
    ? "grid gap-4 lg:grid-cols-1"
    : "grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]";
  const bottomGridClass = hasPanel
    ? "grid gap-4 lg:grid-cols-1"
    : "grid gap-6 md:grid-cols-2 lg:grid-cols-3";
  const summaryBlocksClass = hasPanel
    ? "grid gap-2 sm:grid-cols-1"
    : "grid gap-3 sm:grid-cols-3";

  const panelNavItems = React.useMemo(
    () => [
      { id: "summary", label: "Szybki opis" },
      { id: "load", label: "Obciazenie" },
      { id: "trend", label: "Trend" },
      { id: "peak", label: "Szczyt" },
      { id: "heatmap", label: "Heatmapa" },
      { id: "forecast", label: "Prognoza" },
      { id: "prices", label: "Ceny" },
      { id: "alerts", label: "Alerty" },
      { id: "generation", label: "Generacja" },
      { id: "network", label: "Ograniczenia" },
      { id: "reserve", label: "Rezerwy" }
    ],
    []
  );

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const className = "kse-panel-open";
    if (hasPanel) {
      document.body.classList.add(className);
    } else {
      document.body.classList.remove(className);
    }
    return () => {
      document.body.classList.remove(className);
    };
  }, [hasPanel]);

  React.useEffect(() => {
    if (!activePanel || typeof window === "undefined") return;
    if (window.innerWidth < 1024) return;
    const node = panelAnchorRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const inView = rect.top >= 0 && rect.top < window.innerHeight * 0.6;
    if (!inView) {
      window.requestAnimationFrame(() => {
        node.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [activePanel]);

  return (
    <div className="lg:flex lg:items-stretch lg:gap-6">
      <section
        className={`transition-all duration-300 ${
          hasPanel ? "space-y-6" : "space-y-10"
        } ${
          hasPanel
            ? "lg:basis-[30%] lg:max-w-[30%]"
            : "lg:basis-full lg:max-w-full"
        }`}
      >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
            Live overview
          </p>
          <h2 className="text-3xl font-semibold">
            <span className="inline-flex items-center gap-2">
              <LabelWithAbbr full={ABBR.kse.full} abbr={ABBR.kse.abbr} />
              <span>— analityka w czasie rzeczywistym</span>
            </span>
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => refreshAll()}>
            <RefreshCcw className="mr-2 h-4 w-4" /> Odswiez wszystko
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAutoRefresh((prev) => !prev)}
          >
            Auto: {autoRefresh ? "ON" : "OFF"}
          </Button>
          <Badge variant="outline" className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                autoRefresh ? "bg-emerald-400 animate-pulse-soft" : "bg-muted-foreground/40"
              }`}
            />
            {autoRefresh ? `Live • ${secondsLeft}s` : "Pauza"}
          </Badge>
          {lastUpdated ? (
            <span className="text-xs text-muted-foreground">Aktualizacja: {lastUpdated}</span>
          ) : null}
        </div>
      </div>

      <div className={metricsGridClass}>
        {[
          {
            id: "load",
            label: "Aktualne obciazenie",
            value: formatValue(loadStats?.last ?? null, loadConfig?.unit),
            helper: loadActualKey
              ? "Zrodlo: obciazenie rzeczywiste"
              : loadValueKey
              ? "Zrodlo: wartosc glowna"
              : "Brak danych",
            trend: { value: loadStats?.delta ?? null, percent: loadStats?.deltaPct ?? null }
          },
          {
            id: "trend",
            label: "Szczyt okna",
            value: formatValue(loadStats?.max ?? null, loadConfig?.unit),
            helper: "Okno analizy"
          },
          {
            id: "trend",
            label: "Minimum okna",
            value: formatValue(loadStats?.min ?? null, loadConfig?.unit),
            helper: "Okno analizy"
          },
          {
            id: "trend",
            label: "Srednia",
            value: formatValue(loadStats?.avg ?? null, loadConfig?.unit),
            helper: "Srednia z okna"
          }
        ].map((item, index) => (
          <div
            key={`${item.label}-${index}`}
            onClick={() => setActivePanel(item.id as PanelId)}
            className={`cursor-pointer ${
              hasPanel ? "is-panel-item" : ""
            } ${highlightClass(item.id as SectionId)}`}
          >
            <MetricCard
              label={item.label}
              value={item.value}
              helper={item.helper}
              trend={item.trend}
              className={`${panelItemClass} ${activePanelClass(item.id as PanelId)}`}
            />
          </div>
        ))}
      </div>

      <div
        ref={(node) => setSectionRef("load", node)}
        className={highlightClass("load")}
      >
        <Card
          className={`border-border/60 bg-white/80 rise-in hover-lift ${panelItemClass} ${activePanelClass(
            "load"
          )}`}
        >
          <CardHeader className="space-y-2">
            <div
              className="flex flex-wrap items-center justify-between gap-2 cursor-pointer"
              onClick={() => setActivePanel("load")}
            >
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
                  Obciazenie
                </p>
                <CardTitle className="text-2xl">Trend zapotrzebowania</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {loadConfig?.label ?? "Obciazenie systemu elektroenergetycznego"}
                </Badge>
                <DetailTrigger onClick={() => setActivePanel("load")} />
              </div>
            </div>
            {loadLatestTime ? (
              <p className="text-xs text-muted-foreground">
                Ostatnia probka: {loadLatestTime}
              </p>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {loadState?.error ? (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                {loadState.error}
              </div>
            ) : (
              <InteractiveLineChart
                points={chartPoints}
                comparePoints={compareLabel ? chartComparePoints : undefined}
                compareLabel={compareLabel}
                unit={loadConfig?.unit}
              />
            )}
            <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
              <div className="flex items-center justify-between">
                <span>Aktualne</span>
                <span className="font-medium text-foreground">
                  {formatValue(loadStats?.last ?? null, loadConfig?.unit)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Trend 24h</span>
                <span className="font-medium text-foreground">
                  {windowChangePct === null
                    ? "-"
                    : `${trendLabel} (${formatPercent(windowChangePct)})`}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Vs prognoza</span>
                <span className="font-medium text-foreground">
                  {forecastDelta === null
                    ? "-"
                    : `${formatSigned(
                        forecastDelta,
                        loadConfig?.unit
                      )} (${formatPercent(forecastDeltaPct)})`}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card
        className={`border-border/60 bg-white/80 rise-in hover-lift ${panelItemClass} ${activePanelClass(
          "heatmap"
        )}`}
      >
        <CardHeader className="space-y-2">
            <div
              className="flex flex-wrap items-center justify-between gap-2 cursor-pointer"
              onClick={() => setActivePanel("heatmap")}
            >
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
                  Heatmapa
                </p>
                <CardTitle className="text-2xl">Dobowe rozklady obciazenia</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">Ostatnie 7 dni</Badge>
                <DetailTrigger onClick={() => setActivePanel("heatmap")} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Rozklad obciazenia w ukladzie godzinowym.
            </p>
          </CardHeader>
        <CardContent className="space-y-4">
          {heatmap.days.length ? (
            <div className="space-y-3">
              <div className="grid grid-cols-[90px_repeat(24,minmax(0,1fr))] gap-1 text-[10px]">
                <div />
                {heatmap.hours.map((hour) => (
                  <div key={`h-${hour}`} className="text-center text-muted-foreground">
                    {hour % 4 === 0 ? hour : ""}
                  </div>
                ))}
                {heatmap.days.map((day, dayIndex) => (
                  <React.Fragment key={day}>
                    <div className="text-[11px] text-muted-foreground">{day}</div>
                    {heatmap.hours.map((hour, hourIndex) => {
                      const value = heatmap.matrix[dayIndex][hourIndex];
                      const isSelected =
                        selectedHeatmap?.day === day && selectedHeatmap?.hour === hour;
                      return (
                        <button
                          type="button"
                          key={`${day}-${hour}`}
                          title={
                            value === null
                              ? `${day} ${hour}:00 • brak danych`
                              : `${day} ${hour}:00 • ${formatValue(value, loadConfig?.unit)}`
                          }
                          className={`h-4 rounded-sm border border-border/40 transition ${
                            isSelected
                              ? "ring-2 ring-primary/70 ring-offset-1 ring-offset-white"
                              : "hover:ring-2 hover:ring-primary/40 hover:ring-offset-1 hover:ring-offset-white"
                          }`}
                          style={{
                            backgroundColor: heatColor(value, heatmap.min, heatmap.max)
                          }}
                          onClick={() => {
                            setSelectedHeatmap((prev) => {
                              if (prev && prev.day === day && prev.hour === hour) {
                                return null;
                              }
                              return { day, hour, value };
                            });
                          }}
                        />
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Min: {formatValue(heatmap.min, loadConfig?.unit)} • Max:{" "}
                  {formatValue(heatmap.max, loadConfig?.unit)}
                </span>
                <span>
                  Godziny z danymi:{" "}
                  {heatmap.matrix.flat().filter((value) => value !== null).length}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Brak danych do heatmapy.</div>
          )}
        </CardContent>
      </Card>

      <div
        ref={(node) => setSectionRef("forecast", node)}
        className={highlightClass("forecast")}
      >
        <Card
          className={`border-border/60 bg-white/80 rise-in hover-lift ${panelItemClass} ${activePanelClass(
            "forecast"
          )}`}
        >
          <CardHeader className="space-y-2">
            <div
              className="flex flex-wrap items-center justify-between gap-2 cursor-pointer"
              onClick={() => setActivePanel("forecast")}
            >
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
                  Prognoza
                </p>
                <CardTitle className="text-2xl">Rezerwy mocy na 72h</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Plan 5-letni</Badge>
                <DetailTrigger onClick={() => setActivePanel("forecast")} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Prognozowana rezerwa vs wymagana rezerwa mocy.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {forecastState?.error ? (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                {forecastState.error}
              </div>
            ) : reserveForecastPoints.length > 1 ? (
              <InteractiveLineChart
                points={forecastAvailableSeries}
                comparePoints={forecastRequiredSeries}
                compareLabel="Wymagana rezerwa"
                unit={forecastConfig?.unit ?? "MW"}
                markers={forecastAlertMarkers}
                getTooltipExtra={(_, point, comparePoint) => {
                  const margin =
                    comparePoint !== null ? point.value - comparePoint.value : null;
                  return `Margines: ${formatValue(margin, "MW")}`;
                }}
              />
            ) : (
              <div className="text-sm text-muted-foreground">Brak danych do wykresu.</div>
            )}
            <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
              <div className="flex items-center justify-between">
                <span>Najnizszy margines</span>
                <span className="font-medium text-foreground">
                  {formatValue(forecastMinMargin, "MW")}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Godziny alertu</span>
                <span className="font-medium text-foreground">{forecastAlertHours}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Najblizszy alert</span>
                <span className="font-medium text-foreground">
                  {forecastNextAlert ? forecastNextAlert.point.label : "brak"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className={summaryGridClass}>
        <Card
          className={`border-border/60 bg-white/80 rise-in hover-lift ${panelItemClass} ${activePanelClass(
            "summary"
          )}`}
        >
          <CardHeader>
            <div
              className="flex items-center justify-between gap-2 cursor-pointer"
              onClick={() => setActivePanel("summary")}
            >
              <CardTitle className="text-2xl">Szybki opis sytuacji</CardTitle>
              <DetailTrigger onClick={() => setActivePanel("summary")} />
            </div>
            <p className="text-xs text-muted-foreground">
              Trzy najwazniejsze sygnaly z ostatnich 24 godzin.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            {summary.blocks.length ? (
              <div className={summaryBlocksClass}>
                {summary.blocks.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-lg border border-border/60 bg-white/70 p-3"
                  >
                    <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                      {item.label}
                    </p>
                    <p className="mt-1 text-xs text-foreground">{item.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p>{summary.line}</p>
            )}
          </CardContent>
        </Card>

        <Card
          className={`border-border/60 bg-white/80 rise-in hover-lift ${panelItemClass} ${activePanelClass(
            "trend"
          )}`}
        >
          <CardHeader>
            <div
              className="flex items-center justify-between gap-2 cursor-pointer"
              onClick={() => setActivePanel("trend")}
            >
              <CardTitle className="text-2xl">Analiza trendu</CardTitle>
              <DetailTrigger onClick={() => setActivePanel("trend")} />
            </div>
            <p className="text-xs text-muted-foreground">
              Najwazniejsze wskazniki dynamiki obciazenia.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Trend 24h</span>
              <span className="font-medium text-foreground">
                {trendLabel} ({formatPercent(windowChangePct)})
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Zmiennosc</span>
              <span className="font-medium text-foreground">
                {formatPercent(volatilityPct)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Maksymalna zmiana</span>
              <span className="font-medium text-foreground">
                {ramp.maxDelta === null
                  ? "-"
                  : `${formatSigned(ramp.maxDelta, loadConfig?.unit)} (${ramp.label})`}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className={pairGridClass}>
        <div className="space-y-6">
          <div
            ref={(node) => setSectionRef("peak", node)}
            className={highlightClass("peak")}
          >
          <Card
            className={`border-border/60 bg-white/80 rise-in hover-lift ${panelItemClass} ${activePanelClass(
              "peak"
            )}`}
          >
            <CardHeader className="space-y-2">
              <div
                className="flex flex-wrap items-center justify-between gap-2 cursor-pointer"
                onClick={() => setActivePanel("peak")}
              >
                <CardTitle className="text-2xl">Godziny szczytu</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Ryzyko zuzycia</Badge>
                  <DetailTrigger onClick={() => setActivePanel("peak")} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Status zuzycia energii w najblizszym oknie czasowym.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {peakState?.error ? (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                  {peakState.error}
                </div>
              ) : (
                <div className="space-y-3 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Status</span>
                    <span className="inline-flex items-center gap-2 font-medium text-foreground">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${usageColor(
                          peakLatestValue
                        )}`}
                      />
                      {peakStatus ? peakStatus.label : "Brak danych"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Godziny ryzyka</span>
                    <span className="font-medium text-foreground">{peakRiskCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Prawdopodobienstwo niedoboru rezerwy</span>
                    <span className="font-medium text-foreground">
                      {reserveMaxPct === null ? "-" : formatPercent(reserveMaxPct)}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div
          ref={(node) => setSectionRef("prices", node)}
          className={highlightClass("prices")}
        >
          <Card
            className={`border-border/60 bg-white/80 rise-in hover-lift ${panelItemClass} ${activePanelClass(
              "prices"
            )}`}
          >
            <CardHeader className="space-y-2">
              <div
                className="flex flex-wrap items-center justify-between gap-2 cursor-pointer"
                onClick={() => setActivePanel("prices")}
              >
                <div>
                  <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
                    Sygnały rynkowe
                  </p>
                  <CardTitle className="text-2xl">Ceny energii</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Rynek</Badge>
                  <DetailTrigger onClick={() => setActivePanel("prices")} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Ostatnia probka: {priceLatestTime || "-"}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {priceState?.error ? (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                  {priceState.error}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span>Cena teraz</span>
                      <span className="font-medium text-foreground">
                        {formatValue(priceStats?.last ?? null, priceConfig?.unit)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Zmiana vs srednia 24h</span>
                      <span className="font-medium text-foreground">
                        {priceDeltaPct === null ? "-" : formatPercent(priceDeltaPct)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Zmiennosc</span>
                      <span className="font-medium text-foreground">
                        {formatPercent(priceVolatilityPct)}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-white/70 p-2">
                    <Sparkline points={priceWindowPoints} className="text-amber-500" />
                    <div className="text-[10px] text-muted-foreground text-center">
                      Ostatnie 24h
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        </div>

        <Card
          className={`border-border/60 bg-white/80 rise-in hover-lift ${panelItemClass} ${activePanelClass(
            "alerts"
          )}`}
        >
          <CardHeader>
            <div
              className="flex items-center justify-between gap-2 cursor-pointer"
              onClick={() => setActivePanel("alerts")}
            >
              <CardTitle className="text-2xl">Sytuacje nienormatywne</CardTitle>
              <DetailTrigger onClick={() => setActivePanel("alerts")} />
            </div>
            <p className="text-xs text-muted-foreground">
              Najwazniejsze sygnaly ostrzegawcze z okna 24h.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                <span>Krytyczne</span>
                <span className="font-medium text-foreground">{alertCounts.alert}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                <span>Ostrzezenia</span>
                <span className="font-medium text-foreground">{alertCounts.warn}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                <span>OK</span>
                <span className="font-medium text-foreground">{alertCounts.ok}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className={bottomGridClass}>
        <div
          ref={(node) => setSectionRef("generation", node)}
          className={highlightClass("generation")}
        >
          <Card
            className={`border-border/60 bg-white/80 rise-in hover-lift ${panelItemClass} ${activePanelClass(
              "generation"
            )}`}
          >
            <CardHeader className="space-y-2">
              <div
                className="flex flex-wrap items-center justify-between gap-2 cursor-pointer"
                onClick={() => setActivePanel("generation")}
              >
                <div>
                  <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
                    Generacja
                  </p>
                  <CardTitle className="text-2xl">Top jednostki wytworcze</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{genConfig?.label ?? "Generacja JW"}</Badge>
                  <DetailTrigger onClick={() => setActivePanel("generation")} />
                </div>
              </div>
              {genSnapshot.length ? (
                <p className="text-xs text-muted-foreground">
                  Ostatni snapshot: {genLatestTime || "brak danych"}
                </p>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              {genState?.error ? (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                  {genState.error}
                </div>
              ) : (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Top 1 udzial</span>
                    <span className="font-medium text-foreground">
                      {genTop1Share === null ? "-" : formatPercent(genTop1Share * 100)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Koncentracja top3</span>
                    <span className="font-medium text-foreground">
                      {genTopShare === null ? "-" : formatPercent(genTopShare * 100)}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div
          ref={(node) => setSectionRef("network", node)}
          className={highlightClass("network")}
        >
          <Card
            className={`border-border/60 bg-white/80 rise-in hover-lift ${panelItemClass} ${activePanelClass(
              "network"
            )}`}
          >
            <CardHeader className="space-y-2">
              <div
                className="flex flex-wrap items-center justify-between gap-2 cursor-pointer"
                onClick={() => setActivePanel("network")}
              >
                <div>
                  <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
                    Ograniczenia
                  </p>
                  <CardTitle className="text-2xl">Aktywne ograniczenia sieci</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Ograniczenia sieci</Badge>
                  <DetailTrigger onClick={() => setActivePanel("network")} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Aktywne: {ogrActiveCount} z {ogrTotalCount} rekordow.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {ogrState?.error ? (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                  {ogrState.error}
                </div>
              ) : (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Aktywne ograniczenia</span>
                    <span className="font-medium text-foreground">{ogrActiveCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Wszystkie</span>
                    <span className="font-medium text-foreground">{ogrTotalCount}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div
          ref={(node) => {
            setSectionRef("afrr", node);
            setSectionRef("reserve", node);
          }}
          className={highlightClass(["afrr", "reserve"])}
        >
          <Card
            className={`border-border/60 bg-white/80 rise-in hover-lift ${panelItemClass} ${activePanelClass(
              "reserve"
            )}`}
          >
            <CardHeader className="space-y-2">
              <div
                className="flex flex-wrap items-center justify-between gap-2 cursor-pointer"
                onClick={() => setActivePanel("reserve")}
              >
                <div>
                  <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
                    Rezerwy i regulacja
                  </p>
                  <CardTitle className="text-2xl">Rezerwy i regulacja</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Operacje</Badge>
                  <DetailTrigger onClick={() => setActivePanel("reserve")} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Sygnały o rezerwach mocy i aktywacjach regulacyjnych.
              </p>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span>Prawdopodobienstwo niedoboru rezerwy</span>
                  <span className="font-medium text-foreground">
                    {reserveState?.error || reserveMaxPct === null
                      ? "-"
                      : formatPercent(reserveMaxPct)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Aktywacje 24h</span>
                  <span className="font-medium text-foreground">
                    {afrrState?.error || !afrrPoints.length ? "-" : afrrActivationCount}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Maksymalna aktywacja</span>
                  <span className="font-medium text-foreground">
                    {afrrState?.error || afrrMaxValue === null
                      ? "-"
                      : formatValue(afrrMaxValue, afrrConfig?.unit)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      </section>
      <aside
        className={`hidden lg:block transition-all duration-300 ${
          hasPanel
            ? "lg:basis-[70%] lg:max-w-[70%] lg:opacity-100 lg:translate-x-0"
            : "lg:basis-0 lg:max-w-0 lg:opacity-0 lg:translate-x-6 lg:pointer-events-none"
        }`}
      >
        <div ref={panelAnchorRef} className="sticky top-24">
          {panel ? (
            <div className="rounded-2xl border border-border/60 bg-white/90 p-5 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                    Szczegoly
                  </p>
                  <p className="text-lg font-semibold text-foreground">{panel.title}</p>
                  {panel.subtitle ? (
                    <p className="text-xs text-muted-foreground">{panel.subtitle}</p>
                  ) : null}
                </div>
                <Button size="sm" variant="ghost" onClick={() => setActivePanel(null)}>
                  Zamknij
                </Button>
              </div>
              <div className="mt-4 max-h-[calc(100vh-10rem)] overflow-auto overflow-x-hidden pr-1">
                <div className="sticky top-0 z-10 -mx-1 mb-3 rounded-xl border border-border/60 bg-white/95 px-2 py-2 backdrop-blur">
                  <div className="flex flex-wrap gap-2">
                    {panelNavItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActivePanel(item.id)}
                        className={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                          activePanel === item.id
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border/70 bg-white/70 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
                {panel.content}
              </div>
            </div>
          ) : null}
        </div>
      </aside>
      {panel ? (
        <div className="fixed bottom-6 right-6 z-50 w-[360px] max-w-[calc(100vw-3rem)] rounded-2xl border border-border/60 bg-white/90 p-4 shadow-2xl backdrop-blur sm:top-24 sm:bottom-auto sm:right-8 sm:w-[420px] lg:hidden">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                Szczegoly
              </p>
              <p className="text-lg font-semibold text-foreground">{panel.title}</p>
              {panel.subtitle ? (
                <p className="text-xs text-muted-foreground">{panel.subtitle}</p>
              ) : null}
            </div>
            <Button size="sm" variant="ghost" onClick={() => setActivePanel(null)}>
              Zamknij
            </Button>
          </div>
          <div className="mt-3 max-h-[55vh] overflow-auto overflow-x-hidden pr-1">
            <div className="sticky top-0 z-10 -mx-1 mb-3 rounded-xl border border-border/60 bg-white/95 px-2 py-2 backdrop-blur">
              <div className="flex flex-wrap gap-2">
                {panelNavItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActivePanel(item.id)}
                    className={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                      activePanel === item.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/70 bg-white/70 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            {panel.content}
          </div>
        </div>
      ) : null}
    </div>
  );
}
