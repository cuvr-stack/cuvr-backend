import { useState, useCallback } from "react";
import { X, Wand2, Loader2, Download, RefreshCw, Sparkles, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { assetUrl } from "@/lib/utils";

// ── AI Models ─────────────────────────────────────────────────────────────────
const AI_MODELS = [
  {
    id: "standard",
    name: "FLUX Schnell",
    tag: "Fast",
    time: "~8s",
    desc: "Next-gen 4-step AI · Text-guided scene generation",
    color: "#00bcd4",
  },
  {
    id: "quality",
    name: "FLUX Dev",
    tag: "Recommended",
    time: "~30s",
    desc: "Structure-preserving · Best for client presentations",
    color: "#00e676",
    default: true,
  },
  {
    id: "ultra",
    name: "FLUX Ultra",
    tag: "Best Quality",
    time: "~55s",
    desc: "Max detail · 50-step render · Award-winning realism",
    color: "#ff6b35",
  },
];

// ── Style Presets ─────────────────────────────────────────────────────────────
const PRESETS = [
  { label: "Modern White",   swatch: "#f0f0ec", prompt: "modern minimalist exterior, freshly painted smooth white rendered walls, floor-to-ceiling double-glazed glass windows, slim black aluminium frames, manicured green lawn, clean polished concrete driveway" },
  { label: "Tropical Villa", swatch: "#3a7d44", prompt: "tropical modern villa exterior, warm sandy beige rendered walls, lush palm trees and tropical garden plants, stone pathway, vibrant green lawn, blue sky with clouds" },
  { label: "Mediterranean",  swatch: "#c0855a", prompt: "mediterranean villa exterior, warm terracotta clay roof tiles, sandy stucco render walls, olive trees, terracotta pots with bougainvillea, stone paved driveway, golden hour light" },
  { label: "Dark & Bold",    swatch: "#2a2a2a", prompt: "contemporary dark exterior, charcoal grey painted smooth render walls, dark gunmetal steel window frames, architectural ornamental grasses, polished grey concrete driveway" },
  { label: "Desert Modern",  swatch: "#c4956a", prompt: "desert modern architecture, warm sandstone coloured walls, drought-tolerant landscaping with cacti and agave, sandstone path, warm golden afternoon light" },
  { label: "Lush Garden",    swatch: "#2d5a27", prompt: "house with beautiful lush English garden, deep green lawn, flowering roses and hydrangeas, stone path, climbing wisteria on walls, warm golden afternoon light" },
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface Variation {
  id: string;
  variation_url: string;
  status: string;
  prompt: string;
  ai_model?: string;
  error_message?: string | null;
}

interface Photo {
  id: string;
  thumbnail_url?: string;
  original_url?: string;
  filename?: string;
  room_label?: string;
}

// ── Slider component ──────────────────────────────────────────────────────────
function Slider({
  label,
  hint,
  value,
  onChange,
  accent = "#00e676",
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  accent?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <span className="text-xs font-semibold text-white">{label}</span>
          <span className="text-xs ml-1.5" style={{ color: "#556677" }}>{hint}</span>
        </div>
        <span className="text-xs font-mono font-semibold" style={{ color: accent }}>{value}%</span>
      </div>
      <div className="relative h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }}>
        <div
          className="absolute h-full rounded-full"
          style={{ width: `${value}%`, background: `linear-gradient(90deg, ${accent}88, ${accent})` }}
        />
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
        />
        {/* thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow-md pointer-events-none"
          style={{ left: `calc(${value}% - 7px)`, background: accent }}
        />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SceneVariationModal({ photo, onClose }: { photo: Photo; onClose: () => void }) {
  const [prompt, setPrompt]               = useState("");
  const [negPrompt, setNegPrompt]         = useState("");
  const [showNegPrompt, setShowNegPrompt] = useState(false);
  const [aiModel, setAiModel]             = useState("quality");
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [imageStrength, setImageStrength] = useState(65);
  const [styleStrength, setStyleStrength] = useState(75);
  const [ultraRealism, setUltraRealism]   = useState(true);
  const [generating, setGenerating]       = useState(false);
  const [variations, setVariations]       = useState<Variation[]>([]);
  const [error, setError]                 = useState("");
  const [activePreset, setActivePreset]   = useState<string | null>(null);

  const sourceUrl  = assetUrl(photo.thumbnail_url || photo.original_url);
  const modelInfo  = AI_MODELS.find(m => m.id === aiModel) ?? AI_MODELS[1];

  const applyPreset = (p: typeof PRESETS[0]) => {
    setPrompt(p.prompt);
    setActivePreset(p.label);
  };

  const pollVariation = useCallback((variationId: string) => {
    const poll = async () => {
      try {
        const res = await api.get(`/api/ai/variations/${variationId}`);
        const v: Variation = res.data;
        if (v.status === "ready") {
          setVariations(prev => [v, ...prev]);
          setGenerating(false);
        } else if (v.status === "failed") {
          const msg = (v.error_message ?? "").toLowerCase();
          if (msg.includes("replicate_api_token") || msg.includes("not set")) {
            setError("Replicate API key not configured — add REPLICATE_API_TOKEN to your server .env");
          } else if (msg.includes("pytorch") || msg.includes("gpu")) {
            setError("AI rendering requires a GPU server.");
          } else {
            setError("Generation failed — please try again.");
          }
          setGenerating(false);
        } else {
          setTimeout(poll, 4000);
        }
      } catch {
        setError("Could not check status.");
        setGenerating(false);
      }
    };
    setTimeout(poll, 5000);
  }, []);

  const generate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    setError("");
    try {
      const res = await api.post(`/api/ai/photos/${photo.id}/scene-variation`, {
        prompt:         prompt.trim(),
        elements:       [],
        style:          "Modern",
        color:          "",
        ai_model:       aiModel,
        image_strength: imageStrength,
        style_strength: styleStrength,
        ultra_realism:  ultraRealism,
      });
      pollVariation(res.data.variation_id);
    } catch (e: any) {
      setError(e.response?.data?.detail ?? "Request failed.");
      setGenerating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.92)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-6xl rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: "linear-gradient(165deg, #0c1020 0%, #080c18 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 0 0 1px rgba(0,230,118,0.12), 0 40px 100px rgba(0,0,0,0.85)",
          maxHeight: "93vh",
        }}
        onClick={e => e.stopPropagation()}
      >

        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-5 py-3.5 flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#00e676,#00c362)" }}>
              <Wand2 className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white leading-none">Scene Visualiser</p>
              <p className="text-xs mt-0.5" style={{ color: "#667788" }}>{photo.room_label ?? photo.filename}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors">
            <X className="w-3.5 h-3.5" style={{ color: "#778899" }} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex min-h-0 flex-1 overflow-hidden">

          {/* ── LEFT PANEL ── */}
          <div className="w-[300px] flex-shrink-0 flex flex-col overflow-y-auto" style={{ borderRight: "1px solid rgba(255,255,255,0.07)" }}>

            {/* Original photo */}
            {sourceUrl && (
              <div className="p-4 pb-3">
                <div className="rounded-xl overflow-hidden relative" style={{ aspectRatio: "4/3" }}>
                  <img src={sourceUrl} alt="Original" className="w-full h-full object-cover" />
                  <span className="absolute bottom-2 left-2 text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(0,0,0,0.65)", color: "rgba(255,255,255,0.75)" }}>Original</span>
                </div>
              </div>
            )}

            {/* AI Model selector */}
            <div className="px-4 pb-3">
              <p className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: "#778899" }}>Choose AI Model</p>
              <div className="relative">
                <button
                  onClick={() => setShowModelMenu(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: `${modelInfo.color}14`,
                    border: `1px solid ${modelInfo.color}40`,
                    color: "white",
                  }}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: modelInfo.color }} />
                    {modelInfo.name}
                    <span className="text-xs px-1.5 py-0.5 rounded-md font-medium" style={{ background: `${modelInfo.color}25`, color: modelInfo.color }}>{modelInfo.tag}</span>
                  </span>
                  <span className="flex items-center gap-1.5" style={{ color: "#556677" }}>
                    <span className="text-xs font-mono">{modelInfo.time}</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </span>
                </button>

                {showModelMenu && (
                  <div
                    className="absolute top-full mt-1 left-0 right-0 rounded-xl overflow-hidden z-10"
                    style={{ background: "#0e1628", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}
                  >
                    {AI_MODELS.map(m => (
                      <button
                        key={m.id}
                        onClick={() => { setAiModel(m.id); setShowModelMenu(false); }}
                        className="w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/5"
                        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                      >
                        <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: m.color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-white">{m.name}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: `${m.color}20`, color: m.color }}>{m.tag}</span>
                            <span className="text-xs font-mono ml-auto" style={{ color: "#556677" }}>{m.time}</span>
                          </div>
                          <p className="text-xs mt-0.5 truncate" style={{ color: "#556677" }}>{m.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Strength sliders */}
            <div className="px-4 pb-3 flex flex-col gap-4">
              <Slider
                label="Image Strength"
                hint="structure preservation"
                value={imageStrength}
                onChange={setImageStrength}
                accent="#00bcd4"
              />
              <Slider
                label="Style Strength"
                hint="prompt adherence"
                value={styleStrength}
                onChange={setStyleStrength}
                accent="#00e676"
              />
            </div>

            {/* Style presets */}
            <div className="px-4 pb-3">
              <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#778899" }}>Quick Presets</p>
              <div className="grid grid-cols-3 gap-1.5">
                {PRESETS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p)}
                    title={p.label}
                    className="flex flex-col items-center gap-1 py-1.5 px-1 rounded-xl transition-all"
                    style={{
                      background: activePreset === p.label ? "rgba(0,230,118,0.15)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${activePreset === p.label ? "rgba(0,230,118,0.4)" : "rgba(255,255,255,0.07)"}`,
                    }}
                  >
                    <div className="w-8 h-8 rounded-lg flex-shrink-0" style={{ background: p.swatch, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.2)" }} />
                    <span className="text-xs text-center leading-tight" style={{ color: activePreset === p.label ? "white" : "#8899aa", fontSize: "10px" }}>{p.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt */}
            <div className="px-4 pb-3">
              <p className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: "#778899" }}>Describe the scene</p>
              <textarea
                value={prompt}
                onChange={e => { setPrompt(e.target.value); setActivePreset(null); }}
                placeholder="e.g. modern house with white rendered walls, lush tropical garden, floor-to-ceiling windows, polished concrete driveway, blue sky…"
                rows={4}
                className="w-full resize-none text-xs rounded-xl px-3 py-2.5 outline-none transition-all placeholder:opacity-30"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.09)",
                  color: "white",
                  lineHeight: 1.6,
                }}
                onFocus={e => (e.currentTarget.style.borderColor = "rgba(0,230,118,0.45)")}
                onBlur={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)")}
              />
              <p className="text-xs mt-1" style={{ color: "#445566", fontSize: "11px" }}>
                Include: walls, roof, landscaping, windows, driveway, lighting
              </p>
            </div>

            {/* Negative prompt */}
            <div className="px-4 pb-3">
              <button
                onClick={() => setShowNegPrompt(v => !v)}
                className="flex items-center gap-1.5 text-xs transition-colors hover:opacity-80"
                style={{ color: "#667788" }}
              >
                <Plus className="w-3 h-3" />
                Add negative prompt
              </button>
              {showNegPrompt && (
                <textarea
                  value={negPrompt}
                  onChange={e => setNegPrompt(e.target.value)}
                  placeholder="e.g. people, cars, rain, night time…"
                  rows={2}
                  className="mt-2 w-full resize-none text-xs rounded-xl px-3 py-2 outline-none"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    color: "white",
                    lineHeight: 1.5,
                  }}
                />
              )}
            </div>

            {/* Ultra realism toggle */}
            <div className="px-4 pb-4">
              <button
                onClick={() => setUltraRealism(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all"
                style={{
                  background: ultraRealism ? "rgba(0,230,118,0.08)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${ultraRealism ? "rgba(0,230,118,0.3)" : "rgba(255,255,255,0.07)"}`,
                }}
              >
                <div className="text-left">
                  <p className="text-xs font-semibold text-white">Ultra Realism</p>
                  <p className="text-xs mt-0.5" style={{ color: "#556677" }}>Enhanced detail and photorealism</p>
                </div>
                <div
                  className="w-10 h-5.5 rounded-full flex items-center transition-all flex-shrink-0 ml-3"
                  style={{
                    background: ultraRealism ? "#00e676" : "rgba(255,255,255,0.15)",
                    padding: "2px",
                    height: "22px",
                  }}
                >
                  <div
                    className="w-4 h-4 rounded-full bg-white shadow-sm transition-all"
                    style={{ transform: ultraRealism ? "translateX(18px)" : "translateX(0px)" }}
                  />
                </div>
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="px-4 pb-3">
                <p className="text-xs rounded-xl px-3 py-2 leading-relaxed" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
                  {error}
                </p>
              </div>
            )}

            {/* Generate button */}
            <div className="px-4 pb-5 mt-auto">
              <button
                onClick={generate}
                disabled={generating || !prompt.trim()}
                className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
                style={{
                  background: generating || !prompt.trim()
                    ? "rgba(0,230,118,0.15)"
                    : "linear-gradient(135deg,#00e676 0%,#00c362 100%)",
                  color: "white",
                  opacity: !prompt.trim() && !generating ? 0.4 : 1,
                  boxShadow: generating || !prompt.trim() ? "none" : "0 0 20px rgba(0,230,118,0.3)",
                }}
              >
                {generating
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Rendering…</>
                  : <><Sparkles className="w-4 h-4" /> Generate</>
                }
              </button>
              <p className="text-center text-xs mt-1.5" style={{ color: "#334455", fontSize: "11px" }}>
                {modelInfo.name} · {modelInfo.time}
              </p>
            </div>
          </div>

          {/* ── RIGHT PANEL ── */}
          <div className="flex-1 overflow-y-auto p-5">

            {/* Empty state */}
            {!generating && variations.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center" style={{ minHeight: 360 }}>
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ background: "rgba(0,230,118,0.07)", border: "1px solid rgba(0,230,118,0.15)" }}
                >
                  <Wand2 className="w-7 h-7" style={{ color: "rgba(0,230,118,0.55)" }} />
                </div>
                <p className="font-semibold text-white text-base mb-2">Visualise Your Property</p>
                <p className="text-sm leading-relaxed mb-6" style={{ color: "#ffffff", maxWidth: 300 }}>
                  Pick a preset or describe the scene — walls, landscaping, windows, driveway — then hit Generate.
                </p>
                <div className="flex flex-wrap gap-2 justify-center max-w-sm">
                  {["White walls + palm trees", "Charcoal render + glass", "Mediterranean terracotta", "Lush garden + stone path"].map(eg => (
                    <button
                      key={eg}
                      onClick={() => setPrompt(eg)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs transition-all hover:bg-white/8"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", color: "#ffffff" }}
                    >
                      <ChevronRight className="w-3 h-3" />
                      {eg}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Generating */}
            {generating && (
              <div className="flex flex-col items-center justify-center py-10">
                <div className="relative w-full max-w-xl mb-6">
                  {sourceUrl && (
                    <div className="rounded-2xl overflow-hidden relative" style={{ aspectRatio: "16/9" }}>
                      <img src={sourceUrl} alt="" className="w-full h-full object-cover" style={{ opacity: 0.35 }} />
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: "rgba(8,12,24,0.6)" }}>
                        <div className="relative">
                          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "rgba(0,230,118,0.12)" }}>
                            <Wand2 className="w-6 h-6" style={{ color: "#00e676" }} />
                          </div>
                          <Loader2 className="w-5 h-5 animate-spin absolute -bottom-1 -right-1" style={{ color: "#00e676" }} />
                        </div>
                        <p className="text-white font-semibold text-sm">Rendering with {modelInfo.name}</p>
                        <p className="text-xs" style={{ color: "#ffffff" }}>"{prompt.slice(0, 80)}{prompt.length > 80 ? "…" : ""}"</p>
                        <p className="text-xs" style={{ color: "#445566" }}>Estimated: {modelInfo.time}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Results */}
            <div className="flex flex-col gap-5">
              {variations.map((v, i) => (
                <ResultCard key={v.id} variation={v} index={i} sourceUrl={sourceUrl} onRegenerate={() => { setPrompt(v.prompt ?? ""); generate(); }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Result card with before/after slider ──────────────────────────────────────
function ResultCard({ variation, index, sourceUrl, onRegenerate }: {
  variation: Variation;
  index: number;
  sourceUrl: string;
  onRegenerate: () => void;
}) {
  const [pct, setPct] = useState(50);

  const modelName: Record<string, string> = { standard: "FLUX Schnell", quality: "FLUX Dev", ultra: "FLUX Ultra" };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.09)" }}>
      {/* Comparison slider */}
      <div
        className="relative cursor-col-resize select-none"
        style={{ aspectRatio: "16/9" }}
        onMouseMove={e => {
          const r = e.currentTarget.getBoundingClientRect();
          setPct(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
        }}
      >
        {/* AI render — full underneath */}
        <img src={assetUrl(variation.variation_url)} alt="AI Render" className="absolute inset-0 w-full h-full object-cover" draggable={false} />

        {/* Original — clipped left */}
        {sourceUrl && (
          <div className="absolute inset-0 overflow-hidden" style={{ width: `${pct}%` }}>
            <img
              src={sourceUrl}
              alt="Before"
              className="absolute inset-0 h-full object-cover"
              style={{ width: `${100 / (pct / 100)}%`, maxWidth: "none" }}
              draggable={false}
            />
          </div>
        )}

        {/* Divider line */}
        <div className="absolute top-0 bottom-0 w-px" style={{ left: `${pct}%`, background: "white", boxShadow: "0 0 6px rgba(0,0,0,0.5)" }}>
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 rounded-full flex items-center justify-center border-2 border-white" style={{ background: "rgba(0,0,0,0.75)" }}>
            <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
              <path d="M0 4h12M3 1L0 4l3 3M9 1l3 3-3 3" stroke="white" strokeWidth="1.5"/>
            </svg>
          </div>
        </div>

        {/* Labels */}
        <span className="absolute top-2.5 left-2.5 text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(0,0,0,0.65)", color: "white" }}>Before</span>
        <span className="absolute top-2.5 right-2.5 text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(0,230,118,0.75)", color: "white" }}>
          {modelName[variation.ai_model ?? "quality"] ?? "AI Render"}
        </span>

        {index === 0 && (
          <span className="absolute bottom-2.5 left-1/2 -translate-x-1/2 text-xs px-2.5 py-1 rounded-full" style={{ background: "rgba(0,0,0,0.6)", color: "rgba(255,255,255,0.55)" }}>
            ← Drag to compare →
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.3)" }}>
        <p className="text-xs flex-1 truncate" style={{ color: "#ffffff" }}>
          "{variation.prompt?.slice(0, 100)}{(variation.prompt?.length ?? 0) > 100 ? "…" : ""}"
        </p>
        <div className="flex gap-1.5 flex-shrink-0">
          <button onClick={onRegenerate} title="Re-generate" className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" style={{ color: "#778899" }} />
          </button>
          <a
            href={assetUrl(variation.variation_url)}
            download={`cuvr-render-${index + 1}.jpg`}
            title="Download"
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(0,230,118,0.25)" }}
          >
            <Download className="w-3.5 h-3.5 text-white" />
          </a>
        </div>
      </div>
    </div>
  );
}
