// Canonical group names for F-14 rigging.
// Use these as material names in Blender with the "grp:" prefix, e.g. "grp:NoseCone".
// The rig-f14-labeled.mjs script reads those materials and parents primitives
// under matching group nodes in the output GLB.

export const F14_GROUPS = {
  // --- Airframe (fixed structure) ---
  NoseCone:         { essential: true,  note: "Radomo / cono de la nariz (fijo)" },
  CockpitFrame:     { essential: false, note: "Marco del cockpit que NO sale con el canopy" },
  CockpitInterior:  { essential: false, note: "Asientos, instrumentos, todo lo de adentro" },
  Fuselage_Fwd:     { essential: false, note: "Fuselaje delantero (entre nose y cockpit)" },
  Fuselage_Center:  { essential: true,  note: "Fuselaje central (entre glove y cola)" },
  Fuselage_Aft:     { essential: false, note: "Fuselaje trasero (lo de atras de los motores)" },
  Glove_L:          { essential: true,  note: "Parte fija del ala en la raiz (donde pivotea la variable geometry)" },
  Glove_R:          { essential: true,  note: "Idem derecho" },
  Nacelle_L:        { essential: true,  note: "Conducto/carcasa del motor izquierdo (fijo)" },
  Nacelle_R:        { essential: true,  note: "Idem derecho" },

  // --- Moving wings (F-14 variable geometry) ---
  Wing_L:           { essential: true,  note: "Ala izquierda MOVIL (pivotea sweep forward/back)" },
  Wing_R:           { essential: true,  note: "Idem derecha" },

  // --- Tail assembly ---
  VStab_L:          { essential: true,  note: "Estabilizador vertical izquierdo (fijo - el F-14 tiene DOS)" },
  VStab_R:          { essential: true,  note: "Estabilizador vertical derecho" },
  Rudder_L:         { essential: false, note: "Timon de direccion izquierdo (bisagra vertical, si lo separan)" },
  Rudder_R:         { essential: false, note: "Idem derecho" },
  HStab_L:          { essential: true,  note: "Taileron / stab horizontal izquierdo (pivotea para pitch+roll)" },
  HStab_R:          { essential: true,  note: "Idem derecho" },

  // --- Control surfaces on wings ---
  Flap_L:           { essential: false, note: "Flap de borde de fuga izquierdo (si esta separado)" },
  Flap_R:           { essential: false, note: "Idem derecho" },
  Slat_L:           { essential: false, note: "Slat de borde de ataque izquierdo" },
  Slat_R:           { essential: false, note: "Idem derecho" },
  Spoiler_L:        { essential: false, note: "Spoiler izquierdo (sobre el ala, arriba)" },
  Spoiler_R:        { essential: false, note: "Idem derecho" },

  // --- Canopy ---
  Canopy:           { essential: true,  note: "Cubierta de vidrio que se abre hacia atras" },

  // --- Landing gear (nose) ---
  NoseGearBayDoor_L:{ essential: false, note: "Puerta izquierda del pozo de la pata de nariz" },
  NoseGearBayDoor_R:{ essential: false, note: "Idem derecha" },
  NoseGearBayDoor_RearL:{ essential: false, note: "Compuerta chica trasera izquierda del pozo de nariz" },
  NoseGearBayDoor_RearR:{ essential: false, note: "Idem derecha" },
  NoseGearStrut:    { essential: true,  note: "Pata/brazo de la tren de nariz (se retrae hacia atras)" },
  NoseGearStrutRear:{ essential: false, note: "Brazo trasero del strut (frena a cierto angulo mientras el strut principal sigue rotando para que la rueda quede 90 al piso)" },
  NoseGearLaunchBar:{ essential: false, note: "Launch bar (barra de catapulta) en el strut delantero. Baja para engancharse a la catapulta del portaaviones" },
  NoseGearWheel:    { essential: false, note: "Rueda de nariz (puede girar libre)" },
  NoseGearDragBraceFrontL:      { essential: false, note: "Drag brace delantero izq (viaja con el strut)" },
  NoseGearDragBraceFrontR:      { essential: false, note: "Drag brace delantero der" },
  NoseGearDragBraceFrontU:      { essential: false, note: "Drag brace delantero superior/central" },
  NoseGearDragBraceRearL:       { essential: false, note: "Drag brace trasero izq (pivotea en anchor del fuselaje)" },
  NoseGearDragBraceRearR:       { essential: false, note: "Drag brace trasero der" },
  NoseGearDragBraceRearU:       { essential: false, note: "Drag brace trasero superior/central" },
  NoseGearDragBraceRearAnchorL: { essential: false, note: "Anchor fijo al fuselaje (izq)" },
  NoseGearDragBraceRearAnchorR: { essential: false, note: "Anchor fijo al fuselaje (der)" },

  // --- Landing gear (main) ---
  MainGearBayDoor_L:{ essential: false, note: "Puertas del pozo del tren principal izquierdo (legacy, sin split)" },
  MainGearBayDoor_R:{ essential: false, note: "Idem derecho" },
  MainGearBayDoor_FrontL:{ essential: false, note: "Compuerta delantera izq del pozo del tren principal" },
  MainGearBayDoor_FrontR:{ essential: false, note: "Idem derecha" },
  MainGearBayDoor_RearL: { essential: false, note: "Compuerta trasera izq del pozo del tren principal" },
  MainGearBayDoor_RearR: { essential: false, note: "Idem derecha" },
  MainGearStrut_L:  { essential: true,  note: "Pata FIJA del tren principal izquierdo (no rota)" },
  MainGearStrut_R:  { essential: true,  note: "Idem derecho" },
  MainGearStrutRot_L: { essential: true, note: "Parte que ROTA del tren principal izq (strut rotor + rueda integrada)" },
  MainGearStrutRot_R: { essential: true, note: "Idem derecho" },
  MainGearStrutRotTop1_L: { essential: false, note: "Top 1 del rotor del main gear izq (rota con el pitch del strut)" },
  MainGearStrutRotTop2_L: { essential: false, note: "Top 2 del rotor del main gear izq" },
  MainGearStrutRotTop1_R: { essential: false, note: "Idem derecho" },
  MainGearStrutRotTop2_R: { essential: false, note: "Idem derecho" },
  MainGearWheel_L:  { essential: false, note: "Rueda principal izquierda" },
  MainGearWheel_R:  { essential: false, note: "Idem derecha" },

  // --- Misc mechanical ---
  TailHook:         { essential: true,  note: "Gancho de apontaje (extiende hacia abajo)" },
  RefuelProbe:      { essential: false, note: "Sonda de reabastecimiento en vuelo (lado derecho del fuselaje, cerca de la nariz, retractil)" },
  Nozzle_L:         { essential: false, note: "Tobera/exhaust del motor izquierdo" },
  Nozzle_R:         { essential: false, note: "Idem derecho" },
  AirbrakeUpper:    { essential: false, note: "Aerofreno superior del fuselaje, si esta" },
  AirbrakeLower:    { essential: false, note: "Aerofreno inferior del fuselaje" },

  // --- External stores (si los hay en el modelo) ---
  Pylon_L:          { essential: false, note: "Pilon de armas izquierdo (si hay uno, sino Pylon_L_1, _2, ...)" },
  Pylon_R:          { essential: false, note: "Idem derecho" },
  FuelTank_L:       { essential: false, note: "Tanque externo izquierdo" },
  FuelTank_R:       { essential: false, note: "Idem derecho" },
  Missile_L:        { essential: false, note: "Misil izquierdo generico (podes numerar Missile_L_1, _2...)" },
  Missile_R:        { essential: false, note: "Idem derecho" },

  // --- Fallbacks ---
  Unlabeled:        { essential: false, note: "Todo lo que NO pintaste. Mi script lo deja aca si no fallback-ea espacialmente." },
};

// List form for iteration in UI / validation.
export const F14_GROUP_NAMES = Object.keys(F14_GROUPS);

// Essentials = the bare minimum to have a functional rig.
export const F14_ESSENTIAL_GROUPS = Object.entries(F14_GROUPS)
  .filter(([, v]) => v.essential)
  .map(([k]) => k);
