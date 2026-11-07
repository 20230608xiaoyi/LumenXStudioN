"use client";

import { Canvas } from "@react-three/fiber";
import { Stars, Grid } from "@react-three/drei";
import { motion } from "framer-motion";
import { Suspense } from "react";
import { useSettingsStore } from "@/store/settingsStore";

function Background({ isDark }: { isDark: boolean }) {
    return (
        <>
            <color attach="background" args={[isDark ? "#050508" : "#f0f1f3"]} />
            {isDark && (
                <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
            )}
            <Grid
                infiniteGrid
                fadeDistance={50}
                sectionColor={isDark ? "#646cff" : "#b4b8ff"}
                cellColor={isDark ? "#ffffff" : "#d0d5dd"}
                sectionSize={10}
                cellSize={1}
                sectionThickness={1}
                cellThickness={0.5}
            />
            <ambientLight intensity={isDark ? 0.5 : 0.8} />
            <pointLight position={[10, 10, 10]} />
        </>
    );
}

export default function CreativeCanvas() {
    const theme = useSettingsStore((s) => s.theme);
    const isDark = theme === "dark";

    return (
        <div className="absolute inset-0 z-0 w-full h-full overflow-hidden bg-background">
            <Canvas camera={{ position: [0, 5, 10], fov: 60 }}>
                <Suspense fallback={null}>
                    <Background isDark={isDark} />
                </Suspense>
            </Canvas>

            {/* Overlay gradient for UI readability */}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-background/20 via-transparent to-background/50" />

            {/* Creative Energy Shader Placeholder - implemented via CSS/Canvas mix */}
            <motion.div
                className={`absolute inset-0 pointer-events-none opacity-30 ${isDark ? "mix-blend-screen" : "mix-blend-multiply"}`}
                animate={{
                    background: isDark
                        ? [
                            "radial-gradient(circle at 50% 50%, rgba(100, 108, 255, 0.1) 0%, transparent 50%)",
                            "radial-gradient(circle at 60% 40%, rgba(100, 108, 255, 0.15) 0%, transparent 50%)",
                            "radial-gradient(circle at 40% 60%, rgba(100, 108, 255, 0.1) 0%, transparent 50%)",
                            "radial-gradient(circle at 50% 50%, rgba(100, 108, 255, 0.1) 0%, transparent 50%)"
                        ]
                        : [
                            "radial-gradient(circle at 50% 50%, rgba(100, 108, 255, 0.05) 0%, transparent 50%)",
                            "radial-gradient(circle at 60% 40%, rgba(100, 108, 255, 0.08) 0%, transparent 50%)",
                            "radial-gradient(circle at 40% 60%, rgba(100, 108, 255, 0.05) 0%, transparent 50%)",
                            "radial-gradient(circle at 50% 50%, rgba(100, 108, 255, 0.05) 0%, transparent 50%)"
                        ]
                }}
                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            />
        </div>
    );
}
