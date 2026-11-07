"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, ExternalLink, Key, Loader2, X } from "lucide-react";
import { api, markDashScopeKeyConfigured } from "@/lib/api";
import type { EnvConfigPayload } from "@/lib/api";

interface EnvConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** 保存成功后回调（供「自动继续原动作」使用） */
  onSaved?: () => void;
  /** 兼容旧调用方，已无实际作用（卡片始终可关闭） */
  isRequired?: boolean;
}

/**
 * 迷你补 Key 卡片：只关心一件事 —— 粘贴 DashScope API Key → 保存 → 继续。
 * 不再整页 reload；完整配置请前往设置页（就绪仪表盘）。
 */
export default function EnvConfigDialog({ isOpen, onClose, onSaved }: EnvConfigDialogProps) {
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const loadedRef = useRef<EnvConfigPayload | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSavedFlash(false);
    setSaving(false);
    setApiKey("");
    setLoading(true);
    api
      .getEnvConfig()
      .then((data) => {
        loadedRef.current = data;
        setApiKey((data as { DASHSCOPE_API_KEY?: string })?.DASHSCOPE_API_KEY ?? "");
      })
      .catch(() => {
        loadedRef.current = null;
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  const handleSave = async () => {
    const key = apiKey.trim();
    if (!key) {
      setError("请先粘贴 DashScope API Key");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.saveEnvConfig({
        ...(loadedRef.current ?? {}),
        DASHSCOPE_API_KEY: key,
      } as EnvConfigPayload);
      markDashScopeKeyConfigured(key);
      setSavedFlash(true);
      onSaved?.();
      setTimeout(() => {
        setSavedFlash(false);
        onClose();
      }, 450);
    } catch (e) {
      setError("保存失败，请检查后端服务是否可用");
      setSaving(false);
    }
  };

  const openFullSettings = () => {
    onClose();
    if (typeof window !== "undefined") {
      window.location.hash = "#/settings";
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.18 }}
            className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#0b0b14]/95 shadow-2xl overflow-hidden"
          >
            {/* header */}
            <div className="flex items-center justify-between px-5 pt-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Key size={16} className="text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">1 步解锁 AI 生成</h3>
                  <p className="text-xs text-text-muted mt-0.5">文本 · 图片 · 视频 · 音频 一次配置全部就绪</p>
                </div>
              </div>
              <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* body */}
            <div className="px-5 pt-4 pb-5">
              {loading ? (
                <div className="flex items-center justify-center py-6 text-text-muted">
                  <Loader2 size={18} className="animate-spin" />
                </div>
              ) : (
                <>
                  <input
                    type="password"
                    autoFocus
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !saving) handleSave();
                    }}
                    placeholder="粘贴 DashScope API Key（sk-...）"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-text-primary font-mono focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/40 transition-all"
                  />
                  {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
                  <button
                    onClick={handleSave}
                    disabled={saving || savedFlash}
                    className="mt-3.5 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-all"
                  >
                    {savedFlash ? (
                      <>
                        <CheckCircle2 size={16} /> 已保存
                      </>
                    ) : saving ? (
                      <>
                        <Loader2 size={16} className="animate-spin" /> 保存中…
                      </>
                    ) : (
                      "保存并继续"
                    )}
                  </button>
                  <button
                    onClick={openFullSettings}
                    className="mt-2.5 w-full flex items-center justify-center gap-1.5 text-xs text-text-secondary hover:text-primary transition-colors"
                  >
                    <ExternalLink size={12} />
                    需要更多配置？打开设置页（就绪仪表盘）
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
