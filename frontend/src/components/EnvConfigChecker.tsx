"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Key, X } from "lucide-react";
import EnvConfigDialog from "@/components/project/EnvConfigDialog";
import { api, markDashScopeKeyConfigured, setKeyPromptWaiter } from "@/lib/api";

const BANNER_DISMISS_KEY = "lumenx_key_banner_dismissed";

/**
 * 启动时检查 API Key 配置状态（非阻断）：
 * - 缺少 DashScope Key 时，顶部显示可关闭的细横幅；
 * - 注册全局「补 Key」桥接：生成动作缺 Key 时由 api.ts 拦截器打开迷你配置卡，
 *   保存后自动继续原动作，不再整页 reload。
 */
export default function EnvConfigChecker() {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [resolveRef, setResolveRef] = useState<(() => void) | null>(null);
  const [rejectRef, setRejectRef] = useState<(() => void) | null>(null);

  // 注册全局缺 Key 提示（供 axios 拦截器调用）
  useEffect(() => {
    const openPrompt = () =>
      new Promise<void>((resolve, reject) => {
        setResolveRef(() => resolve);
        setRejectRef(() => reject);
        setPromptOpen(true);
      });
    setKeyPromptWaiter(openPrompt);
    return () => setKeyPromptWaiter(null);
  }, []);

  // 启动检查
  useEffect(() => {
    try {
      setBannerDismissed(
        typeof window !== "undefined" && window.sessionStorage.getItem(BANNER_DISMISS_KEY) === "1"
      );
    } catch {
      // sessionStorage unavailable
    }
    api
      .getEnvConfig()
      .then((config) => {
        const key = (config as { DASHSCOPE_API_KEY?: string })?.DASHSCOPE_API_KEY?.trim() ?? "";
        markDashScopeKeyConfigured(key);
        setHasKey(!!key);
      })
      .catch(() => setHasKey(false));
  }, []);

  const dismissBanner = () => {
    setBannerDismissed(true);
    try {
      window.sessionStorage.setItem(BANNER_DISMISS_KEY, "1");
    } catch {
      // sessionStorage unavailable
    }
  };

  const closePrompt = (saved: boolean) => {
    setPromptOpen(false);
    if (saved) {
      setHasKey(true);
      resolveRef?.();
    } else {
      rejectRef?.();
    }
    setResolveRef(null);
    setRejectRef(null);
  };

  const showBanner = hasKey === false && !bannerDismissed && !promptOpen;

  return (
    <>
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ y: -44, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -44, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="fixed top-0 inset-x-0 z-40 flex justify-center pointer-events-none"
          >
            <div className="pointer-events-auto mt-3 flex items-center gap-3 rounded-full border border-primary/30 bg-[#0b0b14]/90 backdrop-blur-md pl-4 pr-2 py-1.5 shadow-lg shadow-primary/10">
              <Key size={14} className="text-primary shrink-0" />
              <span className="text-xs text-text-secondary">完成 1 步配置，解锁 AI 生成</span>
              <button
                onClick={() => setPromptOpen(true)}
                className="text-xs px-3 py-1 rounded-full bg-primary text-white hover:bg-primary/90 transition-colors"
              >
                立即配置
              </button>
              <button
                onClick={dismissBanner}
                aria-label="关闭提示"
                className="text-text-muted hover:text-text-primary transition-colors p-1"
              >
                <X size={13} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <EnvConfigDialog isOpen={promptOpen} onClose={() => closePrompt(false)} onSaved={() => closePrompt(true)} />
    </>
  );
}
