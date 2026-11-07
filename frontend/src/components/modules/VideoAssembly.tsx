"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, Film, AlertTriangle, Layout, Clock, FileText, Download, Music, Sliders, Package, Type, Subtitles, Image as ImageIcon, ImagePlus, Save, Sparkles } from "lucide-react";
import { useProjectStore } from "@/store/projectStore";
import { api, type BgmPreset } from "@/lib/api";
import { getAssetUrl, extractErrorDetail } from "@/lib/utils";
import StepHeader from "@/components/shared/StepHeader";
import SidePanelHeader from "@/components/shared/SidePanelHeader";

type AssemblyPhase = "takes" | "mix" | "export";

export default function VideoAssembly() {
    const ta = useTranslations("assembly");
    const tStep = useTranslations("stepHeader");
    const currentProject = useProjectStore((state) => state.currentProject);
    const updateProject = useProjectStore((state) => state.updateProject);

    const [phase, setPhase] = useState<AssemblyPhase>("takes");
    const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
    const [isMerging, setIsMerging] = useState(false);
    const [mergeError, setMergeError] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);

    // Group videos by frame
    const videosByFrame = useMemo(() => {
        if (!currentProject?.video_tasks) return {};

        const grouped: Record<string, any[]> = {};
        currentProject.video_tasks.forEach((task: any) => {
            if (task.status === "completed" && task.video_url) {
                if (task.frame_id) {
                    if (!grouped[task.frame_id]) grouped[task.frame_id] = [];
                    grouped[task.frame_id].push(task);
                }
            }
        });
        return grouped;
    }, [currentProject?.video_tasks]);

    const handleSelectVideo = async (frameId: string, videoId: string) => {
        if (!currentProject) return;
        try {
            const updatedProject = await api.selectVideo(currentProject.id, frameId, videoId);
            updateProject(currentProject.id, updatedProject);
        } catch (error) {
            console.error("Failed to select video:", error);
        }
    };

    const handleMerge = async () => {
        if (!currentProject) return;
        setIsMerging(true);
        setMergeError(null);  // Clear previous errors

        try {
            const updatedProject = await api.mergeVideos(currentProject.id);
            updateProject(currentProject.id, updatedProject);
            // Success - error will be null, merged video will show below
        } catch (error: any) {
            console.error("Failed to merge videos:", error);

            // Extract detailed error message from backend
            const errorDetail = extractErrorDetail(error, "Unknown error occurred during video merge");

            setMergeError(errorDetail);

            // Also show alert for immediate feedback
            alert(`${ta("mergeFailedAlert")}:\n\n${errorDetail}`);
        } finally {
            setIsMerging(false);
        }
    };


    const handleDownload = async () => {
        if (!currentProject?.merged_video_url) return;
        setIsDownloading(true);
        try {
            // Build download URL - use proxy in dev to avoid CORS, direct in production
            const rawPath = currentProject.merged_video_url;
            const cleanPath = rawPath.startsWith("/") ? rawPath.slice(1) : rawPath;
            const isDev = process.env.NODE_ENV === "development";
            const base = isDev
                ? `/api-proxy/files/${cleanPath}`
                : getAssetUrl(rawPath);
            // Cache-busting: the <video> preview may leave a cached partial (206)
            // entry for this URL, which makes fetch()+blob fail with
            // net::ERR_FAILED 206. A unique URL forces a fresh full GET, and an
            // anchor download streams natively instead of buffering in memory.
            const url = `${base}${base.includes("?") ? "&" : "?"}t=${Date.now()}`;
            const a = document.createElement("a");
            a.href = url;
            a.download = `${currentProject.title || "merged"}_${currentProject.id}.mp4`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            // Let the browser start the download before resetting the button
            setTimeout(() => setIsDownloading(false), 1500);
        } catch (error) {
            console.error("Failed to download video:", error);
            alert(ta("downloadFailed"));
            setIsDownloading(false);
        }
    };

    const selectedFrame = useMemo(() => {
        return currentProject?.frames?.find((f: any) => f.id === selectedFrameId);
    }, [currentProject?.frames, selectedFrameId]);

    const variants = selectedFrameId ? videosByFrame[selectedFrameId] || [] : [];

    const framesReady = currentProject?.frames?.filter((f: any) => f.selected_video_id).length ?? 0;
    const framesTotal = currentProject?.frames?.length ?? 0;

    return (
        // Layout v4: outer horizontal split. StepHeader belongs to main
        // column; right Variants panel is floor-to-ceiling with its own
        // SidePanelHeader.
        <div className="h-full flex bg-surface overflow-hidden">
            {/* Left: main column */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <StepHeader
                    stepNumber={4}
                    icon={<Film />}
                    englishName="Assembly"
                    title={tStep("assemblyTitle")}
                    subtitle={tStep("assemblySubtitle")}
                    trailing={(
                        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
                            <span className="text-foreground font-medium">{framesReady}</span>
                            <span className="text-text-muted">/{framesTotal}</span>
                            <span className="ml-1.5">frames ready</span>
                        </span>
                    )}
                />
                {/* PR-3k · Phase tabs — Takes / Mix / Export */}
                <div className="flex items-center gap-1 px-6 pt-2 border-b border-glass-border bg-surface">
                    {[
                        { id: "takes" as const,  label: ta("phaseTakes"),  icon: <Film size={12} /> },
                        { id: "mix" as const,    label: ta("phaseMix"),    icon: <Sliders size={12} /> },
                        { id: "export" as const, label: ta("phaseExport"), icon: <Package size={12} /> },
                    ].map((p) => (
                        <button
                            key={p.id}
                            onClick={() => setPhase(p.id)}
                            className={`relative inline-flex items-center gap-1.5 px-3 pb-2 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors ${
                                phase === p.id
                                    ? "text-foreground"
                                    : "text-text-muted hover:text-text-secondary"
                            }`}
                        >
                            {p.icon}
                            {p.label}
                            {phase === p.id && (
                                <span className="absolute bottom-0 left-2 right-2 h-px bg-primary" aria-hidden="true" />
                            )}
                        </button>
                    ))}
                </div>
                {/* Takes phase body */}
                {phase === "takes" && (
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
                        {currentProject?.frames?.map((frame: any, index: number) => {
                            const hasVideos = videosByFrame[frame.id]?.length > 0;
                            const isSelected = frame.id === selectedFrameId;
                            const selectedVideoId = frame.selected_video_id;
                            const selectedVideo = currentProject.video_tasks?.find((v: any) => v.id === selectedVideoId);

                            return (
                                <motion.div
                                    key={frame.id}
                                    layoutId={`frame-${frame.id}`}
                                    onClick={() => setSelectedFrameId(frame.id)}
                                    className={`group relative flex rounded-xl overflow-hidden cursor-pointer border transition-all bg-glass hover:bg-hover-bg ${isSelected ? "border-primary ring-1 ring-primary/50" :
                                        selectedVideoId ? "border-green-500/30" : "border-glass-border"
                                        }`}
                                >
                                    {/* Left: Preview */}
                                    <div className="w-48 aspect-video relative flex-shrink-0 border-r border-glass-border bg-elevated">
                                        {selectedVideo ? (
                                            <video
                                                src={getAssetUrl(
                                                    frame.dubbed_video_task_id === selectedVideo.id && frame.dubbed_video_url
                                                        ? frame.dubbed_video_url
                                                        : selectedVideo.video_url
                                                )}
                                                className="w-full h-full object-cover"
                                                muted
                                                onMouseOver={(e) => e.currentTarget.play()}
                                                onMouseOut={(e) => {
                                                    e.currentTarget.pause();
                                                    e.currentTarget.currentTime = 0;
                                                }}
                                            />
                                        ) : (
                                            <div className="w-full h-full relative">
                                                {frame.image_url ? (
                                                    <img
                                                        src={getAssetUrl(frame.image_url)}
                                                        className="w-full h-full object-cover opacity-50 grayscale"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full bg-glass" />
                                                )}
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    {hasVideos ? (
                                                        <div className="bg-yellow-500/20 text-yellow-500 px-2 py-1 rounded text-xs font-bold border border-yellow-500/50">
                                                            {ta("selectVideo")}
                                                        </div>
                                                    ) : (
                                                        <div className="bg-red-500/20 text-red-500 px-2 py-1 rounded text-xs font-bold border border-red-500/50">
                                                            {ta("noVideos")}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        <div className="absolute top-2 left-2 bg-surface px-2 py-0.5 rounded text-[10px] font-mono text-foreground">
                                            #{index + 1}
                                        </div>
                                    </div>

                                    {/* Right: Details */}
                                    <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
                                        <div className="space-y-2">
                                            <div className="flex items-start gap-2">
                                                <FileText size={14} className="text-text-muted mt-0.5 flex-shrink-0" />
                                                <p className="text-sm text-text-secondary line-clamp-2 leading-relaxed">
                                                    {frame.image_prompt || frame.action_description || ta("noPrompt")}
                                                </p>
                                            </div>
                                            {frame.dialogue && (
                                                <div className="flex items-start gap-2 pl-6 border-l-2 border-glass-border ml-1">
                                                    <p className="text-xs text-text-secondary italic">"{frame.dialogue}"</p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border-subtle">
                                            <div className="flex items-center gap-4 text-xs text-text-muted">
                                                <span className="flex items-center gap-1">
                                                    <Clock size={12} /> {selectedVideo ? `${selectedVideo.duration}s` : "--"}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Film size={12} /> {videosByFrame[frame.id]?.length || 0} {ta("variants")}
                                                </span>
                                            </div>

                                            {selectedVideoId && (
                                                <div className="flex items-center gap-1 text-green-500 text-xs font-bold">
                                                    <Check size={12} /> Ready
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                </div>
                )}

                {/* Mix phase body — BGM picker + per-track volume sliders */}
                {phase === "mix" && (
                    <MixPhase scriptId={currentProject?.id ?? null}
                              bgmUrl={currentProject?.bgm_url ?? null}
                              mixSettings={currentProject?.mix_settings as Record<string, number> | undefined}
                              onChange={(updated) => currentProject && updateProject(currentProject.id, updated)}
                    />
                )}

                {/* Export phase body — composition settings + merge action + final preview + download */}
                {phase === "export" && (
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-6">
                        <CompositionPanel
                            projectId={currentProject?.id ?? null}
                            project={currentProject}
                            onProjectUpdate={(updated: any) => currentProject && updateProject(currentProject.id, updated)}
                        />
                        <ExportPhase
                            mergedVideoUrl={currentProject?.merged_video_url ?? null}
                            isMerging={isMerging}
                            isDownloading={isDownloading}
                            mergeError={mergeError}
                            framesReady={framesReady}
                            framesTotal={framesTotal}
                            onMerge={handleMerge}
                            onDownload={handleDownload}
                            onDismissError={() => setMergeError(null)}
                        />
                    </div>
                )}
                </div>

            {/* Right Sidebar - Variants — only visible in Takes phase */}
            {phase === "takes" && (
            <div className="w-[360px] shrink-0 bg-surface flex flex-col z-10 border-l border-glass-border overflow-hidden">
                <SidePanelHeader
                    icon={<Film />}
                    title={ta("variants")}
                    subtitle={selectedFrameId
                        ? `Frame #${(currentProject?.frames?.findIndex((f: any) => f.id === selectedFrameId) ?? -1) + 1}`
                        : undefined}
                />
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                        {selectedFrameId ? (
                            <div className="space-y-4">
                                {variants.length > 0 ? (
                                    variants.map((video: any, idx: number) => {
                                        const isSelected = selectedFrame?.selected_video_id === video.id;
                                        return (
                                            <div
                                                key={video.id}
                                                className={`rounded-xl overflow-hidden border transition-all group ${isSelected ? "border-green-500 ring-1 ring-green-500/50 bg-green-500/5" : "border-glass-border bg-glass hover:border-glass-border"
                                                    }`}
                                            >
                                                <div className="aspect-video relative bg-black">
                                                    <video
                                                        src={getAssetUrl(
                                                            selectedFrame?.dubbed_video_task_id === video.id && selectedFrame?.dubbed_video_url
                                                                ? selectedFrame.dubbed_video_url
                                                                : video.video_url
                                                        )}
                                                        className="w-full h-full object-contain"
                                                        controls
                                                    />
                                                    {/* Overlay Info */}
                                                    <div className="absolute top-2 left-2 bg-surface px-1.5 rounded text-[10px] text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {video.duration}s
                                                    </div>
                                                </div>
                                                <div className="p-3">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="text-xs text-text-secondary">
                                                            Variant #{idx + 1}
                                                        </div>
                                                        <div className="text-[10px] px-1.5 py-0.5 rounded bg-hover-bg text-text-secondary">
                                                            {video.model}
                                                        </div>
                                                    </div>

                                                    {isSelected ? (
                                                        <div className="w-full py-2 bg-green-500/10 text-green-500 rounded-lg text-xs font-bold flex items-center justify-center gap-2 border border-green-500/20">
                                                            <Check size={14} /> {ta("selected")}
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleSelectVideo(selectedFrameId, video.id)}
                                                            className="w-full py-2 bg-hover-bg hover:bg-hover-bg rounded-lg text-xs font-medium transition-colors text-foreground"
                                                        >
                                                            {ta("selectThisVariant")}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="text-center py-12 text-text-muted flex flex-col items-center">
                                        <AlertTriangle className="mb-3 opacity-50" size={32} />
                                        <p className="text-sm font-medium">{ta("noVideosGenerated")}</p>
                                        <p className="text-xs mt-1 max-w-[200px]">{ta("noVideosHint")}</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-text-muted gap-3">
                                <Layout size={48} className="opacity-10" />
                                <p className="text-sm">{ta("selectFrameHint")}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────
// PR-3k · Phase sub-components
// ──────────────────────────────────────────────────────────────────

function MixPhase({
    scriptId,
    bgmUrl,
    mixSettings,
    onChange,
}: {
    scriptId: string | null;
    bgmUrl: string | null;
    mixSettings: Record<string, number> | undefined;
    onChange: (updated: { bgm_url?: string | null; mix_settings?: Record<string, number> }) => void;
}) {
    const ta = useTranslations("assembly");
    const [presets, setPresets] = useState<BgmPreset[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const mix = mixSettings ?? { dialogue: 100, bgm: 35, sfx: 60 };

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        api.listBgmPresets()
            .then((p) => { if (!cancelled) setPresets(p); })
            .catch(() => { if (!cancelled) setPresets([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    const handlePick = async (preset: BgmPreset | null) => {
        if (!scriptId) return;
        setSaving(true);
        try {
            const updated = await api.updateAudioMix(scriptId, { bgm_url: preset ? preset.url : null });
            onChange({ bgm_url: updated.bgm_url, mix_settings: updated.mix_settings });
        } finally {
            setSaving(false);
        }
    };

    const handleVolume = async (track: "dialogue" | "bgm" | "sfx", value: number) => {
        if (!scriptId) return;
        // Optimistic update for snappy slider
        onChange({ mix_settings: { ...mix, [track]: value } });
        try {
            const payload: Record<string, number> = {};
            payload[`${track}_volume`] = value;
            await api.updateAudioMix(scriptId, payload as any);
        } catch (_) {
            // Revert handled by next project refresh — keep silent for v1
        }
    };

    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-8">
            {/* BGM picker */}
            <section>
                <h3 className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
                    <Music size={12} className="text-primary" />
                    {ta("mixBgmTitle")}
                    {saving && <Loader2 size={12} className="animate-spin text-primary" />}
                </h3>
                {/* Preview banner — backend amix is wired (pipeline.merge_videos),
                    but the preset audio files aren't shipped yet, so the merged
                    output today is silent regardless of selection. We surface
                    this honestly so users don't keep selecting BGM and wondering
                    why the export has no music. */}
                <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-400/85" aria-hidden="true" />
                    <p className="text-[11.5px] leading-relaxed text-amber-100/85">
                        {ta("mixBgmPreviewNotice")}
                    </p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    <button
                        onClick={() => handlePick(null)}
                        className={`rounded-lg border p-3 text-left transition-colors ${
                            !bgmUrl
                                ? "border-primary bg-[rgba(100,108,255,0.10)]"
                                : "border-glass-border bg-glass hover:border-white/15"
                        }`}
                    >
                        <p className="text-[13px] font-medium text-foreground">{ta("mixBgmNone")}</p>
                        <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-text-muted">silent</p>
                    </button>
                    {loading ? (
                        <div className="col-span-3 grid place-items-center py-4 text-text-muted">
                            <Loader2 size={16} className="animate-spin" />
                        </div>
                    ) : (
                        presets.map((p) => {
                            const selected = bgmUrl === p.url;
                            return (
                                <button
                                    key={p.id}
                                    onClick={() => handlePick(p)}
                                    className={`rounded-lg border p-3 text-left transition-colors ${
                                        selected
                                            ? "border-primary bg-[rgba(100,108,255,0.10)]"
                                            : "border-glass-border bg-glass hover:border-white/15"
                                    }`}
                                >
                                    <p className="text-[13px] font-medium text-foreground truncate">{p.label}</p>
                                    <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-text-muted">{p.mood}</p>
                                </button>
                            );
                        })
                    )}
                </div>
            </section>

            {/* Volume sliders */}
            <section>
                <h3 className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
                    <Sliders size={12} className="text-primary" />
                    {ta("mixLevelsTitle")}
                </h3>
                <div className="space-y-3 max-w-lg">
                    {(["dialogue", "bgm", "sfx"] as const).map((track) => (
                        <div key={track} className="flex items-center gap-3">
                            <span className="w-20 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">{ta(`mixTrack.${track}`)}</span>
                            <input
                                type="range"
                                min={0}
                                max={100}
                                step={1}
                                value={mix[track] ?? 0}
                                onChange={(e) => handleVolume(track, Number(e.target.value))}
                                className="flex-1 accent-primary"
                            />
                            <span className="w-12 text-right font-mono text-[11px] text-text-secondary">{mix[track] ?? 0}</span>
                        </div>
                    ))}
                </div>
                <p className="mt-3 text-[11px] text-text-muted max-w-lg">
                    {ta("mixHint")}
                </p>
            </section>
        </div>
    );
}

function ExportPhase({
    mergedVideoUrl,
    isMerging,
    isDownloading,
    mergeError,
    framesReady,
    framesTotal,
    onMerge,
    onDownload,
    onDismissError,
}: {
    mergedVideoUrl: string | null;
    isMerging: boolean;
    isDownloading: boolean;
    mergeError: string | null;
    framesReady: number;
    framesTotal: number;
    onMerge: () => void;
    onDownload: () => void;
    onDismissError: () => void;
}) {
    const ta = useTranslations("assembly");
    const allReady = framesTotal > 0 && framesReady === framesTotal;
    return (
        <div className="space-y-6 max-w-3xl">
            <section className="rounded-xl border border-glass-border bg-glass p-6">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h3 className="text-display font-medium text-foreground flex items-center gap-2">
                            <Package size={16} className="text-primary" />
                            {ta("exportTitle")}
                        </h3>
                        <p className="mt-1 text-body-sm text-text-secondary">
                            {ta("exportSubtitle", { ready: framesReady, total: framesTotal })}
                        </p>
                    </div>
                    <button
                        onClick={onMerge}
                        disabled={isMerging || !allReady}
                        className="shrink-0 inline-flex items-center gap-2 bg-primary text-white border border-[rgba(100,108,255,0.65)] shadow-[inset_0_1.5px_0_rgba(255,255,255,0.14)] hover:bg-[#7a82ff] disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2.5 rounded-md font-semibold text-[13px]"
                    >
                        {isMerging ? <Loader2 size={14} className="animate-spin" /> : <Film size={14} />}
                        {ta("mergeAndProceed")}
                    </button>
                </div>
            </section>

            {mergeError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
                        <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-bold text-red-400 mb-1">{ta("mergeFailed")}</h4>
                            <p className="text-xs text-red-300/90 whitespace-pre-wrap leading-relaxed font-mono break-all">
                                {mergeError}
                            </p>
                            {mergeError.toLowerCase().includes("ffmpeg") && (
                                <a href="https://ffmpeg.org/download.html" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300 underline mt-2 inline-block">
                                    Download FFmpeg →
                                </a>
                            )}
                            <button onClick={onDismissError} className="mt-3 text-xs text-text-secondary hover:text-foreground underline">
                                {ta("dismiss")}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <AnimatePresence>
                {mergedVideoUrl && (
                    <motion.section
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="rounded-xl border border-glass-border bg-elevated overflow-hidden"
                    >
                        <div className="grid md:grid-cols-2 gap-0">
                            <div className="aspect-video bg-black">
                                <video src={getAssetUrl(mergedVideoUrl)} className="w-full h-full object-contain" controls autoPlay />
                            </div>
                            <div className="p-5 flex flex-col justify-center gap-3">
                                <div>
                                    <h3 className="text-display font-medium text-foreground flex items-center gap-2">
                                        <Check className="text-green-500" size={16} />
                                        {ta("mergedVideoReady")}
                                    </h3>
                                    <p className="text-body-sm text-text-secondary mt-1">{ta("mergedVideoDesc")}</p>
                                </div>
                                <button
                                    onClick={onDownload}
                                    disabled={isDownloading}
                                    className="self-start inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-glass border border-glass-border text-foreground hover:bg-hover-bg transition-colors text-[13px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Download size={14} />
                                    {isDownloading ? ta("downloading") : ta("downloadMP4")}
                                </button>
                            </div>
                        </div>
                    </motion.section>
                )}
            </AnimatePresence>
        </div>
    );
}

/* ============ 合成设置面板：片头片尾 / 字幕 / 封面 ============ */

interface TitleSettingsShape {
    enabled?: boolean;
    title_text?: string;
    title_color?: string;
    title_font_size?: number;
    title_duration?: number;
    ending_text?: string;
    ending_font_size?: number;
    ending_duration?: number;
}

interface SubtitleSettingsShape {
    language?: string;
    ai_correct?: boolean;
    burn_subtitles?: boolean;
    font_size?: number;
    font_color?: string;
    outline_color?: string;
    margin_v?: number;
    srt_url?: string | null;
    srt_content?: string | null;
    corrected?: boolean;
}

interface CoverTextLayerShape {
    text?: string;
    x?: number;
    y?: number;
    font_size?: number;
    color?: string;
    stroke_color?: string;
    stroke_width?: number;
    align?: string;
}

interface CoverShape {
    poster_image_url?: string | null;
    final_image_url?: string | null;
    text_layers?: CoverTextLayerShape[];
    embed_on_compose?: boolean;
    source_prompt?: string | null;
}

const compInputClass = "w-full rounded-md border border-glass-border bg-glass px-3 py-2 text-[13px] text-foreground placeholder:text-text-secondary/60 outline-none focus:border-primary/60";

function CompositionPanel({
    projectId,
    project,
    onProjectUpdate,
}: {
    projectId: string | null;
    project: any;
    onProjectUpdate: (updated: any) => void;
}) {
    const t = useTranslations("assembly");
    const [title, setTitle] = useState<TitleSettingsShape>({});
    const [subtitle, setSubtitle] = useState<SubtitleSettingsShape>({});
    const [cover, setCover] = useState<CoverShape>({});
    const [coverTitle, setCoverTitle] = useState("");
    const [coverSubtitle, setCoverSubtitle] = useState("");
    const [posterPrompt, setPosterPrompt] = useState("");
    const [srtDraft, setSrtDraft] = useState("");
    const [saving, setSaving] = useState(false);
    const [justSaved, setJustSaved] = useState(false);
    const [error, setError] = useState("");
    const [subtitleBusy, setSubtitleBusy] = useState(false);
    const [srtSaving, setSrtSaving] = useState(false);
    const [posterBusy, setPosterBusy] = useState(false);
    const [composeBusy, setComposeBusy] = useState(false);
    const [whisper, setWhisper] = useState<{ whisper_cli: string | null; whisper_model: string | null; vad_model: string | null } | null>(null);

    const whisperReady = Boolean(whisper?.whisper_cli && whisper?.whisper_model && whisper?.vad_model);

    const syncFromScript = (script: any) => {
        const ts: TitleSettingsShape = script?.title_settings ?? {};
        const ss: SubtitleSettingsShape = script?.subtitle_settings ?? {};
        const cv: CoverShape = script?.cover ?? {};
        setTitle(ts);
        setSubtitle(ss);
        setCover(cv);
        setSrtDraft(typeof ss.srt_content === "string" ? ss.srt_content : "");
        setCoverTitle(cv.text_layers?.[0]?.text ?? "");
        setCoverSubtitle(cv.text_layers?.[1]?.text ?? "");
        setPosterPrompt(cv.source_prompt ?? "");
        onProjectUpdate(script);
    };

    // 仅在切换项目时从 store 载入本地编辑态（避免 onProjectUpdate 回写触发重载覆盖编辑）
    useEffect(() => {
        if (!project) return;
        const ss: SubtitleSettingsShape = project.subtitle_settings ?? {};
        const cv: CoverShape = project.cover ?? {};
        setTitle(project.title_settings ?? {});
        setSubtitle(ss);
        setCover(cv);
        setSrtDraft(typeof ss.srt_content === "string" ? ss.srt_content : "");
        setCoverTitle(cv.text_layers?.[0]?.text ?? "");
        setCoverSubtitle(cv.text_layers?.[1]?.text ?? "");
        setPosterPrompt(cv.source_prompt ?? "");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId]);

    // 探测 whisper.cpp 字幕工具链可用性
    useEffect(() => {
        api.getSubtitleToolStatus().then(setWhisper).catch(() => setWhisper(null));
    }, []);

    const buildCoverLayers = (): CoverTextLayerShape[] => {
        const layers: CoverTextLayerShape[] = [];
        if (coverTitle.trim()) {
            layers.push({ text: coverTitle.trim(), x: 0.5, y: 0.34, font_size: 96, color: "#FFFFFF", stroke_color: "#000000", stroke_width: 6, align: "center" });
        }
        if (coverSubtitle.trim()) {
            layers.push({ text: coverSubtitle.trim(), x: 0.5, y: 0.52, font_size: 44, color: "#FFD700", stroke_color: "#000000", stroke_width: 4, align: "center" });
        }
        return layers;
    };

    const handleSave = async () => {
        if (!projectId || saving) return;
        setSaving(true);
        setError("");
        try {
            const script = await api.updateCompositionSettings(projectId, {
                title_settings: title,
                subtitle_settings: subtitle,
                cover: { ...cover, text_layers: buildCoverLayers() },
            });
            syncFromScript(script);
            setJustSaved(true);
            setTimeout(() => setJustSaved(false), 2000);
        } catch (err) {
            setError(extractErrorDetail(err, t("compFailed")));
        } finally {
            setSaving(false);
        }
    };

    const handleGenerateSubtitles = async () => {
        if (!projectId || subtitleBusy) return;
        setSubtitleBusy(true);
        setError("");
        try {
            const script = await api.generateSubtitles(projectId, subtitle.ai_correct !== false);
            syncFromScript(script);
        } catch (err) {
            setError(extractErrorDetail(err, t("compFailed")));
        } finally {
            setSubtitleBusy(false);
        }
    };

    const handleSaveSrt = async () => {
        if (!projectId || srtSaving) return;
        setSrtSaving(true);
        setError("");
        try {
            const script = await api.saveSubtitles(projectId, srtDraft);
            syncFromScript(script);
        } catch (err) {
            setError(extractErrorDetail(err, t("compFailed")));
        } finally {
            setSrtSaving(false);
        }
    };

    const handleGeneratePoster = async () => {
        if (!projectId || posterBusy) return;
        setPosterBusy(true);
        setError("");
        try {
            const script = await api.generateCoverPoster(projectId, posterPrompt);
            syncFromScript(script);
        } catch (err) {
            setError(extractErrorDetail(err, t("compFailed")));
        } finally {
            setPosterBusy(false);
        }
    };

    const handleComposeCover = async () => {
        if (!projectId || composeBusy) return;
        setComposeBusy(true);
        setError("");
        try {
            // 先持久化文字图层再渲染，保证合成结果与界面一致
            await api.updateCompositionSettings(projectId, {
                cover: { ...cover, text_layers: buildCoverLayers() },
            });
            const script = await api.composeCover(projectId);
            syncFromScript(script);
        } catch (err) {
            setError(extractErrorDetail(err, t("compFailed")));
        } finally {
            setComposeBusy(false);
        }
    };

    const previewUrl = cover.final_image_url || cover.poster_image_url;

    return (
        <div className="rounded-xl border border-glass-border bg-glass p-6 space-y-5 max-w-3xl">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <h3 className="text-display font-medium text-foreground flex items-center gap-2">
                        <Sparkles size={16} className="text-violet-400" />
                        {t("compPanelTitle")}
                    </h3>
                    <p className="mt-1 text-body-sm text-text-secondary">{t("compPanelHint")}</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving || !projectId}
                    className="shrink-0 inline-flex items-center gap-2 bg-primary text-white border border-[rgba(100,108,255,0.65)] shadow-[inset_0_1.5px_0_rgba(255,255,255,0.14)] hover:bg-[#7a82ff] disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded-md font-semibold text-[12px]"
                >
                    {saving ? <Loader2 size={13} className="animate-spin" /> : justSaved ? <Check size={13} className="text-green-300" /> : <Save size={13} />}
                    {saving ? t("compSaving") : justSaved ? t("compSaved") : t("compSave")}
                </button>
            </div>

            {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
                    <p className="text-xs text-red-300/90 whitespace-pre-wrap break-all font-mono">{error}</p>
                </div>
            )}

            {/* 片头 / 片尾 */}
            <div className="rounded-lg border border-glass-border bg-elevated/40 p-5 space-y-4">
                <h4 className="font-mono text-[11px] uppercase tracking-wider text-text-secondary flex items-center gap-2">
                    <Type size={13} className="text-primary" />
                    {t("compTitleSection")}
                </h4>
                <CompToggle label={t("compTitleEnabled")} checked={title.enabled !== false} onChange={(v) => setTitle({ ...title, enabled: v })} />
                <input
                    value={title.title_text ?? ""}
                    onChange={(e) => setTitle({ ...title, title_text: e.target.value })}
                    placeholder={t("compTitlePlaceholder")}
                    className={compInputClass}
                />
                <input
                    value={title.ending_text ?? ""}
                    onChange={(e) => setTitle({ ...title, ending_text: e.target.value })}
                    placeholder={t("compEndingPlaceholder")}
                    className={compInputClass}
                />
                <div className="grid grid-cols-2 gap-4">
                    <NumField label={t("compTitleDuration")} value={title.title_duration ?? 3} min={0.5} max={30} step={0.5} onChange={(v) => setTitle({ ...title, title_duration: v })} />
                    <NumField label={t("compEndingDuration")} value={title.ending_duration ?? 3} min={0.5} max={30} step={0.5} onChange={(v) => setTitle({ ...title, ending_duration: v })} />
                </div>
            </div>

            {/* 字幕 */}
            <div className="rounded-lg border border-glass-border bg-elevated/40 p-5 space-y-4">
                <h4 className="font-mono text-[11px] uppercase tracking-wider text-text-secondary flex items-center gap-2">
                    <Subtitles size={13} className="text-primary" />
                    {t("compSubtitleSection")}
                </h4>
                <div className="flex items-center gap-2 text-[11px]">
                    {whisperReady ? (
                        <span className="inline-flex items-center gap-1.5 text-green-400">
                            <Check size={12} />
                            {t("compWhisperReady")}
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1.5 text-amber-400">
                            <AlertTriangle size={12} />
                            {t("compWhisperMissing")}
                        </span>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <CompToggle label={t("compBurnSubtitles")} checked={subtitle.burn_subtitles !== false} onChange={(v) => setSubtitle({ ...subtitle, burn_subtitles: v })} />
                    <CompToggle label={t("compAiCorrect")} checked={subtitle.ai_correct !== false} onChange={(v) => setSubtitle({ ...subtitle, ai_correct: v })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <NumField label={t("compFontSize")} value={subtitle.font_size ?? 16} min={8} max={48} step={1} onChange={(v) => setSubtitle({ ...subtitle, font_size: v })} />
                    <NumField label={t("compMarginV")} value={subtitle.margin_v ?? 40} min={0} max={200} step={5} onChange={(v) => setSubtitle({ ...subtitle, margin_v: v })} />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        onClick={handleGenerateSubtitles}
                        disabled={subtitleBusy || !projectId || !whisperReady}
                        className="inline-flex items-center gap-2 bg-primary text-white border border-[rgba(100,108,255,0.65)] shadow-[inset_0_1.5px_0_rgba(255,255,255,0.14)] hover:bg-[#7a82ff] disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded-md font-semibold text-[12px]"
                    >
                        {subtitleBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                        {subtitleBusy ? t("compGeneratingSubtitles") : t("compGenerateSubtitles")}
                    </button>
                    {subtitle.corrected ? (
                        <span className="text-[11px] text-green-400">{t("compSrtCorrected")}</span>
                    ) : subtitle.srt_content ? (
                        <span className="text-[11px] text-text-secondary">{t("compSrtReady")}</span>
                    ) : null}
                </div>
                {subtitle.srt_content ? (
                    <div className="space-y-2">
                        <textarea
                            value={srtDraft}
                            onChange={(e) => setSrtDraft(e.target.value)}
                            rows={8}
                            className="w-full rounded-md border border-glass-border bg-black/30 px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground/90 outline-none focus:border-primary/60 custom-scrollbar"
                        />
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-[11px] text-text-secondary">{t("compSrtEditHint")}</p>
                            <button
                                onClick={handleSaveSrt}
                                disabled={srtSaving}
                                className="inline-flex items-center gap-1.5 rounded-md border border-glass-border bg-glass px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-hover-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {srtSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                {srtSaving ? t("compSavingSrt") : t("compSaveSrt")}
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>

            {/* 封面 */}
            <div className="rounded-lg border border-glass-border bg-elevated/40 p-5 space-y-4">
                <h4 className="font-mono text-[11px] uppercase tracking-wider text-text-secondary flex items-center gap-2">
                    <ImageIcon size={13} className="text-primary" />
                    {t("compCoverSection")}
                </h4>
                <div className="grid md:grid-cols-[1fr_240px] gap-5">
                    <div className="space-y-4">
                        <CompToggle label={t("compEmbedCover")} checked={cover.embed_on_compose === true} onChange={(v) => setCover({ ...cover, embed_on_compose: v })} />
                        <input
                            value={coverTitle}
                            onChange={(e) => setCoverTitle(e.target.value)}
                            placeholder={t("compCoverTitlePlaceholder")}
                            className={compInputClass}
                        />
                        <input
                            value={coverSubtitle}
                            onChange={(e) => setCoverSubtitle(e.target.value)}
                            placeholder={t("compCoverSubtitlePlaceholder")}
                            className={compInputClass}
                        />
                        <textarea
                            value={posterPrompt}
                            onChange={(e) => setPosterPrompt(e.target.value)}
                            rows={3}
                            placeholder={t("compCoverPromptPlaceholder")}
                            className="w-full rounded-md border border-glass-border bg-glass px-3 py-2 text-[12px] leading-relaxed text-foreground placeholder:text-text-secondary/60 outline-none focus:border-primary/60 custom-scrollbar"
                        />
                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                onClick={handleGeneratePoster}
                                disabled={posterBusy || !projectId}
                                className="inline-flex items-center gap-2 bg-primary text-white border border-[rgba(100,108,255,0.65)] shadow-[inset_0_1.5px_0_rgba(255,255,255,0.14)] hover:bg-[#7a82ff] disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded-md font-semibold text-[12px]"
                            >
                                {posterBusy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
                                {posterBusy ? t("compGeneratingPoster") : t("compGeneratePoster")}
                            </button>
                            <button
                                onClick={handleComposeCover}
                                disabled={composeBusy || !projectId || !cover.poster_image_url}
                                className="inline-flex items-center gap-2 rounded-md border border-glass-border bg-glass px-4 py-2 text-[12px] font-medium text-foreground hover:bg-hover-bg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {composeBusy ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />}
                                {composeBusy ? t("compComposing") : t("compComposeCover")}
                            </button>
                        </div>
                    </div>
                    <div>
                        {previewUrl ? (
                            <div className="space-y-2">
                                <div className="aspect-[3/4] overflow-hidden rounded-lg border border-glass-border bg-black/40">
                                    <img src={getAssetUrl(previewUrl)} alt="cover preview" className="w-full h-full object-cover" />
                                </div>
                                <p className="text-[11px] text-text-secondary text-center">
                                    {cover.final_image_url ? t("compCoverFinal") : t("compCoverPosterOnly")}
                                </p>
                            </div>
                        ) : (
                            <div className="aspect-[3/4] rounded-lg border border-dashed border-glass-border bg-black/20 flex items-center justify-center">
                                <p className="text-[11px] text-text-secondary px-4 text-center">{t("compCoverNone")}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function CompToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <button type="button" onClick={() => onChange(!checked)} className="inline-flex items-center gap-2.5 group">
            <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${checked ? "bg-primary" : "bg-glass-border"}`}>
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
            </span>
            <span className="text-[12px] text-foreground/90 group-hover:text-foreground">{label}</span>
        </button>
    );
}

function NumField({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
    return (
        <label className="block space-y-1.5">
            <span className="block text-[11px] text-text-secondary">{label}</span>
            <input
                type="number"
                value={value}
                min={min}
                max={max}
                step={step}
                onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isNaN(v)) onChange(v);
                }}
                className="w-full rounded-md border border-glass-border bg-glass px-3 py-2 text-[13px] text-foreground outline-none focus:border-primary/60"
            />
        </label>
    );
}
