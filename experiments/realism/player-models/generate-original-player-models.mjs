import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUTPUT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const COPYRIGHT = "Copyright 2026 ASS MAGIC. Original procedural geometry.";
const GENERATOR = "ASS MAGIC Original Space Suit Generator 1.0";
const TAU = Math.PI * 2;

const CANDIDATES = [
  {
    id: "a",
    label: "A / MINIMAL ORBIT",
    type: "original-space-suit-a",
    direction: "最もシンプル。遠景で潰れにくい、柔らかな一体型スーツ。",
    notes: "minimal future / clean silhouette / no backpack",
    body: { chest: 0.35, chestDepth: 0.225, mid: 0.285, waist: 0.245 },
    helmet: [0.27, 0.3, 0.255],
    materials: {
      base: material(0xe8e9df, 0.05, 0.62),
      panel: material(0x363d3e, 0.08, 0.58),
      accent: material(0x67c4cc, 0.12, 0.42, 0x164e55),
      visor: material(0x102d36, 0.3, 0.2, 0x163f49, 0.88),
      dark: material(0x171d1e, 0.12, 0.52),
      glow: material(0xb7f2ed, 0.02, 0.32, 0x67c6c5),
    },
    details: ["minimal-panel", "wrist-cuffs", "ankle-cuffs"],
  },
  {
    id: "b",
    label: "B / HORIZON SUIT",
    type: "original-space-suit-b",
    direction: "最も自然。未来感と宇宙服感を均衡させた基準案。",
    notes: "balanced future / space suit / soft utility",
    body: { chest: 0.36, chestDepth: 0.232, mid: 0.292, waist: 0.248 },
    helmet: [0.272, 0.303, 0.26],
    materials: {
      base: material(0xe6e2d7, 0.06, 0.65),
      panel: material(0x3b4a4d, 0.12, 0.5),
      accent: material(0x4f9ea4, 0.15, 0.38, 0x153e43),
      visor: material(0x172a35, 0.38, 0.18, 0x172c3a, 0.9),
      dark: material(0x1e2528, 0.16, 0.48),
      glow: material(0xc9eee3, 0.02, 0.28, 0x74b9ad),
    },
    details: ["chest-shell", "soft-backpack", "belt", "knee-pads", "joint-cuffs"],
  },
  {
    id: "c",
    label: "C / LUNAR SOFTSHELL",
    type: "original-space-suit-c",
    direction: "宇宙服感がやや強め。首・胸・関節に軽量機能パーツを配置。",
    notes: "soft pressure suit / collar / joint rings",
    body: { chest: 0.365, chestDepth: 0.238, mid: 0.296, waist: 0.25 },
    helmet: [0.275, 0.305, 0.265],
    materials: {
      base: material(0xe7e3d6, 0.05, 0.7),
      panel: material(0x35464a, 0.1, 0.56),
      accent: material(0xc97b49, 0.12, 0.42, 0x4a2415),
      visor: material(0x452b24, 0.4, 0.16, 0x5c3322, 0.9),
      dark: material(0x20292b, 0.18, 0.5),
      glow: material(0xffd29a, 0.02, 0.3, 0xd87f44),
    },
    details: [
      "pressure-collar",
      "life-support-chest",
      "twin-pod-backpack",
      "belt",
      "knee-pads",
      "joint-rings",
      "boot-soles",
    ],
  },
  {
    id: "d",
    label: "D / AETHER FLIGHT",
    type: "original-space-suit-d",
    direction: "未来感がやや強め。滑らかな胸部レンズと流線型の肩を持つ飛行スーツ。",
    notes: "abstract flight suit / luminous lines / smooth shell",
    body: { chest: 0.355, chestDepth: 0.228, mid: 0.288, waist: 0.245 },
    helmet: [0.262, 0.318, 0.25],
    materials: {
      base: material(0xcfd6d8, 0.28, 0.32),
      panel: material(0x29313c, 0.38, 0.3),
      accent: material(0x7186dc, 0.25, 0.28, 0x252e72),
      visor: material(0x17182d, 0.52, 0.12, 0x222550, 0.9),
      dark: material(0x171b25, 0.36, 0.28),
      glow: material(0xb8c7ff, 0.05, 0.22, 0x657cff),
    },
    details: ["future-lens", "flight-lines", "shoulder-fins", "spine-tabs", "joint-cuffs"],
  },
  {
    id: "e",
    label: "E / NOCTILUCA",
    type: "original-space-suit-e",
    direction: "ASS MAGICらしい変化球。夜光色の軌道リングを持つ詩的な宇宙スーツ。",
    notes: "poetic future / orbit collar / noctilucent accents",
    body: { chest: 0.368, chestDepth: 0.23, mid: 0.298, waist: 0.25 },
    helmet: [0.282, 0.294, 0.258],
    materials: {
      base: material(0x222735, 0.2, 0.42),
      panel: material(0xdedcd3, 0.08, 0.52),
      accent: material(0xbc8fbf, 0.16, 0.34, 0x4b2857),
      visor: material(0x10242d, 0.42, 0.12, 0x123d4e, 0.9),
      dark: material(0x11151e, 0.28, 0.32),
      glow: material(0xcef7e9, 0.02, 0.2, 0x72d8c1),
      warmGlow: material(0xffddb0, 0.02, 0.24, 0xd79a5e),
    },
    details: ["orbit-collar", "constellation-chest", "asymmetric-panels", "joint-cuffs"],
  },
];

function material(color, metalness, roughness, emissive = 0x000000, opacity = 1) {
  return { color, metalness, roughness, emissive, opacity };
}

function buildCandidate(config) {
  const builder = new GlbBuilder(config);
  const geometry = {
    box: builder.addGeometry("unit_box", makeBox()),
    sphere: builder.addGeometry("unit_sphere", makeSphere(16, 10)),
    cylinder: builder.addGeometry("unit_cylinder", makeCylinder(16)),
    torusThin: builder.addGeometry("torus_thin", makeTorus(1, 0.075, 20, 8)),
    torusMedium: builder.addGeometry("torus_medium", makeTorus(1, 0.13, 20, 8)),
    torso: builder.addGeometry(
      `torso_${config.id}`,
      makeLoft([
        { y: -0.42, x: config.body.waist * 0.97, z: config.body.chestDepth * 0.74 },
        { y: -0.26, x: config.body.waist, z: config.body.chestDepth * 0.76 },
        { y: -0.02, x: config.body.mid, z: config.body.chestDepth * 0.86 },
        { y: 0.25, x: config.body.chest, z: config.body.chestDepth },
        { y: 0.43, x: config.body.chest * 0.93, z: config.body.chestDepth * 0.94 },
      ], 18),
    ),
  };

  for (const [name, definition] of Object.entries(config.materials)) {
    builder.addMaterial(name, definition);
  }

  const nodes = [];
  const add = (name, shape, mat, position, scale, rotation = [0, 0, 0], extras = {}) => {
    nodes.push(builder.addMeshNode(name, geometry[shape], mat, position, scale, rotation, extras));
  };
  const addAnchor = (name, position, role) => {
    nodes.push(builder.addNode({ name, translation: position, extras: { assmagicAnchor: role } }));
  };

  // Core original body. Dimensions are authored around the current game's
  // measured 2.75 height / 2.46 fingertip span, without reusing its mesh.
  add("TorsoShell", "torso", "base", [0, 0.35, 0], [1, 1, 1], [0, 0, 0], { role: "torso" });
  add("PelvisShell", "sphere", "panel", [0, -0.23, 0], [0.265, 0.23, 0.19], [0, 0, 0], { role: "pelvis" });
  add("NeckSeal", "cylinder", "dark", [0, 0.84, 0], [0.105, 0.17, 0.105], [0, 0, 0], { role: "neck" });
  add("HelmetShell", "sphere", "base", [0, 1.075, 0], config.helmet, [0, 0, 0], { role: "head" });
  add("VisorLens", "sphere", "visor", [0, 1.075, config.helmet[2] * 0.83], [
    config.helmet[0] * 0.82,
    config.helmet[1] * 0.67,
    config.helmet[2] * 0.25,
  ], [0, 0, 0], { role: "visor" });

  for (const side of [-1, 1]) {
    const suffix = side < 0 ? "L" : "R";
    add(`Shoulder_${suffix}`, "sphere", "base", [side * 0.35, 0.7, 0], [0.16, 0.145, 0.16]);
    add(`UpperArm_${suffix}`, "cylinder", "base", [side * 0.55, 0.7, 0], [0.112, 0.4, 0.112], [0, 0, Math.PI * 0.5]);
    add(`Elbow_${suffix}`, "sphere", "panel", [side * 0.75, 0.7, 0], [0.12, 0.105, 0.115]);
    add(`Forearm_${suffix}`, "cylinder", "base", [side * 0.935, 0.7, 0], [0.097, 0.37, 0.097], [0, 0, Math.PI * 0.5]);
    add(`Hand_${suffix}`, "sphere", "panel", [side * 1.16, 0.7, 0.018], [0.07, 0.14, 0.09], [0, 0, Math.PI * 0.5]);

    add(`UpperLeg_${suffix}`, "cylinder", "base", [side * 0.15, -0.57, 0], [0.14, 0.52, 0.14]);
    add(`Knee_${suffix}`, "sphere", "panel", [side * 0.15, -0.83, 0.025], [0.145, 0.12, 0.15]);
    add(`LowerLeg_${suffix}`, "cylinder", "base", [side * 0.15, -1.06, 0], [0.115, 0.46, 0.115]);
    add(`Boot_${suffix}`, "box", "dark", [side * 0.15, -1.28, 0.07], [0.22, 0.18, 0.34]);
  }

  addDesignDetails(config, geometry, add);

  addAnchor("Anchor_HeadTop", [0, 1.38, 0], "headTop");
  addAnchor("Anchor_TorsoCenter", [0, 0.35, 0], "torsoCenter");
  addAnchor("Anchor_Shoulder_L", [-0.35, 0.7, 0], "shoulderLeft");
  addAnchor("Anchor_Shoulder_R", [0.35, 0.7, 0], "shoulderRight");
  addAnchor("Anchor_HandTip_L", [-1.23, 0.7, 0], "handTipLeft");
  addAnchor("Anchor_HandTip_R", [1.23, 0.7, 0], "handTipRight");
  addAnchor("Anchor_Foot_L", [-0.15, -1.37, 0.07], "footLeft");
  addAnchor("Anchor_Foot_R", [0.15, -1.37, 0.07], "footRight");

  builder.setScene(nodes, {
    candidate: config.id.toUpperCase(),
    type: config.type,
    bodyProfile: "c-like",
    originalGeometry: true,
    creditRequiredForModel: false,
    height: 2.75,
    fingertipSpan: 2.46,
  });
  return builder.finish();
}

function addDesignDetails(config, geometry, add) {
  const has = (name) => config.details.includes(name);

  if (has("minimal-panel")) {
    add("MinimalChestLine", "box", "accent", [0, 0.38, config.body.chestDepth + 0.018], [0.09, 0.5, 0.025]);
    add("MinimalBelt", "torusThin", "panel", [0, 0.02, 0], [config.body.waist, 0.72, config.body.chestDepth * 0.76]);
  }
  if (has("chest-shell")) {
    add("SoftChestPlate", "sphere", "panel", [0, 0.45, config.body.chestDepth * 0.94], [0.27, 0.3, 0.055]);
    add("ChestHorizon", "box", "accent", [0, 0.46, config.body.chestDepth + 0.03], [0.38, 0.055, 0.025]);
  }
  if (has("life-support-chest")) {
    add("LifeSupportPlate", "box", "panel", [0, 0.43, config.body.chestDepth + 0.035], [0.34, 0.34, 0.08]);
    add("LifeSupportCore", "sphere", "glow", [0, 0.46, config.body.chestDepth + 0.083], [0.09, 0.09, 0.03]);
    add("ChestRail_L", "box", "accent", [-0.14, 0.39, config.body.chestDepth + 0.08], [0.035, 0.22, 0.025]);
    add("ChestRail_R", "box", "accent", [0.14, 0.39, config.body.chestDepth + 0.08], [0.035, 0.22, 0.025]);
  }
  if (has("future-lens")) {
    add("AetherChestLens", "sphere", "visor", [0, 0.46, config.body.chestDepth * 0.97], [0.26, 0.31, 0.055]);
    add("AetherCore", "sphere", "glow", [0, 0.48, config.body.chestDepth + 0.04], [0.055, 0.13, 0.025]);
  }
  if (has("flight-lines")) {
    add("FlightLine_L", "box", "accent", [-0.12, 0.38, config.body.chestDepth + 0.032], [0.035, 0.42, 0.02], [0, 0, -0.28]);
    add("FlightLine_R", "box", "glow", [0.12, 0.38, config.body.chestDepth + 0.032], [0.035, 0.42, 0.02], [0, 0, 0.28]);
  }
  if (has("constellation-chest")) {
    add("NoctilucaPlate", "sphere", "panel", [0, 0.43, config.body.chestDepth * 0.96], [0.255, 0.29, 0.045]);
    add("Constellation_1", "sphere", "glow", [-0.09, 0.54, config.body.chestDepth + 0.035], [0.027, 0.027, 0.018]);
    add("Constellation_2", "sphere", "warmGlow", [0.06, 0.46, config.body.chestDepth + 0.035], [0.035, 0.035, 0.018]);
    add("Constellation_3", "sphere", "glow", [0.13, 0.31, config.body.chestDepth + 0.035], [0.022, 0.022, 0.018]);
  }

  if (has("pressure-collar")) {
    add("PressureCollar", "torusMedium", "panel", [0, 0.82, 0], [0.17, 0.72, 0.17]);
    add("CollarGlow", "torusThin", "glow", [0, 0.835, 0], [0.185, 0.7, 0.185]);
  }
  if (has("orbit-collar")) {
    add("OrbitCollar", "torusThin", "glow", [0, 0.78, 0], [0.33, 0.8, 0.25], [0.42, 0, 0.18]);
    add("OrbitCounterweight", "sphere", "warmGlow", [0.25, 0.83, 0.1], [0.04, 0.04, 0.04]);
  }
  if (has("belt")) {
    add("UtilityBelt", "torusThin", "dark", [0, 0.02, 0], [config.body.waist * 1.04, 0.72, config.body.chestDepth * 0.82]);
    add("BeltLight", "box", "glow", [0, 0.02, config.body.chestDepth * 0.82], [0.08, 0.055, 0.025]);
  }
  if (has("soft-backpack")) {
    add("SoftBackpack", "sphere", "panel", [0, 0.39, -config.body.chestDepth * 0.95], [0.21, 0.31, 0.09]);
  }
  if (has("twin-pod-backpack")) {
    add("BackpackBridge", "box", "panel", [0, 0.39, -config.body.chestDepth - 0.035], [0.28, 0.3, 0.08]);
    add("Pod_L", "cylinder", "dark", [-0.16, 0.38, -config.body.chestDepth - 0.09], [0.07, 0.34, 0.07]);
    add("Pod_R", "cylinder", "dark", [0.16, 0.38, -config.body.chestDepth - 0.09], [0.07, 0.34, 0.07]);
  }
  if (has("shoulder-fins")) {
    add("ShoulderFin_L", "box", "panel", [-0.37, 0.76, -0.01], [0.24, 0.07, 0.16], [0, 0, -0.16]);
    add("ShoulderFin_R", "box", "panel", [0.37, 0.76, -0.01], [0.24, 0.07, 0.16], [0, 0, 0.16]);
  }
  if (has("spine-tabs")) {
    for (let index = 0; index < 4; index += 1) {
      add(`SpineTab_${index + 1}`, "box", index % 2 ? "accent" : "panel", [
        0,
        0.2 + index * 0.16,
        -config.body.chestDepth - 0.025,
      ], [0.1, 0.075, 0.035]);
    }
  }
  if (has("asymmetric-panels")) {
    add("LeftPearlPanel", "box", "panel", [-0.11, 0.28, config.body.chestDepth + 0.025], [0.12, 0.34, 0.025], [0, 0, -0.14]);
    add("RightNightPanel", "box", "accent", [0.15, 0.42, config.body.chestDepth + 0.025], [0.08, 0.28, 0.025], [0, 0, 0.2]);
  }

  for (const side of [-1, 1]) {
    const suffix = side < 0 ? "L" : "R";
    if (has("wrist-cuffs") || has("joint-cuffs") || has("joint-rings")) {
      add(`WristCuff_${suffix}`, "torusThin", "accent", [side * 1.08, 0.7, 0], [0.1, 0.8, 0.1], [0, 0, Math.PI * 0.5]);
    }
    if (has("joint-cuffs") || has("joint-rings")) {
      add(`ElbowRing_${suffix}`, "torusThin", "panel", [side * 0.75, 0.7, 0], [0.125, 0.82, 0.125], [0, 0, Math.PI * 0.5]);
    }
    if (has("joint-rings")) {
      add(`KneeRing_${suffix}`, "torusThin", "accent", [side * 0.15, -0.83, 0.02], [0.15, 0.76, 0.15]);
    }
    if (has("knee-pads")) {
      add(`KneePad_${suffix}`, "sphere", "panel", [side * 0.15, -0.83, 0.12], [0.12, 0.105, 0.04]);
    }
    if (has("ankle-cuffs")) {
      add(`AnkleCuff_${suffix}`, "torusThin", "accent", [side * 0.15, -1.25, 0], [0.12, 0.76, 0.12]);
    }
    if (has("boot-soles")) {
      add(`BootSole_${suffix}`, "box", "accent", [side * 0.15, -1.375, 0.08], [0.23, 0.025, 0.35]);
    }
  }
}

class GlbBuilder {
  constructor(config) {
    this.config = config;
    this.materials = [];
    this.materialIndices = new Map();
    this.accessors = [];
    this.bufferViews = [];
    this.buffers = [];
    this.byteLength = 0;
    this.geometries = new Map();
    this.meshes = [];
    this.meshCache = new Map();
    this.nodes = [];
    this.sceneNodes = [];
    this.sceneExtras = {};
    this.renderedTriangleCount = 0;
  }

  addMaterial(name, definition) {
    const baseColor = colorFactor(definition.color, definition.opacity);
    const emissive = colorFactor(definition.emissive, 1).slice(0, 3);
    const materialDefinition = {
      name,
      pbrMetallicRoughness: {
        baseColorFactor: baseColor,
        metallicFactor: definition.metalness,
        roughnessFactor: definition.roughness,
      },
      emissiveFactor: emissive,
    };
    if (definition.opacity < 1) {
      materialDefinition.alphaMode = "BLEND";
      materialDefinition.doubleSided = true;
    }
    this.materialIndices.set(name, this.materials.length);
    this.materials.push(materialDefinition);
  }

  addGeometry(name, geometry) {
    const positionAccessor = this.addAccessor(
      new Float32Array(geometry.positions),
      34962,
      5126,
      "VEC3",
      computeMinMax(geometry.positions, 3),
    );
    const normalAccessor = this.addAccessor(
      new Float32Array(geometry.normals),
      34962,
      5126,
      "VEC3",
    );
    const indexAccessor = this.addAccessor(
      new Uint16Array(geometry.indices),
      34963,
      5123,
      "SCALAR",
      computeMinMax(geometry.indices, 1),
    );
    const definition = { positionAccessor, normalAccessor, indexAccessor };
    this.geometries.set(name, definition);
    return name;
  }

  addAccessor(typedArray, target, componentType, type, minMax = null) {
    this.alignBuffer();
    const byteOffset = this.byteLength;
    const buffer = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    this.buffers.push(Buffer.from(buffer));
    this.byteLength += buffer.byteLength;
    const bufferView = this.bufferViews.length;
    this.bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: buffer.byteLength,
      target,
    });
    const componentCount = type === "VEC3" ? 3 : 1;
    const accessor = {
      bufferView,
      componentType,
      count: typedArray.length / componentCount,
      type,
    };
    if (minMax) {
      accessor.min = minMax.min;
      accessor.max = minMax.max;
    }
    this.accessors.push(accessor);
    return this.accessors.length - 1;
  }

  alignBuffer() {
    const padding = (4 - (this.byteLength % 4)) % 4;
    if (!padding) return;
    this.buffers.push(Buffer.alloc(padding));
    this.byteLength += padding;
  }

  addMeshNode(name, geometryName, materialName, translation, scale, rotationEuler, extras = {}) {
    const geometry = this.geometries.get(geometryName);
    this.renderedTriangleCount += this.accessors[geometry.indexAccessor].count / 3;
    const cacheKey = `${geometryName}/${materialName}`;
    let meshIndex = this.meshCache.get(cacheKey);
    if (meshIndex === undefined) {
      meshIndex = this.meshes.length;
      this.meshes.push({
        name: cacheKey,
        primitives: [{
          attributes: {
            POSITION: geometry.positionAccessor,
            NORMAL: geometry.normalAccessor,
          },
          indices: geometry.indexAccessor,
          material: this.materialIndices.get(materialName),
        }],
      });
      this.meshCache.set(cacheKey, meshIndex);
    }
    return this.addNode({
      name,
      mesh: meshIndex,
      translation,
      scale,
      rotation: quaternionFromEuler(rotationEuler),
      extras,
    });
  }

  addNode(definition) {
    const cleaned = Object.fromEntries(
      Object.entries(definition).filter(([, value]) => value !== undefined),
    );
    this.nodes.push(cleaned);
    return this.nodes.length - 1;
  }

  setScene(childNodes, extras) {
    const rootIndex = this.addNode({
      name: `ASS_MAGIC_ORIGINAL_${this.config.id.toUpperCase()}`,
      children: childNodes,
      extras,
    });
    this.sceneNodes = [rootIndex];
    this.sceneExtras = extras;
  }

  finish() {
    this.alignBuffer();
    const binary = Buffer.concat(this.buffers, this.byteLength);
    const json = {
      asset: {
        version: "2.0",
        generator: GENERATOR,
        copyright: COPYRIGHT,
        extras: {
          modelingMethod: "Original procedural primitives and authored proportions",
          sourceMeshReused: false,
          sourceTextureReused: false,
        },
      },
      scene: 0,
      scenes: [{
        name: this.config.label,
        nodes: this.sceneNodes,
        extras: this.sceneExtras,
      }],
      nodes: this.nodes,
      meshes: this.meshes,
      materials: this.materials,
      accessors: this.accessors,
      bufferViews: this.bufferViews,
      buffers: [{ byteLength: binary.byteLength }],
    };
    return {
      buffer: encodeGlb(json, binary),
      triangleCount: this.renderedTriangleCount,
      nodeCount: this.nodes.length,
      materialCount: this.materials.length,
    };
  }
}

function makeBox() {
  const positions = [];
  const normals = [];
  const indices = [];
  const faces = [
    { n: [1, 0, 0], v: [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]] },
    { n: [-1, 0, 0], v: [[-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5]] },
    { n: [0, 1, 0], v: [[-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]] },
    { n: [0, -1, 0], v: [[-0.5, -0.5, 0.5], [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5]] },
    { n: [0, 0, 1], v: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
    { n: [0, 0, -1], v: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] },
  ];
  for (const face of faces) {
    const start = positions.length / 3;
    for (const vertex of face.v) {
      positions.push(...vertex);
      normals.push(...face.n);
    }
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  return { positions, normals, indices };
}

function makeSphere(widthSegments, heightSegments) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let y = 0; y <= heightSegments; y += 1) {
    const v = y / heightSegments;
    const phi = v * Math.PI;
    for (let x = 0; x <= widthSegments; x += 1) {
      const u = x / widthSegments;
      const theta = u * TAU;
      const px = -Math.cos(theta) * Math.sin(phi);
      const py = Math.cos(phi);
      const pz = Math.sin(theta) * Math.sin(phi);
      positions.push(px, py, pz);
      normals.push(px, py, pz);
    }
  }
  for (let y = 0; y < heightSegments; y += 1) {
    for (let x = 0; x < widthSegments; x += 1) {
      const a = y * (widthSegments + 1) + x;
      const b = a + widthSegments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { positions, normals, indices };
}

function makeCylinder(segments) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let yIndex = 0; yIndex <= 1; yIndex += 1) {
    const y = yIndex - 0.5;
    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = (segment / segments) * TAU;
      const x = Math.cos(angle);
      const z = Math.sin(angle);
      positions.push(x, y, z);
      normals.push(x, 0, z);
    }
  }
  for (let segment = 0; segment < segments; segment += 1) {
    const a = segment;
    const b = segment + segments + 1;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  for (const side of [-1, 1]) {
    const centerIndex = positions.length / 3;
    positions.push(0, side * 0.5, 0);
    normals.push(0, side, 0);
    const ringStart = positions.length / 3;
    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = (segment / segments) * TAU;
      positions.push(Math.cos(angle), side * 0.5, Math.sin(angle));
      normals.push(0, side, 0);
    }
    for (let segment = 0; segment < segments; segment += 1) {
      if (side > 0) indices.push(centerIndex, ringStart + segment + 1, ringStart + segment);
      else indices.push(centerIndex, ringStart + segment, ringStart + segment + 1);
    }
  }
  return { positions, normals, indices };
}

function makeTorus(radius, tube, radialSegments, tubularSegments) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let radial = 0; radial <= radialSegments; radial += 1) {
    const u = (radial / radialSegments) * TAU;
    for (let tubular = 0; tubular <= tubularSegments; tubular += 1) {
      const v = (tubular / tubularSegments) * TAU;
      const ringRadius = radius + tube * Math.cos(v);
      const x = ringRadius * Math.cos(u);
      const y = tube * Math.sin(v);
      const z = ringRadius * Math.sin(u);
      positions.push(x, y, z);
      normals.push(Math.cos(v) * Math.cos(u), Math.sin(v), Math.cos(v) * Math.sin(u));
    }
  }
  for (let radial = 0; radial < radialSegments; radial += 1) {
    for (let tubular = 0; tubular < tubularSegments; tubular += 1) {
      const a = radial * (tubularSegments + 1) + tubular;
      const b = (radial + 1) * (tubularSegments + 1) + tubular;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { positions, normals, indices };
}

function makeLoft(profile, segments) {
  const positions = [];
  const indices = [];
  for (const ring of profile) {
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * TAU;
      positions.push(
        Math.cos(angle) * ring.x,
        ring.y,
        Math.sin(angle) * ring.z,
      );
    }
  }
  for (let ring = 0; ring < profile.length - 1; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      const a = ring * segments + segment;
      const b = (ring + 1) * segments + segment;
      const c = ring * segments + next;
      const d = (ring + 1) * segments + next;
      indices.push(a, b, c, b, d, c);
    }
  }
  const bottomCenter = positions.length / 3;
  positions.push(0, profile[0].y, 0);
  const topCenter = positions.length / 3;
  positions.push(0, profile.at(-1).y, 0);
  for (let segment = 0; segment < segments; segment += 1) {
    const next = (segment + 1) % segments;
    indices.push(bottomCenter, next, segment);
    const topStart = (profile.length - 1) * segments;
    indices.push(topCenter, topStart + segment, topStart + next);
  }
  return { positions, normals: computeNormals(positions, indices), indices };
}

function computeNormals(positions, indices) {
  const normals = new Array(positions.length).fill(0);
  for (let index = 0; index < indices.length; index += 3) {
    const ia = indices[index] * 3;
    const ib = indices[index + 1] * 3;
    const ic = indices[index + 2] * 3;
    const ab = [
      positions[ib] - positions[ia],
      positions[ib + 1] - positions[ia + 1],
      positions[ib + 2] - positions[ia + 2],
    ];
    const ac = [
      positions[ic] - positions[ia],
      positions[ic + 1] - positions[ia + 1],
      positions[ic + 2] - positions[ia + 2],
    ];
    const normal = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    for (const offset of [ia, ib, ic]) {
      normals[offset] += normal[0];
      normals[offset + 1] += normal[1];
      normals[offset + 2] += normal[2];
    }
  }
  for (let offset = 0; offset < normals.length; offset += 3) {
    const length = Math.hypot(normals[offset], normals[offset + 1], normals[offset + 2]) || 1;
    normals[offset] /= length;
    normals[offset + 1] /= length;
    normals[offset + 2] /= length;
  }
  return normals;
}

function computeMinMax(values, componentCount) {
  const min = new Array(componentCount).fill(Infinity);
  const max = new Array(componentCount).fill(-Infinity);
  for (let index = 0; index < values.length; index += componentCount) {
    for (let component = 0; component < componentCount; component += 1) {
      min[component] = Math.min(min[component], values[index + component]);
      max[component] = Math.max(max[component], values[index + component]);
    }
  }
  return { min, max };
}

function colorFactor(hex, alpha) {
  return [
    ((hex >> 16) & 255) / 255,
    ((hex >> 8) & 255) / 255,
    (hex & 255) / 255,
    alpha,
  ];
}

function quaternionFromEuler([x, y, z]) {
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ];
}

function encodeGlb(json, binary) {
  const jsonBuffer = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPadding = (4 - (jsonBuffer.length % 4)) % 4;
  const paddedJson = Buffer.concat([jsonBuffer, Buffer.alloc(jsonPadding, 0x20)]);
  const binPadding = (4 - (binary.length % 4)) % 4;
  const paddedBinary = Buffer.concat([binary, Buffer.alloc(binPadding)]);
  const totalLength = 12 + 8 + paddedJson.length + 8 + paddedBinary.length;
  const glb = Buffer.alloc(totalLength);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(totalLength, 8);
  glb.writeUInt32LE(paddedJson.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  paddedJson.copy(glb, 20);
  const binaryHeader = 20 + paddedJson.length;
  glb.writeUInt32LE(paddedBinary.length, binaryHeader);
  glb.writeUInt32LE(0x004e4942, binaryHeader + 4);
  paddedBinary.copy(glb, binaryHeader + 8);
  return glb;
}

const manifest = {
  version: 1,
  generator: GENERATOR,
  copyright: COPYRIGHT,
  rights: {
    originalGeometry: true,
    externalMeshes: false,
    externalTextures: false,
    thirdPartyLogos: false,
    creditRequiredForModelData: false,
  },
  referenceDimensions: {
    source: "Current player measurements used only as numeric compatibility targets",
    targetHeight: 2.75,
    targetFingertipSpan: 2.46,
  },
  candidates: [],
};

for (const config of CANDIDATES) {
  const result = buildCandidate(config);
  const file = `original-player-${config.id}.glb`;
  fs.writeFileSync(path.join(OUTPUT_DIRECTORY, file), result.buffer);
  manifest.candidates.push({
    id: config.id.toUpperCase(),
    type: config.type,
    file,
    direction: config.direction,
    notes: config.notes,
    bodyProfile: "c-like",
    body: config.body,
    dimensions: {
      height: 2.75,
      fingertipSpan: 2.46,
      shoulderSpan: 0.7,
      headTop: 1.38,
      footBase: -1.37,
    },
    triangleCount: result.triangleCount,
    nodeCount: result.nodeCount,
    materialCount: result.materialCount,
    byteLength: result.buffer.byteLength,
    modelingMethod: "Original authored parameters and procedural primitives",
  });
}

fs.writeFileSync(
  path.join(OUTPUT_DIRECTORY, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

for (const candidate of manifest.candidates) {
  console.log(`${candidate.id}: ${candidate.file} ${candidate.byteLength} bytes / ${candidate.triangleCount} triangles`);
}
