import * as THREE from "three";

// ─── Constantes de animacion ────────────────────────────────────────────
// Wing sweep — rango real F-14: 20° extendidas → 68° recogidas = 48° totales.
export const SWEEP_MAX = THREE.MathUtils.degToRad(48);

// Tail hook — rotación X; punta baja ~45°. Lerp por frame para animación suave.
export const HOOK_DOWN_ANGLE = -0.8;
export const HOOK_LERP       = 0.08;

// Canopy — bisagra en front-top bbox world, rotación X negativa abre hacia atras.
// Al abrirse tambien corre la capota en -Z y baja un poco en Y para que no quede
// colgando sobre el interior. Todos los efectos comparten el mismo factor T in
// [0..1] lerp-eado por frame.
export const CANOPY_OPEN_ANGLE  = -0.55;
export const CANOPY_SLIDE_BACK  = -0.5;   // world units Z al abrirse
export const CANOPY_DROP_Y      = -0.17;  // world units Y al abrirse
export const CANOPY_LERP        = 0.035;

// Spoilers — apertura maxima al deploy=1
export const SPOILER_OPEN_ANGLE = THREE.MathUtils.degToRad(-60);

// ─── Materiales especiales ──────────────────────────────────────────────
// Overlay shader: pinta el hook con las tres bandas de la bandera de Irán
// (verde arriba, blanco medio, rojo abajo). El vertex shader recibe un atributo
// precomputado `hookT ∈ [0..1]` que mapea la posición de cada vértice a lo largo
// del eje del hook (0 = pivote / raíz, 1 = punta).
export function createIranHookOverlayMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: { uOpacity: { value: 0.45 } },
    vertexShader: `
      attribute float hookT;
      varying float vT;
      void main() {
        vT = hookT;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying float vT;
      void main() {
        vec3 col;
        if      (vT < 0.3333) col = vec3(0.08, 0.42, 0.16);  // verde
        else if (vT < 0.6667) col = vec3(1.0,  1.0,  1.0 );  // blanco
        else                  col = vec3(0.60, 0.0,  0.0 );  // rojo
        gl_FragColor = vec4(col, uOpacity);
      }
    `,
  });
}

// ─── Bisagras del tren de aterrizaje ────────────────────────────────────
// HINGE_DEFS: 19 bisagras con target(s), bbox para defaults, edge selector
// y/o `points` explicitos (override). axisLock fuerza el eje de rotacion
// (x/y/z), nestUnder anida bajo otra bisagra para heredar su rotacion.
export const HINGE_DEFS = [
  { idx: 1, target: "group_NoseGearBayDoor_L",     bbox: "group_NoseGearBayDoor_L",     edge: "xMaxYMaxZ",
    points: [[0.31437, -0.45784, 6.89309], [0.37625, -0.44956, 8.28852]] },
  { idx: 2, target: "group_NoseGearBayDoor_R",     bbox: "group_NoseGearBayDoor_R",     edge: "xMinYMaxZ",
    points: [[-0.34050, -0.46158, 6.87390], [-0.37567, -0.44845, 8.28854]] },
  { idx: 3, target: "group_NoseGearBayDoor_RearL", bbox: "group_NoseGearBayDoor_RearL", edge: "xMaxYMaxZ",
    points: [[0.23127, -0.45133, 6.37384], [0.28089, -0.46198, 6.67019]] },
  { idx: 4, target: "group_NoseGearBayDoor_RearR", bbox: "group_NoseGearBayDoor_RearR", edge: "xMinYMaxZ",
    points: [[-0.28147, -0.46219, 6.67008], [-0.23158, -0.45086, 6.37381]] },
  { idx: 5, target: ["group_NoseGearStrut", "group_NoseGearWheel"], bbox: "group_NoseGearStrutRear", edge: "zMaxYMaxX" },
  { idx: 6, target: "group_NoseGearStrutRear",     bbox: "group_NoseGearStrutRear",     edge: "zMinYMaxX",
    points: [[-0.01775, -0.39040, 4.96477], [0.02716, -0.39272, 4.93267]], axisLock: "x" },
  { idx: 7, target: "group_MainGearStrut_L",
    bbox: "group_MainGearStrut_L", edge: "innerTopZ_L", axisLock: "x",
    points: [[1.72729, 0.31864, -0.66255], [2.25855, 0.35912, -0.65305]] },
  { idx: 8, target: "group_MainGearStrut_R",
    bbox: "group_MainGearStrut_R", edge: "innerTopZ_R", axisLock: "x",
    points: [[-1.72729, 0.31864, -0.66255], [-2.17510, 0.34044, -0.66404]] },
  { idx: 9,  target: "group_MainGearBayDoor_FrontL", bbox: "group_MainGearBayDoor_FrontL", edge: "innerZ_L", axisLock: "z",
    points: [[2.61522, 0.47922, 1.89481], [2.61460, 0.44106, 1.23680]] },
  { idx: 10, target: "group_MainGearBayDoor_FrontR", bbox: "group_MainGearBayDoor_FrontR", edge: "innerZ_R", axisLock: "z",
    points: [[-2.61842, 0.48253, 1.89468], [-2.61502, 0.43413, 1.20494]] },
  { idx: 11, target: "group_MainGearBayDoor_RearL",  bbox: "group_MainGearBayDoor_RearL",  edge: "innerZ_L", axisLock: "z",
    points: [[2.24401, 0.39319, -0.51372], [2.17418, 0.37055, 0.80575]] },
  { idx: 12, target: "group_MainGearBayDoor_RearR",  bbox: "group_MainGearBayDoor_RearR",  edge: "innerZ_R", axisLock: "z",
    points: [[-2.17542, 0.37091, 0.77260], [-2.24372, 0.39324, -0.54694]] },
  { idx: 13, target: "group_NoseGearLaunchBar", bbox: "group_NoseGearLaunchBar", edge: "xMaxYMaxZ", axisLock: "x", nestUnder: 5,
    points: [[0.09848, 0.00068, 7.38754], [-0.09848, -0.00068, 7.38754]] },
  { idx: 14, target: ["group_MainGearStrutRot_L", "group_MainGearWheel_L"],
    bbox: "group_MainGearWheel_L", edge: "xMaxYMaxZ", axisLock: "z", nestUnder: 7,
    points: [[2.06984, 0.22405, -0.79966], [2.00856, 0.28411, 1.65837]] },
  { idx: 15, target: ["group_MainGearStrutRot_R", "group_MainGearWheel_R"],
    bbox: "group_MainGearWheel_R", edge: "xMinYMaxZ", axisLock: "z", nestUnder: 8,
    points: [[-2.06599, 0.22479, -0.81218], [-2.00734, 0.28911, 1.65840]] },
  { idx: 16, target: "group_MainGearStrutRotTop2_L",
    bbox: "group_MainGearStrutRotTop2_L", edge: "xMaxYMaxZ", nestUnder: 14,
    points: [[1.87898, 0.34529, 0.51867], [2.01578, 0.10297, 0.51422]] },
  { idx: 17, target: "group_MainGearStrutRotTop1_L",
    bbox: "group_MainGearStrutRotTop1_L", edge: "xMaxYMaxZ", nestUnder: 16,
    points: [[1.93752, 0.30268, -0.24945], [2.07660, 0.07718, -0.24191]] },
  { idx: 18, target: "group_MainGearStrutRotTop2_R",
    bbox: "group_MainGearStrutRotTop2_R", edge: "xMinYMaxZ", nestUnder: 15,
    points: [[-1.87866, 0.34517, 0.52063], [-2.02210, 0.10444, 0.51802]] },
  { idx: 19, target: "group_MainGearStrutRotTop1_R",
    bbox: "group_MainGearStrutRotTop1_R", edge: "xMinYMaxZ", nestUnder: 18,
    points: [[-1.93681, 0.30224, -0.24913], [-2.08458, 0.07901, -0.24853]] },
];

export const DEFAULT_HINGES = HINGE_DEFS.map(() => ({ x: 0, y: 0, z: 0, angle: 0 }));

// edgeEndpoints: dado un bbox y un selector simbolico, devuelve dos puntos
// que definen la linea de la bisagra (en world coords del bbox).
export function edgeEndpoints(bb, edge) {
  const mid = (a, b) => (a + b) * 0.5;
  switch (edge) {
    case "xMaxYMaxZ":   return [new THREE.Vector3(bb.max.x, bb.max.y, bb.min.z), new THREE.Vector3(bb.max.x, bb.max.y, bb.max.z)];
    case "xMinYMaxZ":   return [new THREE.Vector3(bb.min.x, bb.max.y, bb.min.z), new THREE.Vector3(bb.min.x, bb.max.y, bb.max.z)];
    case "zMaxYMaxX":   return [new THREE.Vector3(bb.min.x, bb.max.y, bb.max.z), new THREE.Vector3(bb.max.x, bb.max.y, bb.max.z)];
    case "zMinYMaxX":   return [new THREE.Vector3(bb.min.x, bb.max.y, bb.min.z), new THREE.Vector3(bb.max.x, bb.max.y, bb.min.z)];
    case "innerTopZ_L": return [new THREE.Vector3(bb.min.x + 0.05, bb.max.y - 0.05, bb.min.z), new THREE.Vector3(bb.min.x + 0.05, bb.max.y - 0.05, bb.max.z)];
    case "innerTopZ_R": return [new THREE.Vector3(bb.max.x - 0.05, bb.max.y - 0.05, bb.min.z), new THREE.Vector3(bb.max.x - 0.05, bb.max.y - 0.05, bb.max.z)];
    case "innerZ_L":    return [new THREE.Vector3(bb.min.x, mid(bb.min.y, bb.max.y), bb.min.z), new THREE.Vector3(bb.min.x, mid(bb.min.y, bb.max.y), bb.max.z)];
    case "innerZ_R":    return [new THREE.Vector3(bb.max.x, mid(bb.min.y, bb.max.y), bb.min.z), new THREE.Vector3(bb.max.x, mid(bb.min.y, bb.max.y), bb.max.z)];
    default:            return [new THREE.Vector3(mid(bb.min.x, bb.max.x), bb.max.y, bb.min.z), new THREE.Vector3(mid(bb.min.x, bb.max.x), bb.max.y, bb.max.z)];
  }
}

// ─── Spoilers ───────────────────────────────────────────────────────────
// Bisagras MARCADAS A MANO en world coords. Se attachean al wing
// correspondiente (siguen el sweep). rotation.x del inner = deploy * SPOILER_OPEN_ANGLE.
// `initialPoints` opcional: coords que marcan la pose inicial del spoiler,
// para tunear el offset de rotacion.
// Flaps: mismo patron que spoilers — bisagras a mano + attached al wing.
export const FLAP_DEFS = [
  { side: "L", target: "group_Flap_L", wingGroup: "group_Wing_L",
    points: [[8.21262, 0.57685, -2.17452], [4.43858, 0.63780, -1.62931]] },
  { side: "R", target: "group_Flap_R", wingGroup: "group_Wing_R",
    points: [[-4.43857, 0.63675, -1.62939], [-8.21268, 0.57676, -2.17412]] },
];

// Slats: leading edge surfaces. F-14 real ~17° down full deploy.
export const SLAT_DEFS = [
  { side: "L", target: "group_Slat_L", wingGroup: "group_Wing_L",
    points: [[8.61618, 0.56344, -1.53576], [4.38785, 0.64593, -0.15592]] },
  { side: "R", target: "group_Slat_R", wingGroup: "group_Wing_R",
    points: [[-8.61618, 0.56344, -1.53576], [-4.38785, 0.64593, -0.15592]] },
];

// Rudders: en VStab (fijo al fuselaje, no sweep). Attachados a scene root.
// F-14 real: deflexion ~30°. `topAnchor` opcional: si esta, el eje de rotacion
// va de bottom_mid → topAnchor (el top queda fijo sobre el eje).
// Vacio: axle autodetectado del mesh (PCA del bbox local de g).
export const WHEEL_AXLES = {};

// Nozzles: taper en world coords. frontCenter/rearCenter definen el eje real
// de la tobera (3D, puede tener tilt). El frente queda fijo, el fondo escala
// radialmente alrededor del eje. deploy=0 cerrado, deploy=1 abierto.
export const NOZZLE_DEFS = [
  { side: "L", target: "group_Nozzle_L" },
  { side: "R", target: "group_Nozzle_R" },
];
export const NOZZLE_OPEN_SCALE = 1 / 0.6;  // closedFactor = 60% del radio en idle

// HStabs (stabilators): all-moving, pitch ±20° aprox.
export const HSTAB_DEFS = [
  { side: "L", target: "group_HStab_L",
    points: [[2.15537, 0.07880, -5.39825], [2.28925, 0.09944, -5.40650]] },
  { side: "R", target: "group_HStab_R",
    points: [[-2.28907, 0.07695, -5.40892], [-2.15534, 0.06133, -5.40185]] },
];

export const RUDDER_DEFS = [
  { side: "L", target: "group_Rudder_L",
    points: [[1.36565, 0.63495, -5.94272], [1.36980, 0.81108, -6.00120]],
    topAnchor: [1.63459, 2.87853, -7.09851] },
  { side: "R", target: "group_Rudder_R",
    points: [[-1.51379, 0.85358, -6.01053], [-1.52728, 0.70588, -5.95194]],
    topAnchor: [-1.63121, 2.87815, -7.09781] },
];

// invertDeploy: si true, multiplica el target por (1 - deploy) en vez de deploy.
// L viene OPEN en el modelo, asi que al invertir queda cerrado en deploy=0
// y aplica todo el target en deploy=1 → matches R.
export const SPOILER_DEFS = [
  { side: "L", target: "group_Spoiler_L", wingGroup: "group_Wing_L",
    points: [[2.39314, 0.602, -0.927], [8.20843, 0.51503, -1.95972]],
    invertDeploy: true },
  { side: "R", target: "group_Spoiler_R", wingGroup: "group_Wing_R",
    points: [[-2.39375, 0.56869, -0.94033], [-8.20883, 0.51441, -1.95692]] },
];

// ─── Paleta de colores debug ────────────────────────────────────────────
// Paleta canonical para v6. Tambien usada por la UI de debug (chips por grupo).
export const GROUP_COLORS = {
  // Airframe fijo
  NoseCone:          "#3b82f6",
  CockpitFrame:      "#60a5fa",
  CockpitInterior:   "#14b8a6",
  Fuselage_Fwd:      "#a8b0bc",
  Fuselage_Center:   "#94a3b8",
  Fuselage_Aft:      "#6b7280",
  Glove_L:           "#8b5cf6",
  Glove_R:           "#a855f7",
  Nacelle_L:         "#eab308",
  Nacelle_R:         "#f59e0b",

  // Alas moviles
  Wing_L:            "#22c55e",
  Wing_R:            "#84cc16",

  // Cola
  VStab_L:           "#a855f7",
  VStab_R:           "#d946ef",
  Rudder_L:          "#c084fc",
  Rudder_R:          "#e879f9",
  HStab_L:           "#ec4899",
  HStab_R:           "#f43f5e",

  // Superficies de control
  Flap_L:            "#4ade80",
  Flap_R:            "#65a30d",
  Slat_L:            "#86efac",
  Slat_R:            "#bef264",
  Spoiler_L:         "#16a34a",
  Spoiler_R:         "#a3e635",

  // Canopy
  Canopy:            "#06b6d4",

  // Tren de aterrizaje
  NoseGear:          "#ef4444",
  NoseGearStrut:     "#ef4444",
  NoseGearWheel:     "#1f2937",
  NoseGearBayDoor_L: "#dc2626",
  NoseGearBayDoor_R: "#b91c1c",
  NoseGearDragBraceFrontL:      "#06b6d4",
  NoseGearDragBraceFrontR:      "#0891b2",
  NoseGearDragBraceFrontU:      "#67e8f9",
  NoseGearDragBraceRearL:       "#f59e0b",
  NoseGearDragBraceRearR:       "#d97706",
  NoseGearDragBraceRearU:       "#fbbf24",
  NoseGearDragBraceRearAnchorL: "#22c55e",
  NoseGearDragBraceRearAnchorR: "#16a34a",
  MainGear_L:        "#dc2626",
  MainGear_R:        "#b91c1c",
  MainGearStrut_L:   "#dc2626",
  MainGearStrut_R:   "#b91c1c",
  MainGearWheel_L:   "#fca5a5",
  MainGearWheel_R:   "#fb7185",
  MainGearBayDoor_L: "#991b1b",
  MainGearBayDoor_R: "#7f1d1d",

  // Misc mecanico
  TailHook:          "#fb923c",
  RefuelProbe:       "#fbbf24",
  Nozzle_L:          "#fed7aa",
  Nozzle_R:          "#fdba74",
  AirbrakeUpper:     "#f97316",
  AirbrakeLower:     "#ea580c",

  // Stores
  Pylon_L:           "#78716c",
  Pylon_R:           "#57534e",
  FuelTank_L:        "#a8a29e",
  FuelTank_R:        "#d6d3d1",
  Missile_L:         "#f43f5e",
  Missile_R:         "#e11d48",

  // Fallback
  Unlabeled:         "#6b7280",
};

export function groupOfName(name) {
  const i = name.indexOf("__");
  return i < 0 ? "Fuselage" : name.slice(0, i);
}

// Color jitter por nombre (FNV-1a hash) para que partes del mismo grupo
// no queden todas pintadas exactamente igual al pintar por grupo.
export function jitteredGroupColor(group, name) {
  const base = new THREE.Color(GROUP_COLORS[group] || "#888888");
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = (h * 16777619) >>> 0; }
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  const delta = (((h % 1000) / 1000) - 0.5) * 0.16;
  return new THREE.Color().setHSL(hsl.h, hsl.s, Math.max(0.25, Math.min(0.75, hsl.l + delta)));
}
