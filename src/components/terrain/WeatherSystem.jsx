"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Environment, Cloud, Clouds } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";

// Altura de escala atmosférica (m). 5km = balance entre bruma visible al
// nivel del mar y crisp a altura. Con 10km a baja altura quemaba el
// horizonte en blanco; con 3km a 8km de altura desaparecía.
const FOG_SCALE_HEIGHT = 12000;

// Hora del día → vector dirección hacia el sol (solo para la directional light;
// el cielo HDRI es estático y tiene su propio sol bakeado).
function computeSunDir(hour) {
  const dp = (hour - 6) / 12;
  if (dp < 0 || dp > 1) {
    return new THREE.Vector3(0, -0.3, 0.3).normalize();
  }
  const az = Math.PI / 2 + dp * Math.PI;
  const elev = Math.sin(dp * Math.PI) * (Math.PI / 2 - 0.18);
  return new THREE.Vector3(
    Math.sin(az) * Math.cos(elev),
    Math.sin(elev),
    -Math.cos(az) * Math.cos(elev)
  );
}

// Presets — cada uno mapea a un HDRI de Polyhaven (CC0).
// Los HDRIs ya traen sol + ambient + nubes bakeados, así que la directional
// y ambient quedan en niveles modestos solo para shadows y para iluminar
// materiales no-PBR del terreno y modelos.
//
// fogColor matcheado al horizonte de cada HDRI para que el terreno lejano
// se funda con el cielo.
const PRESETS = {
  clear: {
    // 0.000005 = bruma muy sutil — solo se nota a cientos de km al
    // horizonte. Foreground crystal hasta 100km+. Aerial perspective tipo
    // WT donde montañas distantes se desaturan en tono azul-grisaceo.
    // ~5% a 50km, ~22% a 100km, ~63% a 200km, ~95% a 300km.
    file: "/textures/sky/qwantani_4k.hdr",
    fogDensity: 0.000012, fogColor: "#6488a8",
    sunMultiplier: 1.0, ambientBase: 0.30,
    horizonTint: "#7eb6e8",
    clouds: null,
  },
  scattered: {
    file: "/textures/sky/kloofendal_4k.hdr",
    fogDensity: 0.000008, fogColor: "#c8d8e8",
    sunMultiplier: 0.85, ambientBase: 0.45,
    horizonTint: "#a8c8e0",
    // Cumulus dispersos a base ~1500m, dispersos en 30km alrededor del player.
    clouds: {
      altitude: 1800, bounds: [30000, 600, 30000],
      segments: 40, volume: 28,
      color: "#ffffff", opacity: 0.85, growth: 4, speed: 0.12,
      seed: 42,
    },
  },
  overcast: {
    file: "/textures/sky/kloppenheim_4k.hdr",
    fogDensity: 0.00003, fogColor: "#9faab5",
    sunMultiplier: 0.18, ambientBase: 1.10,
    horizonTint: "#a0acb8",
    // Techo bajo denso ~1000m, capa amplia.
    clouds: {
      altitude: 1100, bounds: [50000, 400, 50000],
      segments: 70, volume: 90,
      color: "#c8ccd2", opacity: 0.95, growth: 3, speed: 0.18,
      seed: 17,
    },
  },
  storm: {
    file: "/textures/sky/storm_4k.hdr",
    fogDensity: 0.00008, fogColor: "#4a5258",
    sunMultiplier: 0.05, ambientBase: 0.60,
    horizonTint: "#525860",
    // Cumulonimbus muy bajos y oscuros, movimiento rápido.
    clouds: {
      altitude: 700, bounds: [40000, 800, 40000],
      segments: 80, volume: 120,
      color: "#3a4248", opacity: 1.0, growth: 6, speed: 0.55,
      seed: 7,
    },
  },
};

// Ajusta scene.fog.density según la altura de la cámara — modelo de
// atmósfera con scale height de ~3km. Crítico para vistas desde altura:
// sin esto, 17km de altitude + 200km de distancia horizontal acumulan fog
// como si fuera todo aire denso al nivel del mar → terreno lejano blanco
// total. Con altura, density colapsa exponencialmente y el horizonte
// distante se ve nítido.
function FogAltitudeAdjuster({ baseDensity }) {
  const { scene, camera } = useThree();
  useFrame(() => {
    if (!scene.fog) return;
    const altitudeFactor = Math.exp(-Math.max(0, camera.position.y) / FOG_SCALE_HEIGHT);
    scene.fog.density = baseDensity * altitudeFactor;
  });
  return null;
}

// Capa volumétrica de nubes que sigue al jugador horizontalmente — el HDRI
// es la esfera infinita de fondo (estática), estas nubes son finitas y a
// altitud real, así que generan parallax correcto cuando el avión se mueve.
// El group se reposiciona cada frame para que el jugador siempre esté dentro
// del volumen sin tener que generar nubes en todo el mapa.
function CloudLayer({ config }) {
  const groupRef = useRef();
  useFrame(({ camera }) => {
    if (!groupRef.current) return;
    groupRef.current.position.x = camera.position.x;
    groupRef.current.position.z = camera.position.z;
  });
  if (!config) return null;
  return (
    <group ref={groupRef}>
      {/* MeshLambertMaterial → las nubes responden a directional + ambient,
          así en storm/overcast quedan oscuras automáticamente. */}
      <Clouds material={THREE.MeshLambertMaterial} limit={400}>
        <Cloud
          seed={config.seed}
          segments={config.segments}
          bounds={config.bounds}
          volume={config.volume}
          color={config.color}
          opacity={config.opacity}
          growth={config.growth}
          speed={config.speed}
          position={[0, config.altitude, 0]}
        />
      </Clouds>
    </group>
  );
}

// Color cálido al amanecer/atardecer, blanco al mediodía.
function sunColorForHour(hour) {
  const dp = (hour - 6) / 12;
  if (dp < 0 || dp > 1) return "#1a2540";
  const intensity = Math.sin(dp * Math.PI);
  if (intensity > 0.7) return "#fff5e8";
  if (intensity > 0.4) return "#ffe4b5";
  if (intensity > 0.15) return "#ff9d5a";
  return "#ff5828";
}

export default function WeatherSystem({ hour = 14, weather = "clear" }) {
  const sunDir = useMemo(() => computeSunDir(hour), [hour]);
  const preset = PRESETS[weather] ?? PRESETS.clear;

  const dp = (hour - 6) / 12;
  const dayIntensity = (dp < 0 || dp > 1) ? 0 : Math.sin(dp * Math.PI);
  const isNight = hour < 6 || hour > 18.5;

  const sunPos = sunDir.clone().multiplyScalar(80000);
  const sunIntensity = 2.5 * dayIntensity * preset.sunMultiplier;
  const ambientIntensity = preset.ambientBase * 2 * (isNight ? 0.08 : (0.2 + 0.8 * dayIntensity));
  const sunColor = sunColorForHour(hour);

  return (
    <>
      {/* HDRI: scene.background + scene.environment (IBL para PBR).
          Sin key — el remount causaba shader cascade errors al cambiar
          weather. drei detecta el cambio de `files` y reload internamente. */}
      <Environment
        files={preset.file}
        background
        backgroundBlurriness={0}
      />

      {/* Fog atmosférico activado para terreno. El water shader usa aerial
          perspective propio (HDRI per-direction) y tiene fog:false para no
          superponer ambos efectos. El FogAltitudeAdjuster ajusta densidad
          según altura — atmósfera real, más denso a baja altitude. */}
      <fogExp2 attach="fog" args={[preset.fogColor, preset.fogDensity]} />
      <FogAltitudeAdjuster baseDensity={preset.fogDensity} />

      {/* Directional = sol para shadows y modelado direccional sobre el
          terreno. Sin castShadow porque el shadow.camera default no cubre
          las distancias del mapa (175km). */}
      <directionalLight
        position={sunPos.toArray()}
        intensity={sunIntensity}
        color={sunColor}
      />

      {/* Ambient — más fuerte en overcast (rebote difuso de las nubes) */}
      <ambientLight
        intensity={ambientIntensity}
        color={isNight ? "#3a4658" : "#dde6f0"}
      />

      {/* Hemisphere — extra fill cielo↔suelo. Sky color matchea el tinte
          del horizonte del HDRI para que materiales lambert no-PBR se vean
          coherentes con el fondo. */}
      <hemisphereLight
        args={[
          isNight ? "#0a1530" : preset.horizonTint,
          "#8b7355",
          0.4 + 0.6 * (1 - dayIntensity * 0.5),
        ]}
      />

      <CloudLayer config={preset.clouds} />
    </>
  );
}
