"use client";

import { MotionConfig } from "motion/react";

/**
 * Configuración común de Motion: respeta prefers-reduced-motion (los resortes
 * pasan a ser instantáneos) y usa un resorte suave por defecto.
 */
export function MotionRoot({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.8 }}>
      {children}
    </MotionConfig>
  );
}
