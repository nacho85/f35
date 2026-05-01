"use client";

// HeatShimmer: registra una fuente de calor (world position + throttle)
// en heatRegistry para que el HeatShimmerEffect (postprocessing) la refracte.
// Ya no renderiza nada por si mismo — la distorsion la hace el effect global.
// El componente sigue tomando posRef en outerGroup-local (asi no hay que
// cambiar nada en F14/F35); internamente lo convierte a world cada frame.

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3, Quaternion } from "three";
import { registerHeatSource, unregisterHeatSource } from "./heatRegistry";

export function HeatShimmer({ posRef, axisRef, throttleRef }) {
  const grpRef = useRef();
  const worldPos = useMemo(() => new Vector3(), []);
  const worldAxis = useMemo(() => new Vector3(0, 0, 1), []);
  const intensityRef = useRef(0);
  const _tmpQ = useMemo(() => new Quaternion(), []);

  useEffect(() => {
    const src = {
      posRef:  { current: worldPos },
      axisRef: { current: worldAxis },
      throttleRef: intensityRef,
    };
    registerHeatSource(src);
    return () => unregisterHeatSource(src);
  }, [worldPos, worldAxis]);

  useFrame(() => {
    if (!grpRef.current) return;
    if (posRef.current) {
      grpRef.current.position.copy(posRef.current);
      if (axisRef && axisRef.current) {
        grpRef.current.position.addScaledVector(axisRef.current, 0.8);
      }
    }
    grpRef.current.updateWorldMatrix(true, false);
    grpRef.current.getWorldPosition(worldPos);

    // axisRef esta en outerGroup-local; convertimos a world aplicando solo
    // la rotacion del padre (no posicion) para mantener un vector unitario.
    if (axisRef && axisRef.current && grpRef.current.parent) {
      worldAxis.copy(axisRef.current);
      grpRef.current.parent.getWorldQuaternion(_tmpQ);
      worldAxis.applyQuaternion(_tmpQ);
      worldAxis.normalize();
    }

    // Rise rapido a partir de throttle bajo, sin caer en AB. Floor minimo
    // para que siempre haya un poco de shimmer cuando el motor esta corriendo.
    const t = throttleRef.current ?? 0;
    const rise = Math.max(0, Math.min(1, (t - 0.05) / 0.15));
    intensityRef.current = rise;
  });

  return <group ref={grpRef} />;
}
