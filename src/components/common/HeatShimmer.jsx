"use client";

// Heat shimmer cheap — quad transparente con noise animado.
// No refracta el fondo (eso requeriria render-to-texture). En su lugar
// dibuja una distorsion sutil con alpha-blend, que se interpreta como
// aire caliente sobre la tobera. Local -Z = direccion del chorro.

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { ShaderMaterial, PlaneGeometry, DoubleSide, NormalBlending } from "three";

const _shimmerGeo = new PlaneGeometry(1, 4, 1, 1);  // width 1, depth 4 (en -Z)

const _shimmerMat = new ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uThrottle: { value: 0 } },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      // PlaneGeometry esta en plano XY; rotamos el "y" → -z para que la
      // dimension larga del plano vaya hacia atras (chorro). El billboard
      // (lookAt camera) lo manejamos via rotation del grupo padre.
      vec3 p = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uThrottle;
    varying vec2 vUv;

    // Hash y noise 2D (simplificado, suficiente para shimmer)
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      float a = hash(i), b = hash(i + vec2(1, 0));
      float c = hash(i + vec2(0, 1)), d = hash(i + vec2(1, 1));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }

    void main() {
      // Coord deformada: scrollea hacia atras (uv.y crece con el tiempo)
      vec2 uv = vUv;
      float t = uTime * 1.5;
      // Escala fina (lineas de calor): mucho detalle en eje uv.x, scroll en uv.y
      float n1 = noise(vec2(uv.x * 18.0, uv.y * 8.0  - t * 1.2));
      float n2 = noise(vec2(uv.x * 12.0 + n1 * 2.0, uv.y * 5.0 - t * 0.7));
      float n  = (n1 + n2) * 0.5;

      // Mascara: maximo cerca del nozzle (uv.y=0), se desvanece hacia atras
      float falloff = pow(1.0 - uv.y, 1.4);
      // Mascara radial (centro del plano fuerte, bordes 0)
      float radial = 1.0 - smoothstep(0.3, 0.5, abs(uv.x - 0.5));

      // Patron de bandas: lineas finas onduladas (mas visible que un blob)
      float bands = abs(n - 0.5) * 2.0;
      float shimmer = (1.0 - bands) * 0.7;

      // Solo visible cuando hay throttle (suave en mid, mas en AB)
      float throttleVis = smoothstep(0.20, 0.95, uThrottle);

      float alpha = shimmer * falloff * radial * throttleVis * 0.18;
      // Color: muy levemente cálido, casi gris (no debe destacar)
      vec3 col = vec3(0.95, 0.92, 0.88);
      gl_FragColor = vec4(col, alpha);
    }
  `,
  transparent: true,
  depthWrite: false,
  side: DoubleSide,
  blending: NormalBlending,
});

export function HeatShimmer({ posRef, axisRef, throttleRef, scale = 1 }) {
  const grpRef = useRef();

  useFrame(({ clock, camera }) => {
    if (!grpRef.current) return;
    if (posRef.current) grpRef.current.position.copy(posRef.current);
    // Axis-aligned billboard: local +Y se alinea con el eje del exhaust,
    // y el plano rota alrededor de ese eje para mirar la camara.
    if (axisRef && axisRef.current) {
      grpRef.current.up.copy(axisRef.current);
      grpRef.current.lookAt(camera.position);
    }

    _shimmerMat.uniforms.uTime.value     = clock.elapsedTime;
    _shimmerMat.uniforms.uThrottle.value = throttleRef.current;
  });

  // El plano se extiende a lo largo de +Y local (= dirección del exhaust),
  // con su base (uv.y=0) anclada en la tobera y largo 4 hacia atras.
  return (
    <group ref={grpRef} scale={scale}>
      <mesh geometry={_shimmerGeo} material={_shimmerMat} position={[0, 2, 0]} />
    </group>
  );
}
