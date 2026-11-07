"use client";

import { motion } from "framer-motion";
import { Calendar, Trash2, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Project } from "@/store/projectStore";
import { useSettingsStore } from "@/store/settingsStore";

interface ProjectCardProps {
    project: Project;
    onDelete: (id: string) => void;
}

export default function ProjectCard({ project, onDelete }: ProjectCardProps) {
    const router = useRouter();
    const t = useTranslations("project");
    const tc = useTranslations("common");
    const locale = useSettingsStore((s) => s.locale);

    const handleOpen = () => {
        window.location.hash = `#/project/${project.id}`;
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm(t("confirmDelete", { title: project.title }))) {
            onDelete(project.id);
        }
    };

    const statusColors = {
        pending: "bg-gray-500/20 text-text-secondary",
        processing: "bg-yellow-500/20 text-yellow-400",
        completed: "bg-green-500/20 text-green-400",
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.02 }}
            className="glass-panel p-6 rounded-xl cursor-pointer group relative border-l-2 border-l-glass-border"
            onClick={handleOpen}
        >
            <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                    <h3 className="text-lg font-display font-bold text-foreground mb-2">
                        {project.title}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-text-secondary">
                        <Calendar size={12} />
                        <span>{Number.isFinite(project.created_at) ? new Date(project.created_at * 1000).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US') : '—'}</span>
                    </div>
                </div>

                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={handleDelete}
                        className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>

            <div className="flex items-center gap-3 text-xs text-text-secondary mb-4">
                <span>{t("characterLabel")} <span className="text-foreground font-medium">{project.characters?.length || 0}</span></span>
                <span className="text-text-muted">·</span>
                <span>{t("sceneLabel")} <span className="text-foreground font-medium">{project.scenes?.length || 0}</span></span>
                <span className="text-text-muted">·</span>
                <span>{t("frameLabel")} <span className="text-foreground font-medium">{project.frames?.length || 0}</span></span>
            </div>

            <div className="flex items-center justify-between">
                <span className={`text-xs px-2 py-1 rounded ${statusColors[project.status as keyof typeof statusColors] || statusColors.pending}`}>
                    {project.status || t("pending")}
                </span>

                <div className="flex items-center gap-1 text-primary text-xs font-medium">
                    <Play size={14} />
                    <span>{t("openProject")}</span>
                </div>
            </div>
        </motion.div>
    );
}
