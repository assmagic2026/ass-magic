import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUTPUT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const COPYRIGHT = "Copyright 2026 ASS MAGIC. Original procedural geometry.";
const GENERATOR = "ASS MAGIC Original Silhouette Wear Generator 2.0";
const TAU = Math.PI * 2;

const CANDIDATES = [
  {
    id: "a",
    label: "A / PURE SILHOUETTE",
    type: "original-fitted-wear-a",
    direction: "最もシンプル。装備を一切持たず、身体の輪郭だけが素直に見える薄手の服。",
    notes: "pure silhouette / fitted cloth / zero equipment",
    body: { chest: 0.35, chestDepth: 0.225, mid: 0.285, waist: 0.245 },
    materials: {
      top: material(0xdeddd4, 0, 0.88),
      bottom: material(0x303536, 0, 0.86),
      secondary: material(0xbbbdb6, 0, 0.9),
      accent: material(0x7d9999, 0, 0.82),
      skin: material(0xc99476, 0, 0.94),
      hair: material(0x292321, 0, 0.96),
      eyes: material(0x201d1b, 0, 0.72),
    },
    details: ["center-seam"],
  },
  {
    id: "b",
    label: "B / NATURAL LINE",
    type: "original-fitted-wear-b",
    direction: "最も自然。身体に沿う長袖トップと細身のパンツで、胸から腰のラインを見せる基準案。",
    notes: "natural body line / soft long sleeves / tapered pants",
    body: { chest: 0.36, chestDepth: 0.232, mid: 0.292, waist: 0.248 },
    materials: {
      top: material(0xc9d0c9, 0, 0.91),
      bottom: material(0x283038, 0, 0.88),
      secondary: material(0x6d7774, 0, 0.9),
      accent: material(0xaebcaf, 0, 0.86),
      skin: material(0xc99476, 0, 0.94),
      hair: material(0x292321, 0, 0.96),
      eyes: material(0x201d1b, 0, 0.72),
    },
    details: ["waist-seam", "center-seam"],
  },
  {
    id: "c",
    label: "C / SOFT LAYER",
    type: "original-fitted-wear-c",
    direction: "薄い布を一枚重ねたような柔らかな案。装甲ではなく、体幹に沿う布の切り替えだけを加えています。",
    notes: "soft layered cloth / curved yoke / body-following panels",
    body: { chest: 0.365, chestDepth: 0.238, mid: 0.296, waist: 0.25 },
    materials: {
      top: material(0xd7c9ba, 0, 0.93),
      bottom: material(0x4a4544, 0, 0.91),
      secondary: material(0x9d8574, 0, 0.94),
      accent: material(0xb8a08f, 0, 0.9),
      skin: material(0xc99476, 0, 0.94),
      hair: material(0x292321, 0, 0.96),
      eyes: material(0x201d1b, 0, 0.72),
    },
    details: ["soft-yoke", "side-cloth", "waist-seam"],
  },
  {
    id: "d",
    label: "D / FLOW LINE",
    type: "original-fitted-wear-d",
    direction: "斜めに流れる布の切り替えで、飛行中の身体の伸びを強調する軽やかな服。",
    notes: "flowing cloth line / close fit / elongated posture",
    body: { chest: 0.355, chestDepth: 0.228, mid: 0.288, waist: 0.245 },
    materials: {
      top: material(0x61717a, 0, 0.88),
      bottom: material(0x242b31, 0, 0.9),
      secondary: material(0x89969b, 0, 0.9),
      accent: material(0xb6c2c0, 0, 0.86),
      skin: material(0xc99476, 0, 0.94),
      hair: material(0x292321, 0, 0.96),
      eyes: material(0x201d1b, 0, 0.72),
    },
    details: ["diagonal-drape"],
  },
  {
    id: "e",
    label: "E / POETIC CLOTH",
    type: "original-fitted-wear-e",
    direction: "ASS MAGICらしい静かな変化球。淡い色面を非対称に重ねても、身体の輪郭は隠さない服。",
    notes: "poetic cloth / asymmetrical color / visible body silhouette",
    body: { chest: 0.368, chestDepth: 0.23, mid: 0.298, waist: 0.25 },
    materials: {
      top: material(0x374151, 0, 0.91),
      bottom: material(0x20262f, 0, 0.92),
      secondary: material(0xd7d2c6, 0, 0.94),
      accent: material(0x9b829e, 0, 0.92),
      skin: material(0xc99476, 0, 0.94),
      hair: material(0x292321, 0, 0.96),
      eyes: material(0x201d1b, 0, 0.72),
    },
    details: ["asymmetric-cloth", "soft-neckline"],
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
    pointedFoot: builder.addGeometry(
      "pointed_foot",
      makeLoft([
        { y: -0.22, x: 0.035, z: 0.055 },
        { y: -0.14, x: 0.075, z: 0.085 },
        { y: -0.03, x: 0.11, z: 0.115 },
        { y: 0.09, x: 0.105, z: 0.105 },
        { y: 0.17, x: 0.09, z: 0.09 },
      ], 18),
    ),
    fittedArm: builder.addGeometry(
      "fitted_arm",
      makeLoft([
        { y: -0.37, x: 0.135, z: 0.13 },
        { y: -0.24, x: 0.118, z: 0.112 },
        { y: -0.04, x: 0.098, z: 0.098 },
        { y: 0.15, x: 0.09, z: 0.09 },
        { y: 0.37, x: 0.078, z: 0.078 },
      ], 18),
    ),
    fittedLeg: builder.addGeometry(
      "fitted_leg",
      makeLoft([
        { y: -0.485, x: 0.09, z: 0.09 },
        { y: -0.28, x: 0.105, z: 0.105 },
        { y: -0.04, x: 0.1, z: 0.102 },
        { y: 0.18, x: 0.12, z: 0.12 },
        { y: 0.485, x: 0.135, z: 0.13 },
      ], 18),
    ),
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
    pelvis: builder.addGeometry(
      `pelvis_${config.id}`,
      makeLoft([
        { y: -0.2, x: 0.145, z: 0.12 },
        { y: -0.12, x: 0.225, z: 0.16 },
        { y: 0.02, x: 0.265, z: 0.19 },
        { y: 0.13, x: 0.26, z: 0.185 },
        { y: 0.18, x: config.body.waist * 0.98, z: config.body.chestDepth * 0.75 },
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
  add("FittedTop", "torso", "top", [0, 0.35, 0], [1, 1, 1], [0, 0, 0], { role: "torso" });
  add("FittedPelvis", "pelvis", "bottom", [0, -0.25, 0], [1, 1, 1], [0, 0, 0], { role: "pelvis" });
  add("Neck", "cylinder", "skin", [0, 0.86, 0], [0.087, 0.18, 0.087], [0, 0, 0], { role: "neck" });
  add("Head", "sphere", "skin", [0, 1.13, 0], [0.18, 0.25, 0.19], [0, 0, 0], { role: "head" });
  add("Hair", "sphere", "hair", [0, 1.235, -0.025], [0.187, 0.145, 0.19], [0, 0, 0], { role: "hair" });
  add("Nose", "sphere", "skin", [0, 1.105, 0.186], [0.025, 0.04, 0.03], [0, 0, 0], { role: "face" });
  add("Eye_L", "sphere", "eyes", [-0.058, 1.16, 0.184], [0.016, 0.012, 0.01], [0, 0, 0], { role: "face" });
  add("Eye_R", "sphere", "eyes", [0.058, 1.16, 0.184], [0.016, 0.012, 0.01], [0, 0, 0], { role: "face" });

  for (const side of [-1, 1]) {
    const suffix = side < 0 ? "L" : "R";
    add(`SoftShoulder_${suffix}`, "sphere", "top", [side * 0.35, 0.7, 0], [0.12, 0.11, 0.12]);
    add(`FittedArm_${suffix}`, "fittedArm", "top", [side * 0.73, 0.7, 0], [1, 1, 1], [
      0,
      0,
      side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5,
    ]);
    add(`Hand_${suffix}`, "sphere", "skin", [side * 1.16, 0.7, 0.018], [0.07, 0.135, 0.075]);

    add(`FittedLeg_${suffix}`, "fittedLeg", "bottom", [side * 0.15, -0.795, 0], [1, 1, 1]);
    add(`PointedFoot_${suffix}`, "pointedFoot", "bottom", [side * 0.15, -1.15, 0], [1, 1, 1], [0, 0, 0], {
      role: "pointedFoot",
      toesExtended: true,
    });
  }

  addDesignDetails(config, geometry, add);

  addAnchor("Anchor_HeadTop", [0, 1.38, 0], "headTop");
  addAnchor("Anchor_TorsoCenter", [0, 0.35, 0], "torsoCenter");
  addAnchor("Anchor_Shoulder_L", [-0.35, 0.7, 0], "shoulderLeft");
  addAnchor("Anchor_Shoulder_R", [0.35, 0.7, 0], "shoulderRight");
  addAnchor("Anchor_HandTip_L", [-1.23, 0.7, 0], "handTipLeft");
  addAnchor("Anchor_HandTip_R", [1.23, 0.7, 0], "handTipRight");
  addAnchor("Anchor_Foot_L", [-0.15, -1.37, 0], "footLeft");
  addAnchor("Anchor_Foot_R", [0.15, -1.37, 0], "footRight");

  builder.setScene(nodes, {
    candidate: config.id.toUpperCase(),
    type: config.type,
    bodyProfile: "c-like",
    originalGeometry: true,
    creditRequiredForModel: false,
    clothingStyle: "body-silhouette-fitted-cloth",
    mechanicalEquipment: false,
    spaceSuitElements: false,
    toesExtended: true,
    height: 2.75,
    fingertipSpan: 2.46,
  });
  return builder.finish();
}

function addDesignDetails(config, geometry, add) {
  const has = (name) => config.details.includes(name);

  // All details stay close to the torso surface so the human silhouette remains
  // visible. These are fabric color blocks and seams, not armor or equipment.
  if (has("center-seam")) {
    add("ClothCenterSeam", "box", "secondary", [0, 0.37, config.body.chestDepth + 0.012], [0.014, 0.58, 0.008]);
  }
  if (has("waist-seam")) {
    add("SoftWaistSeam", "torusThin", "secondary", [0, 0.015, 0], [
      config.body.waist * 1.01,
      0.28,
      config.body.chestDepth * 0.77,
    ]);
  }
  if (has("soft-yoke")) {
    add("SoftChestYoke", "sphere", "secondary", [0, 0.59, config.body.chestDepth * 0.94], [0.3, 0.11, 0.018]);
  }
  if (has("side-cloth")) {
    add("SideCloth_L", "box", "accent", [-0.235, 0.31, config.body.chestDepth + 0.012], [0.045, 0.38, 0.01], [0, 0, -0.12]);
    add("SideCloth_R", "box", "accent", [0.235, 0.31, config.body.chestDepth + 0.012], [0.045, 0.38, 0.01], [0, 0, 0.12]);
  }
  if (has("diagonal-drape")) {
    add("DiagonalCloth", "box", "secondary", [0, 0.43, config.body.chestDepth + 0.013], [0.075, 0.53, 0.011], [0, 0, -0.48]);
  }
  if (has("sleeve-inset")) {
    for (const side of [-1, 1]) {
      const suffix = side < 0 ? "L" : "R";
      add(`SleeveInset_${suffix}`, "sphere", "secondary", [side * 0.36, 0.7, 0.02], [0.115, 0.12, 0.125]);
    }
  }
  if (has("asymmetric-cloth")) {
    add("LeftSoftCloth", "box", "secondary", [-0.105, 0.34, config.body.chestDepth + 0.013], [0.095, 0.42, 0.011], [0, 0, -0.16]);
    add("RightSoftCloth", "box", "accent", [0.135, 0.48, config.body.chestDepth + 0.014], [0.055, 0.27, 0.012], [0, 0, 0.22]);
  }
  if (has("soft-neckline")) {
    add("SoftNeckline", "torusThin", "secondary", [0, 0.79, 0], [0.15, 0.25, 0.125]);
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
  version: 5,
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
  designConstraints: {
    bodySilhouetteVisible: true,
    fittedClothing: true,
    mechanicalEquipment: false,
    spaceSuitElements: false,
    toesExtended: true,
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
    clothingStyle: "body-silhouette-fitted-cloth",
    mechanicalEquipment: false,
    spaceSuitElements: false,
    toesExtended: true,
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
