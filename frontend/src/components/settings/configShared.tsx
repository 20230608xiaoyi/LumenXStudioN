"use client";

import type { EnvConfigPayload, ProviderMode } from "@/lib/api";
import {
  DEFAULT_MODEL_SETTINGS,
  GLOBAL_I2V_MODELS,
  GLOBAL_IMAGE_MODELS,
  GLOBAL_R2V_MODELS,
  normalizeModelSettings,
  type I2VModelConfig,
  type SelectableModelOption,
} from "@/lib/modelCatalog";

// ── Shared types ────────────────────────────────────────────────────────────

export type EnvConfig = EnvConfigPayload & {
  DASHSCOPE_API_KEY: string;
  ALIBABA_CLOUD_ACCESS_KEY_ID: string;
  ALIBABA_CLOUD_ACCESS_KEY_SECRET: string;
  OSS_BUCKET_NAME: string;
  OSS_ENDPOINT: string;
  OSS_BASE_PATH: string;
  KLING_PROVIDER_MODE: ProviderMode;
  VIDU_PROVIDER_MODE: ProviderMode;
  PIXVERSE_PROVIDER_MODE: ProviderMode;
  KLING_ACCESS_KEY: string;
  KLING_SECRET_KEY: string;
  VIDU_API_KEY: string;
  MULEROUTER_API_KEY: string;
  AGNES_API_KEY: string;
  AGNES_MODEL: string;
  LLM_PROVIDER: string;
  MULERUN_CLI_LOGGED_IN?: boolean;
  endpoint_overrides: Record<string, string>;
};

export interface DefaultModelSettings {
  t2i_model: string;
  i2i_model: string;
  i2v_model: string;
  r2v_model?: string;
  character_aspect_ratio: string;
  scene_aspect_ratio: string;
  prop_aspect_ratio: string;
  storyboard_aspect_ratio: string;
}

// ── Defaults & normalization ────────────────────────────────────────────────

export const DEFAULT_CONFIG: EnvConfig = {
  DASHSCOPE_API_KEY: "",
  ALIBABA_CLOUD_ACCESS_KEY_ID: "",
  ALIBABA_CLOUD_ACCESS_KEY_SECRET: "",
  OSS_BUCKET_NAME: "",
  OSS_ENDPOINT: "",
  OSS_BASE_PATH: "",
  KLING_PROVIDER_MODE: "dashscope",
  VIDU_PROVIDER_MODE: "dashscope",
  PIXVERSE_PROVIDER_MODE: "dashscope",
  KLING_ACCESS_KEY: "",
  KLING_SECRET_KEY: "",
  VIDU_API_KEY: "",
  MULEROUTER_API_KEY: "",
  AGNES_API_KEY: "",
  AGNES_MODEL: "agnes-2.5-pro-beta",
  LLM_PROVIDER: "dashscope",
  endpoint_overrides: {},
};

export function normalizeProviderMode(value: unknown): ProviderMode {
  return value === "vendor" ? "vendor" : "dashscope";
}

export function normalizeEnvConfig(payload: Partial<EnvConfigPayload> | null | undefined): EnvConfig {
  return {
    ...DEFAULT_CONFIG,
    ...(payload ?? {}),
    KLING_PROVIDER_MODE: normalizeProviderMode(payload?.KLING_PROVIDER_MODE),
    VIDU_PROVIDER_MODE: normalizeProviderMode(payload?.VIDU_PROVIDER_MODE),
    PIXVERSE_PROVIDER_MODE: normalizeProviderMode(payload?.PIXVERSE_PROVIDER_MODE),
    endpoint_overrides: {
      ...DEFAULT_CONFIG.endpoint_overrides,
      ...((payload?.endpoint_overrides as Record<string, string>) ?? {}),
    },
  };
}

export const ENDPOINT_PROVIDERS = [
  { key: "DASHSCOPE_BASE_URL", label: "DashScope", placeholder: "https://dashscope.aliyuncs.com" },
  { key: "KLING_BASE_URL", label: "Kling", placeholder: "https://api-beijing.klingai.com/v1" },
  { key: "VIDU_BASE_URL", label: "Vidu", placeholder: "https://api.vidu.cn/ent/v2" },
  { key: "MULEROUTER_BASE_URL", label: "MuleRouter", placeholder: "https://api.mulerouter.ai" },
  { key: "AGNES_BASE_URL", label: "Agnes AI", placeholder: "https://apihub.agnes-ai.com" },
] as const;

export function getValidationErrors(env: EnvConfig): string[] {
  const errors: string[] = [];
  if (env.KLING_PROVIDER_MODE === "vendor") {
    if (!env.KLING_ACCESS_KEY?.trim() || !env.KLING_SECRET_KEY?.trim()) {
      errors.push("Kling 厂商模式需要 Access Key 和 Secret Key");
    }
  }
  if (env.VIDU_PROVIDER_MODE === "vendor" && !env.VIDU_API_KEY?.trim()) {
    errors.push("Vidu 厂商模式需要 VIDU API Key");
  }
  return errors;
}

// ── Readiness (就绪状态) ────────────────────────────────────────────────────

export interface Readiness {
  text: boolean;
  image: boolean;
  video: boolean;
  audio: boolean;
}

export function getReadiness(env: EnvConfig): Readiness {
  const hasDash = !!env.DASHSCOPE_API_KEY?.trim();
  const hasAgnes = !!env.AGNES_API_KEY?.trim();
  const hasMule = !!env.MULEROUTER_API_KEY?.trim();
  const klingVendor =
    env.KLING_PROVIDER_MODE === "vendor" && !!env.KLING_ACCESS_KEY?.trim() && !!env.KLING_SECRET_KEY?.trim();
  const viduVendor = env.VIDU_PROVIDER_MODE === "vendor" && !!env.VIDU_API_KEY?.trim();
  const llm = env.LLM_PROVIDER || "dashscope";
  return {
    text: llm === "agnes" ? hasAgnes : llm === "openai" ? true : hasDash,
    image: hasDash || hasAgnes || hasMule,
    video: hasDash || hasAgnes || hasMule || klingVendor || viduVendor,
    audio: hasDash,
  };
}

// ── LocalStorage helpers ────────────────────────────────────────────────────

export const LS_KEY_MODEL = "lumenx_default_model_settings";

export function loadFromLS<T>(key: string): T | null {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveModelDefaultsLS(settings: DefaultModelSettings) {
  try {
    window.localStorage.setItem(LS_KEY_MODEL, JSON.stringify(normalizeModelSettings(settings, "global_settings")));
  } catch {
    // localStorage unavailable — ignore
  }
}

export function loadModelDefaultsLS(): DefaultModelSettings {
  const saved = loadFromLS<Partial<DefaultModelSettings>>(LS_KEY_MODEL);
  return normalizeModelSettings(
    {
      ...DEFAULT_MODEL_SETTINGS,
      ...(saved ?? {}),
    },
    "global_settings"
  ) as DefaultModelSettings;
}

// ── Vendors（厂商卡 + 智能补齐）────────────────────────────────────────────

export interface VendorModels {
  id: string;
  name: string;
  image: SelectableModelOption[];
  i2v: I2VModelConfig[];
  r2v: I2VModelConfig[];
}

const VENDOR_NAMES: Record<string, string> = {
  wan: "万相 Wan",
  qwen: "通义 Qwen",
  agnes: "Agnes",
  kling: "可灵 Kling",
  vidu: "Vidu",
  pixverse: "PixVerse",
  happyhorse: "快乐马 HappyHorse",
  seedance: "Seedance",
  "gpt-image": "GPT Image",
};

export const LLM_PROVIDER_LABELS: Record<string, string> = {
  dashscope: "DashScope Qwen",
  openai: "OpenAI（环境变量）",
  agnes: "Agnes",
};

const FAMILY_BY_ID: Record<string, string> = {};
for (const m of [...GLOBAL_IMAGE_MODELS, ...GLOBAL_I2V_MODELS, ...GLOBAL_R2V_MODELS]) {
  FAMILY_BY_ID[m.id] = m.family ?? "";
}

export function modelFamily(id?: string | null): string | null {
  if (!id) return null;
  return FAMILY_BY_ID[id] || null;
}

export const VENDORS: VendorModels[] = (() => {
  const map = new Map<string, VendorModels>();
  const ensure = (family: string): VendorModels => {
    let v = map.get(family);
    if (!v) {
      v = { id: family, name: VENDOR_NAMES[family] ?? family, image: [], i2v: [], r2v: [] };
      map.set(family, v);
    }
    return v;
  };
  for (const m of GLOBAL_IMAGE_MODELS) ensure(m.family ?? "").image.push(m);
  for (const m of GLOBAL_I2V_MODELS) ensure(m.family ?? "").i2v.push(m);
  for (const m of GLOBAL_R2V_MODELS) ensure(m.family ?? "").r2v.push(m);
  return Array.from(map.values()).sort(
    (a, b) => b.image.length + b.i2v.length + b.r2v.length - (a.image.length + a.i2v.length + a.r2v.length)
  );
})();

export function vendorCoverage(v: VendorModels): string {
  const parts: string[] = [];
  if (v.image.length) parts.push("图片");
  if (v.i2v.length || v.r2v.length) parts.push("视频");
  return parts.join(" · ");
}

export interface VendorApplyResult {
  next: DefaultModelSettings;
  /** 各类别是否因厂商缺失而保留原值 */
  kept: { image: boolean; i2v: boolean; r2v: boolean };
}

function pickPreferred<T extends { recommended?: boolean }>(list: T[]): T | undefined {
  return list.find((m) => m.recommended) ?? list[0];
}

export function applyVendorToSettings(vendorId: string, current: DefaultModelSettings): VendorApplyResult {
  const vendor = VENDORS.find((v) => v.id === vendorId);
  if (!vendor) return { next: current, kept: { image: true, i2v: true, r2v: true } };
  const pickImage = pickPreferred(vendor.image)?.id;
  const pickI2v = pickPreferred(vendor.i2v)?.id;
  const pickR2v = pickPreferred(vendor.r2v)?.id;
  const next = normalizeModelSettings(
    {
      ...current,
      t2i_model: pickImage ?? current.t2i_model,
      i2i_model: pickImage ?? current.i2i_model,
      i2v_model: pickI2v ?? current.i2v_model,
      r2v_model: pickR2v ?? current.r2v_model,
    },
    "global_settings"
  ) as DefaultModelSettings;
  return { next, kept: { image: !pickImage, i2v: !pickI2v, r2v: !pickR2v } };
}

/** 所有选中模型同属一个厂商时返回该厂商，混搭返回 null */
export function detectVendorId(settings: DefaultModelSettings): string | null {
  const fams = new Set(
    [settings.t2i_model, settings.i2i_model, settings.i2v_model, settings.r2v_model]
      .map((id) => modelFamily(id))
      .filter(Boolean) as string[]
  );
  return fams.size === 1 ? Array.from(fams)[0] : null;
}

export const LS_KEY_VENDOR = "lumenx_default_vendor";

export function saveVendorLS(id: string) {
  try {
    window.localStorage.setItem(LS_KEY_VENDOR, id);
  } catch {
    // localStorage unavailable — ignore
  }
}

export function loadVendorLS(): string | null {
  try {
    return typeof window !== "undefined" ? window.localStorage.getItem(LS_KEY_VENDOR) : null;
  } catch {
    return null;
  }
}

// ── AdvancedConfigSections：设置页与迷你配置卡共用的高级配置块 ───────────────

const inputClass =
  "w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-text-primary focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/40 transition-all";

const modeButtonClass = (active: boolean) =>
  `px-3 py-1.5 text-xs rounded-md transition-all ${
    active ? "bg-primary/20 text-primary border border-primary/40" : "bg-white/5 text-text-secondary border border-white/10 hover:bg-white/10"
  }`;

const labelClass = "block text-xs text-text-secondary mb-1.5";
const sectionTitleClass = "text-sm font-medium text-text-primary";

interface AdvancedConfigSectionsProps {
  config: EnvConfig;
  onChange: (key: keyof EnvConfig, value: string | boolean | Record<string, string>) => void;
  validationErrors: string[];
}

export function AdvancedConfigSections({
  config,
  onChange,
  validationErrors,
}: AdvancedConfigSectionsProps) {
  const cardClass = "rounded-xl border border-glass-border bg-surface/40 p-4 space-y-3";
  const endpointOverride = (key: string) => config.endpoint_overrides?.[key] || "";
  const setEndpoint = (key: string, value: string) =>
    onChange("endpoint_overrides", { ...(config.endpoint_overrides ?? {}), [key]: value });
  /** 服务卡内的可选自定义端点输入，占位默认值取自 ENDPOINT_PROVIDERS */
  const endpointField = (envKey: string) => {
    const meta = ENDPOINT_PROVIDERS.find((p) => p.key === envKey);
    if (!meta) return null;
    return (
      <div>
        <label className={labelClass}>
          自定义端点 <span className="text-text-muted font-normal">（可选，留空用默认）</span>
        </label>
        <input
          type="text"
          value={endpointOverride(meta.key)}
          onChange={(e) => setEndpoint(meta.key, e.target.value)}
          placeholder={meta.placeholder}
          className={inputClass + " text-xs"}
        />
      </div>
    );
  };

  return (
    <div className="mt-4 space-y-4">
      {/* 视频服务：Kling / Vidu */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div className={cardClass}>
          <div className="flex items-center justify-between">
            <h4 className={sectionTitleClass}>Kling 可灵</h4>
            <div className="flex gap-2">
              <button className={modeButtonClass(config.KLING_PROVIDER_MODE === "dashscope")} onClick={() => onChange("KLING_PROVIDER_MODE", "dashscope")}>
                DashScope
              </button>
              <button className={modeButtonClass(config.KLING_PROVIDER_MODE === "vendor")} onClick={() => onChange("KLING_PROVIDER_MODE", "vendor")}>
                厂商直连
              </button>
            </div>
          </div>
          {config.KLING_PROVIDER_MODE === "vendor" && (
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Access Key</label>
                <input
                  type="password"
                  value={config.KLING_ACCESS_KEY || ""}
                  onChange={(e) => onChange("KLING_ACCESS_KEY", e.target.value)}
                  placeholder="Kling Access Key"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Secret Key</label>
                <input
                  type="password"
                  value={config.KLING_SECRET_KEY || ""}
                  onChange={(e) => onChange("KLING_SECRET_KEY", e.target.value)}
                  placeholder="Kling Secret Key"
                  className={inputClass}
                />
              </div>
            </div>
          )}
          {endpointField("KLING_BASE_URL")}
        </div>

        <div className={cardClass}>
          <div className="flex items-center justify-between">
            <h4 className={sectionTitleClass}>Vidu</h4>
            <div className="flex gap-2">
              <button className={modeButtonClass(config.VIDU_PROVIDER_MODE === "dashscope")} onClick={() => onChange("VIDU_PROVIDER_MODE", "dashscope")}>
                DashScope
              </button>
              <button className={modeButtonClass(config.VIDU_PROVIDER_MODE === "vendor")} onClick={() => onChange("VIDU_PROVIDER_MODE", "vendor")}>
                厂商直连
              </button>
            </div>
          </div>
          {config.VIDU_PROVIDER_MODE === "vendor" && (
            <div>
              <label className={labelClass}>API Key</label>
              <input
                type="password"
                value={config.VIDU_API_KEY || ""}
                onChange={(e) => onChange("VIDU_API_KEY", e.target.value)}
                placeholder="VIDU API Key"
                className={inputClass}
              />
            </div>
          )}
          {endpointField("VIDU_BASE_URL")}
        </div>
      </div>

      {/* 图像扩展：MuleRun / Agnes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div className={cardClass}>
          <h4 className={sectionTitleClass}>MuleRun</h4>
          <p className="text-xs text-text-muted">
            GPT-Image-1 等图像模型。已通过 CLI 完成登录授权，仅需补 API Key。
          </p>
          <div>
            <label className={labelClass}>API Key</label>
            <input
              type="password"
              value={config.MULEROUTER_API_KEY || ""}
              onChange={(e) => onChange("MULEROUTER_API_KEY", e.target.value)}
              placeholder="MuleRun API Key（可选）"
              className={inputClass}
            />
          </div>
          {endpointField("MULEROUTER_BASE_URL")}
        </div>

        <div className={cardClass}>
          <h4 className={sectionTitleClass}>Agnes</h4>
          <div className="space-y-3">
            <div>
              <label className={labelClass}>API Key</label>
              <input
                type="password"
                value={config.AGNES_API_KEY || ""}
                onChange={(e) => onChange("AGNES_API_KEY", e.target.value)}
                placeholder="Agnes API Key（可选）"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>模型</label>
              <select
                value={config.AGNES_MODEL || ""}
                onChange={(e) => onChange("AGNES_MODEL", e.target.value)}
                className={inputClass}
              >
                <option value="agnes-2.5-pro-beta">agnes-2.5-pro-beta（默认）</option>
                <option value="agnes-2.5-flash">agnes-2.5-flash</option>
                <option value="agnes-3.0-flash">agnes-3.0-flash</option>
              </select>
            </div>
          </div>
          {endpointField("AGNES_BASE_URL")}
        </div>
      </div>

      {/* 阿里云 OSS */}
      <div className={cardClass}>
        <h4 className={sectionTitleClass}>
          阿里云 AccessKey 与 OSS <span className="text-xs text-text-muted font-normal">（可选，资产云端存储）</span>
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>AccessKey ID</label>
            <input
              type="password"
              value={config.ALIBABA_CLOUD_ACCESS_KEY_ID || ""}
              onChange={(e) => onChange("ALIBABA_CLOUD_ACCESS_KEY_ID", e.target.value)}
              placeholder="阿里云 AK"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>AccessKey Secret</label>
            <input
              type="password"
              value={config.ALIBABA_CLOUD_ACCESS_KEY_SECRET || ""}
              onChange={(e) => onChange("ALIBABA_CLOUD_ACCESS_KEY_SECRET", e.target.value)}
              placeholder="阿里云 SK"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>OSS Bucket</label>
            <input
              value={config.OSS_BUCKET_NAME || ""}
              onChange={(e) => onChange("OSS_BUCKET_NAME", e.target.value)}
              placeholder="bucket 名称"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>OSS Endpoint</label>
            <input
              value={config.OSS_ENDPOINT || ""}
              onChange={(e) => onChange("OSS_ENDPOINT", e.target.value)}
              placeholder="oss-cn-hangzhou.aliyuncs.com"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* 校验提示 */}
      {validationErrors.length > 0 && (
        <div className="space-y-1.5">
          {validationErrors.map((err, idx) => (
            <p key={idx} className="text-xs text-amber-400/90 flex items-start gap-1.5">
              <span className="mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" />
              {err}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
