// FFT Ocean orchestrator.
//
// Pipeline por frame:
//   1. evolution.glsl  →  hxTarget (.rg = h(k,t),  .ba = i·kx/|k|·h)
//                         hzTarget (.ba = i·kz/|k|·h)
//   2. IFFT 2D sobre hxTarget  →  spatial: .rg = altura, .ba = ∂h/∂x
//   3. IFFT 2D sobre hzTarget  →  spatial: .ba = ∂h/∂z   (.rg redundante)
//
//   La IFFT son 2·log2(N) butterfly passes (horizontal + vertical) más un
//   inversion pass final que aplica (-1)^(x+y) y divide por N².
//
//   Trabajamos sobre RGBA float — cada butterfly procesa los dos complejos
//   (rg + ba) en paralelo.

import * as THREE from "three";
import { spectrumVertexShader, spectrumFragmentShader } from "./spectrum.glsl.js";
import { evolutionVertexShader, evolutionFragmentShader } from "./evolution.glsl.js";
import {
  butterflyVertexShader,
  butterflyFragmentShader,
  inversionFragmentShader,
  buildButterflyTexture,
} from "./butterfly.glsl.js";

function makeFloatRT(N) {
  return new THREE.WebGLRenderTarget(N, N, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    format: THREE.RGBAFormat,
    type: THREE.FloatType,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

export class OceanFFT {
  constructor({
    renderer,
    resolution = 256,
    patchSize = 1000,
    wind = new THREE.Vector2(20, 8),
    phillipsA = 4e-7,
    minK = 1e-4,
    seed = new THREE.Vector2(0, 0),
  }) {
    this.renderer = renderer;
    this.resolution = resolution;
    this.patchSize = patchSize;
    this.wind = wind.clone();
    this.phillipsA = phillipsA;
    this.minK = minK;
    this.seed = seed.clone();
    this.log2N = Math.round(Math.log2(resolution));

    this._fsCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._fsQuadGeom = new THREE.PlaneGeometry(2, 2);

    this._initSpectrum();
    this._initEvolution();
    this._initFFT();
  }

  // ── Phillips spectrum (one-shot) ────────────────────────────────────────
  _initSpectrum() {
    const N = this.resolution;
    this.h0Target = makeFloatRT(N);

    this._spectrumScene = new THREE.Scene();
    this._spectrumMaterial = new THREE.ShaderMaterial({
      vertexShader: spectrumVertexShader,
      fragmentShader: spectrumFragmentShader,
      uniforms: {
        uResolution: { value: N },
        uPatchSize:  { value: this.patchSize },
        uWind:       { value: this.wind },
        uPhillipsA:  { value: this.phillipsA },
        uMinK:       { value: this.minK },
        uSeed:       { value: this.seed },
      },
      depthTest: false,
      depthWrite: false,
    });
    this._spectrumScene.add(new THREE.Mesh(this._fsQuadGeom, this._spectrumMaterial));
    this._renderToTarget(this._spectrumScene, this.h0Target);
  }

  // ── Time evolution (per frame) ──────────────────────────────────────────
  _initEvolution() {
    const N = this.resolution;
    this.hxTarget = makeFloatRT(N);
    this.hzTarget = makeFloatRT(N);

    this._evolutionScene = new THREE.Scene();
    this._evolutionMaterial = new THREE.ShaderMaterial({
      vertexShader: evolutionVertexShader,
      fragmentShader: evolutionFragmentShader,
      uniforms: {
        uH0:         { value: this.h0Target.texture },
        uResolution: { value: N },
        uPatchSize:  { value: this.patchSize },
        uTime:       { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this._evolutionScene.add(new THREE.Mesh(this._fsQuadGeom, this._evolutionMaterial));

    // Crear material Z manualmente (sin clone) compartiendo uniforms.
    // .clone() dispara warning "Textures of render targets cannot be cloned"
    // porque uH0 referencia un render target texture.
    this._evolutionMaterialZ = new THREE.ShaderMaterial({
      vertexShader: evolutionVertexShader,
      fragmentShader: evolutionFragmentShader.replace(
        "float kxn = k.x / kLen;",
        "float kxn = k.y / kLen;"
      ),
      uniforms: this._evolutionMaterial.uniforms, // shared by reference
      depthTest: false,
      depthWrite: false,
    });

    this._evolutionSceneZ = new THREE.Scene();
    this._evolutionSceneZ.add(new THREE.Mesh(this._fsQuadGeom, this._evolutionMaterialZ));
  }

  // ── FFT pipeline ────────────────────────────────────────────────────────
  _initFFT() {
    const N = this.resolution;

    this.butterflyTex = buildButterflyTexture(N);

    // Ping-pong para butterflies
    this._pingA = makeFloatRT(N);
    this._pingB = makeFloatRT(N);

    this._butterflyMaterial = new THREE.ShaderMaterial({
      vertexShader: butterflyVertexShader,
      fragmentShader: butterflyFragmentShader,
      uniforms: {
        uButterfly:  { value: this.butterflyTex },
        uPrev:       { value: null },
        uStage:      { value: 0 },
        uLog2N:      { value: this.log2N },
        uHorizontal: { value: 1.0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this._butterflyScene = new THREE.Scene();
    this._butterflyScene.add(new THREE.Mesh(this._fsQuadGeom, this._butterflyMaterial));

    // Inversion final (signo + 1/N²)
    this._inversionMaterial = new THREE.ShaderMaterial({
      vertexShader: butterflyVertexShader,
      fragmentShader: inversionFragmentShader,
      uniforms: {
        uSrc:        { value: null },
        uResolution: { value: N },
      },
      depthTest: false,
      depthWrite: false,
    });
    this._inversionScene = new THREE.Scene();
    this._inversionScene.add(new THREE.Mesh(this._fsQuadGeom, this._inversionMaterial));

    // Targets espaciales finales
    this.spatialHxTarget = makeFloatRT(N); // .rg = altura, .ba = ∂h/∂x
    this.spatialHzTarget = makeFloatRT(N); // .ba = ∂h/∂z (.rg ignorado)
  }

  // ── Render helpers ──────────────────────────────────────────────────────
  _renderToTarget(scene, target) {
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    r.setRenderTarget(target);
    r.render(scene, this._fsCamera);
    r.setRenderTarget(prevTarget);
  }

  // Corre una IFFT 2D: source RT → output RT (con inversion final).
  _runIFFT(sourceTarget, outputTarget) {
    const m = this._butterflyMaterial;

    // Stage 0 lee desde sourceTarget; alternamos pingA/pingB.
    let read = sourceTarget;
    let write = this._pingA;

    // Horizontal passes
    m.uniforms.uHorizontal.value = 1.0;
    for (let s = 0; s < this.log2N; s++) {
      m.uniforms.uPrev.value = read.texture;
      m.uniforms.uStage.value = s;
      this._renderToTarget(this._butterflyScene, write);
      // swap
      const tmp = read === sourceTarget ? this._pingB : read;
      read = write;
      write = tmp;
    }

    // Vertical passes
    m.uniforms.uHorizontal.value = 0.0;
    for (let s = 0; s < this.log2N; s++) {
      m.uniforms.uPrev.value = read.texture;
      m.uniforms.uStage.value = s;
      this._renderToTarget(this._butterflyScene, write);
      const tmp = read;
      read = write;
      write = tmp;
    }

    // Inversion final → outputTarget
    this._inversionMaterial.uniforms.uSrc.value = read.texture;
    this._renderToTarget(this._inversionScene, outputTarget);
  }

  update(time) {
    this._evolutionMaterial.uniforms.uTime.value = time;
    this._evolutionMaterialZ.uniforms.uTime.value = time;
    this._renderToTarget(this._evolutionScene, this.hxTarget);
    this._renderToTarget(this._evolutionSceneZ, this.hzTarget);

    this._runIFFT(this.hxTarget, this.spatialHxTarget);
    this._runIFFT(this.hzTarget, this.spatialHzTarget);
  }

  rebuildSpectrum(opts = {}) {
    if (opts.wind)      this._spectrumMaterial.uniforms.uWind.value.copy(opts.wind);
    if (opts.phillipsA) this._spectrumMaterial.uniforms.uPhillipsA.value = opts.phillipsA;
    if (opts.seed)      this._spectrumMaterial.uniforms.uSeed.value.copy(opts.seed);
    this._renderToTarget(this._spectrumScene, this.h0Target);
  }

  dispose() {
    this.h0Target?.dispose();
    this.hxTarget?.dispose();
    this.hzTarget?.dispose();
    this._pingA?.dispose();
    this._pingB?.dispose();
    this.spatialHxTarget?.dispose();
    this.spatialHzTarget?.dispose();
    this.butterflyTex?.dispose();
    this._spectrumMaterial?.dispose();
    this._evolutionMaterial?.dispose();
    this._evolutionMaterialZ?.dispose();
    this._butterflyMaterial?.dispose();
    this._inversionMaterial?.dispose();
    this._fsQuadGeom?.dispose();
  }
}
