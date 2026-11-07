"use client";

import { useState, useEffect, useRef } from "react";
import {
  Loader2,
  Key,
  ChevronDown,
  Settings,
  MessageSquareCode,
  Palette,
  Globe,
  Terminal,
  Cpu,
  Wrench,
  Check,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { ASPECT_RATIOS } from "@/store/projectStore";
import {
  GLOBAL_I2V_MODELS,
  GLOBAL_R2V_MODELS,
  GLOBAL_IMAGE_MODELS,
} from "@/lib/modelCatalog";
import { useSettingsStore, type Locale, type Theme } from "@/store/settingsStore";
import { Image, Video, Layout, User, Building, Box } from "lucide-react";
import GroupedModelGrid from "@/components/common/GroupedModelGrid";
import {
  AdvancedConfigSections,
  DEFAULT_CONFIG,
  LLM_PROVIDER_LABELS,
  VENDORS,
  applyVendorToSettings,
  detectVendorId,
  getReadiness,
  getValidationErrors,
  loadModelDefaultsLS,
  loadVendorLS,
  normalizeEnvConfig,
  saveModelDefaultsLS,
  saveVendorLS,
  vendorCoverage,
  type DefaultModelSettings,
  type EnvConfig,
  type VendorModels,
} from "./configShared";

export default function SettingsPage() {
  const t = useTranslations("settings");
  const { locale, theme, setLocale, setTheme } = useSettingsStore();

  // ── API Configuration (auto-save) ──
  const [config, setConfig] = useState<EnvConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [envSaveState, setEnvSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const configDirtyRef = useRef(false);
  const configRef = useRef(config);
  configRef.current = config;

  // ── Default Model Settings ──
  const [modelSettings, setModelSettings] = useState<DefaultModelSettings>(() => loadModelDefaultsLS());
  const [activeVendorId, setActiveVendorId] = useState<string | null>(() => loadVendorLS() ?? detectVendorId(loadModelDefaultsLS()));

  useEffect(() => {
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.getEnvConfig();
      setConfig(normalizeEnvConfig(data));
      configDirtyRef.current = false;
      setEnvSaveState("idle");
    } catch {
      setLoadError("Failed to load configuration. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key: keyof EnvConfig, value: string | boolean | Record<string, string>) => {
    configDirtyRef.current = true;
    setEnvSaveState("idle");
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  // Debounced auto-save: persists 800ms after the last change, no save button needed
  useEffect(() => {
    if (loading || !configDirtyRef.current) return;
    const timer = setTimeout(async () => {
      setEnvSaveState("saving");
      try {
        await api.saveEnvConfig(configRef.current);
        configDirtyRef.current = false;
        setEnvSaveState("saved");
      } catch {
        setEnvSaveState("error");
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [config, loading]);

  const retrySaveEnv = async () => {
    setEnvSaveState("saving");
    try {
      await api.saveEnvConfig(configRef.current);
      configDirtyRef.current = false;
      setEnvSaveState("saved");
    } catch {
      setEnvSaveState("error");
    }
  };

  const persistModelSettings = (updater: (s: DefaultModelSettings) => DefaultModelSettings) => {
    setModelSettings((s) => {
      const next = updater(s);
      saveModelDefaultsLS(next);
      return next;
    });
  };

  const applyVendor = (vendor: VendorModels) => {
    setActiveVendorId(vendor.id);
    saveVendorLS(vendor.id);
    persistModelSettings((s) => applyVendorToSettings(vendor.id, s).next);
  };

  // ── Local Tool Status ──
  const [whisperStatus, setWhisperStatus] = useState<{ whisper_cli: string | null; whisper_model: string | null; vad_model: string | null } | null>(null);
  const [comfyStatus, setComfyStatus] = useState<any>(null);

  useEffect(() => {
    api.getSubtitleToolStatus().then(setWhisperStatus).catch(() => setWhisperStatus(null));
    api.getComfyUIStatus().then(setComfyStatus).catch(() => setComfyStatus(null));
  }, []);

  const toolRowClass = "flex items-start justify-between gap-4 border border-glass-border rounded-lg px-4 py-3 bg-surface/40";

  const inputClass =
    "w-full bg-input-bg border border-glass-border rounded-lg px-4 py-2 text-foreground placeholder-text-muted focus:outline-none focus:border-primary/50 transition-colors";

  // ── Derived: readiness / vendors ──
  const readiness = getReadiness(config);
  const activeVendorInfo = VENDORS.find((v) => v.id === activeVendorId) ?? null;
  const validationErrors = getValidationErrors(config);

  return (
    <div className="container mx-auto px-6 py-8 max-w-4xl space-y-8">
      <h1 className="text-2xl font-display font-bold text-foreground">{t("title")}</h1>

      {/* ── Section 0: Appearance ── */}
      <section className="glass-panel rounded-xl p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 rounded-lg">
            <Palette size={20} className="text-violet-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">{t("appearance")}</h2>
          </div>
        </div>

        {/* Language */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Globe size={14} className="text-text-secondary" />
            <label className="text-sm font-medium text-foreground">{t("language")}</label>
          </div>
          <p className="text-xs text-text-secondary">{t("languageDesc")}</p>
          <div className="flex gap-2 mt-2">
            {([["zh", t("chinese")], ["en", t("english")]] as [Locale, string][]).map(([loc, label]) => (
              <button
                key={loc}
                onClick={() => setLocale(loc)}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                  locale === loc
                    ? "border-primary/60 bg-primary/15 text-foreground"
                    : "border-glass-border bg-hover-bg text-text-secondary hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Theme */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Palette size={14} className="text-text-secondary" />
            <label className="text-sm font-medium text-foreground">{t("theme")}</label>
          </div>
          <p className="text-xs text-text-secondary">{t("themeDesc")}</p>
          <div className="flex gap-2 mt-2">
            {([["dark", t("themeDark")], ["light", t("themeLight")]] as [Theme, string][]).map(([th, label]) => (
              <button
                key={th}
                onClick={() => setTheme(th)}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                  theme === th
                    ? "border-primary/60 bg-primary/15 text-foreground"
                    : "border-glass-border bg-hover-bg text-text-secondary hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 1: API Configuration (Readiness Dashboard) ── */}
      <section className="glass-panel rounded-xl p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-lg">
            <Key size={20} className="text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">{t("apiConfig")}</h2>
            <p className="text-xs text-text-secondary">所有配置均为可选，按需填写；上方指示灯实时显示就绪状态。</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-amber-400" />
            <span className="ml-2 text-text-secondary">Loading configuration...</span>
          </div>
        ) : loadError ? (
          <div className="space-y-3">
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm text-red-300">
              {loadError}
            </div>
            <button onClick={loadConfig} className="text-xs text-primary hover:underline">
              重试
            </button>
          </div>
        ) : (
          <>
            {/* 就绪状态灯 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {([
                { label: "文本", desc: "脚本解析 · 分镜", ok: readiness.text },
                { label: "图片", desc: "资产 · 分镜生成", ok: readiness.image },
                { label: "视频", desc: "I2V · R2V 生成", ok: readiness.video },
                { label: "音频", desc: "配音 · 字幕", ok: readiness.audio },
              ] as const).map((chip) => (
                <div
                  key={chip.label}
                  className={`rounded-lg border px-3.5 py-3 transition-colors ${
                    chip.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-glass-border bg-surface/40"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        chip.ok ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" : "bg-zinc-600"
                      }`}
                    />
                    <span className="text-sm font-medium text-foreground">{chip.label}</span>
                    <span className={`ml-auto text-[11px] ${chip.ok ? "text-emerald-400" : "text-text-muted"}`}>
                      {chip.ok ? "就绪" : "未配置"}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[10px] text-text-muted pl-4">{chip.desc}</p>
                </div>
              ))}
            </div>

            {/* DashScope Key（主配置，非必填） */}
            <div>
              <label className="flex items-center justify-between text-sm font-medium text-text-secondary mb-2">
                <span>DashScope API Key</span>
                <span className="text-text-muted font-normal text-xs">文本 / 图片 / 视频 / 音频能力 · e.g. sk-xxx</span>
              </label>
              <input
                type="password"
                value={config.DASHSCOPE_API_KEY}
                onChange={(e) => handleChange("DASHSCOPE_API_KEY", e.target.value)}
                placeholder="粘贴你的 DashScope API Key"
                className={inputClass + " font-mono"}
              />
              <div className="mt-2 flex items-center gap-2 text-xs h-4">
                {envSaveState === "saving" && (
                  <span className="text-text-muted flex items-center gap-1">
                    <Loader2 size={12} className="animate-spin" />
                    保存中…
                  </span>
                )}
                {envSaveState === "saved" && (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <Check size={12} />
                    已自动保存
                  </span>
                )}
                {envSaveState === "error" && (
                  <button onClick={retrySaveEnv} className="text-red-400 hover:text-red-300">
                    保存失败，点击重试
                  </button>
                )}
              </div>
              <p className="mt-1 text-[11px] text-text-muted">
                前往阿里云百炼控制台（bailian.console.aliyun.com）获取。更改自动保存，立即生效。
              </p>
              <div className="mt-3">
                <label className="block text-xs text-text-secondary mb-1.5">
                  自定义端点 <span className="text-text-muted font-normal">（可选，留空用默认）</span>
                </label>
                <input
                  type="text"
                  value={config.endpoint_overrides?.DASHSCOPE_BASE_URL || ""}
                  onChange={(e) =>
                    handleChange("endpoint_overrides", {
                      ...(config.endpoint_overrides ?? {}),
                      DASHSCOPE_BASE_URL: e.target.value,
                    })
                  }
                  placeholder="https://dashscope.aliyuncs.com"
                  className={inputClass + " text-xs"}
                />
              </div>
            </div>

            <AdvancedConfigSections
              config={config}
              onChange={handleChange}
              validationErrors={validationErrors}
            />
          </>
        )}
      </section>

      {/* ── Section 2: Default Model Settings ── */}
      <section className="glass-panel rounded-xl p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-lg">
            <Settings size={20} className="text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">{t("defaultModels")}</h2>
            <p className="text-xs text-text-secondary">选择厂商，自动带出该厂商的图片 / 视频模型组合</p>
          </div>
        </div>

        {/* 厂商卡 */}
        <div className="flex flex-wrap gap-2">
          {VENDORS.map((vendor) => {
            const active = activeVendorId === vendor.id;
            return (
              <button
                key={vendor.id}
                type="button"
                onClick={() => applyVendor(vendor)}
                className={`rounded-xl border px-4 py-2.5 text-left transition-all ${
                  active
                    ? "border-primary/60 bg-primary/10"
                    : "border-glass-border bg-surface/40 hover:border-white/20"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-foreground">{vendor.name}</span>
                  {active && <Check size={13} className="text-primary" />}
                </div>
                <span className="text-[10px] text-text-muted">{vendorCoverage(vendor)}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-text-muted">
          点击厂商自动套用其模型组合；该厂商没有的类别转为自定义选择。当前：
          {activeVendorInfo
            ? `${activeVendorInfo.name}（${vendorCoverage(activeVendorInfo)}）`
            : "自定义组合（手动选择）"}
        </p>

        {/* 文本引擎（自定义选择，不随厂商联动） */}
        <div className="flex items-center justify-between rounded-lg border border-glass-border bg-surface/40 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <MessageSquareCode size={14} className="text-violet-400" />
            <span className="font-medium text-foreground">文本引擎</span>
            <span className="text-xs text-text-muted">脚本解析 · 分镜润色</span>
          </div>
          <select
            value={config.LLM_PROVIDER}
            onChange={(e) => handleChange("LLM_PROVIDER", e.target.value)}
            className="bg-surface border border-glass-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary/50"
          >
            {Object.entries(LLM_PROVIDER_LABELS).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </div>

        {/* 联动模型区：厂商有该类别 → 厂商模型网格；没有 → 保留提示 */}
        <div className="space-y-4">
          {([
            {
              id: "image",
              label: "图片模型",
              desc: "资产 · 分镜生成",
              icon: Image,
              vendorModels: activeVendorInfo?.image ?? null,
              fullModels: GLOBAL_IMAGE_MODELS,
              current: modelSettings.t2i_model,
              onSelect: (id: string) => persistModelSettings((s) => ({ ...s, t2i_model: id, i2i_model: id })),
            },
            {
              id: "i2v",
              label: "图生视频",
              desc: "分镜 → 视频片段",
              icon: Video,
              vendorModels: activeVendorInfo?.i2v ?? null,
              fullModels: GLOBAL_I2V_MODELS,
              current: modelSettings.i2v_model,
              onSelect: (id: string) => persistModelSettings((s) => ({ ...s, i2v_model: id })),
            },
            {
              id: "r2v",
              label: "参考生视频",
              desc: "参考图 → 视频",
              icon: Video,
              vendorModels: activeVendorInfo?.r2v ?? null,
              fullModels: GLOBAL_R2V_MODELS,
              current: modelSettings.r2v_model ?? "",
              onSelect: (id: string) => persistModelSettings((s) => ({ ...s, r2v_model: id })),
            },
          ]).map((cat) => {
            const CatIcon = cat.icon;
            const missing = cat.vendorModels !== null && cat.vendorModels.length === 0;
            // 厂商缺失该类别 → 放开完整目录自定义选择，不替用户保留其他厂商的模型
            const list = missing || cat.vendorModels === null ? cat.fullModels : cat.vendorModels;
            return (
              <div key={cat.id} className="border border-glass-border rounded-lg p-4 bg-surface/40 space-y-3">
                <div className="flex items-center gap-2">
                  <CatIcon size={14} className="text-blue-400" />
                  <span className="text-sm font-bold text-foreground">{cat.label}</span>
                  <span className="text-[10px] text-text-muted">{cat.desc}</span>
                  {missing && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">自定义</span>
                  )}
                </div>
                {missing && (
                  <p className="text-xs text-text-muted">
                    「{activeVendorInfo?.name}」未提供{cat.label}，可从全部模型中自定义选择
                  </p>
                )}
                <GroupedModelGrid models={list} selectedId={cat.current} onSelect={cat.onSelect} />
              </div>
            );
          })}
        </div>

        <details className="group">
          <summary className="flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-foreground cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
            <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
            画幅比例（角色 / 场景 / 道具 / 分镜）
          </summary>

          <div className="mt-5 space-y-5">
            <div className="grid grid-cols-3 gap-4">
              {(
                [
                  { key: "character_aspect_ratio" as const, label: "Character", icon: User },
                  { key: "scene_aspect_ratio" as const, label: "Scene", icon: Building },
                  { key: "prop_aspect_ratio" as const, label: "Prop", icon: Box },
                ] as const
              ).map(({ key, label, icon: Icon }) => (
                <div key={key} className="space-y-2">
                  <div className="flex items-center gap-1 text-xs text-text-secondary"><Icon size={12} /><label>{label}</label></div>
                  <div className="space-y-1">
                    {ASPECT_RATIOS.map((ratio) => (
                      <button key={ratio.id} onClick={() => persistModelSettings((s) => ({ ...s, [key]: ratio.id }))} className={`w-full flex flex-col items-center py-2 px-2 rounded border transition-all ${modelSettings[key] === ratio.id ? "border-green-500/50 bg-green-500/10" : "border-glass-border hover:border-glass-border bg-glass"}`}>
                        <span className="text-xs font-medium text-foreground">{ratio.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-glass-border pt-4">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Layout size={16} className="text-blue-400" />
                <span>Storyboard Aspect Ratio</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {ASPECT_RATIOS.map((ratio) => (
                  <button key={ratio.id} onClick={() => persistModelSettings((s) => ({ ...s, storyboard_aspect_ratio: ratio.id }))} className={`flex flex-col items-center p-3 rounded-lg border transition-all ${modelSettings.storyboard_aspect_ratio === ratio.id ? "border-blue-500/50 bg-blue-500/10" : "border-glass-border hover:border-glass-border bg-glass"}`}>
                    <span className="text-sm font-medium text-foreground">{ratio.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </details>
      </section>

      {/* ── Section 4: Local Tool Status ── */}
      <section className="glass-panel rounded-xl p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-lg">
            <Wrench size={20} className="text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">{t("localTools")}</h2>
            <p className="text-xs text-text-secondary">{t("localToolsDesc")}</p>
          </div>
        </div>

        {/* whisper.cpp toolchain */}
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Terminal size={14} className="text-emerald-400" />
            whisper.cpp
          </h3>
          {([
            { key: "whisper_cli", label: t("whisperCli"), value: whisperStatus?.whisper_cli },
            { key: "whisper_model", label: t("whisperModel"), value: whisperStatus?.whisper_model },
            { key: "vad_model", label: t("vadModel"), value: whisperStatus?.vad_model },
          ] as const).map((row) => (
            <div key={row.key} className={toolRowClass}>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{row.label}</p>
                {row.value ? (
                  <p className="text-[11px] text-text-muted font-mono break-all mt-0.5">{row.value}</p>
                ) : null}
              </div>
              {row.value ? (
                <span className="shrink-0 inline-flex items-center gap-1 text-[11px] text-green-400">
                  <Check size={12} />
                  {t("toolReady")}
                </span>
              ) : (
                <span className="shrink-0 inline-flex items-center gap-1 text-[11px] text-amber-400">
                  {t("toolMissing")}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* ComfyUI */}
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Cpu size={14} className="text-emerald-400" />
            ComfyUI
          </h3>
          {comfyStatus?.reachable ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className={toolRowClass}>
                <p className="text-sm font-medium text-foreground">{t("comfyUrl")}</p>
                <p className="text-[11px] text-text-muted font-mono break-all text-right">{comfyStatus.base_url}</p>
              </div>
              <div className={toolRowClass}>
                <p className="text-sm font-medium text-foreground">{t("comfyVersion")}</p>
                <p className="text-[11px] text-text-muted font-mono text-right">{comfyStatus.system?.comfyui_version ?? "-"}</p>
              </div>
              <div className={toolRowClass}>
                <p className="text-sm font-medium text-foreground">{t("comfyDevice")}</p>
                <p className="text-[11px] text-text-muted font-mono break-all text-right">{comfyStatus.system?.device_name ?? "-"}</p>
              </div>
              <div className={toolRowClass}>
                <p className="text-sm font-medium text-foreground">{t("comfyVram")}</p>
                <p className="text-[11px] text-text-muted font-mono text-right">{comfyStatus.system?.vram_total_gb ? `${comfyStatus.system.vram_total_gb} GB` : "-"}</p>
              </div>
            </div>
          ) : (
            <div className={toolRowClass}>
              <p className="text-sm font-medium text-foreground">{t("comfyNotRunning")}</p>
              {comfyStatus?.error ? (
                <p className="text-[11px] text-text-muted font-mono break-all max-w-[60%] text-right">{comfyStatus.error}</p>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <div className="pb-8" />
    </div>
  );
}
