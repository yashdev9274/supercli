"use client";

import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChipTexture,
  createFrontTexture,
  createBackTexture,
  type CategoryChip,
} from "./card-textures";

interface CategoryDef {
  label: string;
  color: string;
}

const CATEGORIES: CategoryDef[] = [
  { label: "inference", color: "#7c5cff" },
  { label: "search", color: "#22c5ff" },
  { label: "stt", color: "#ff7a59" },
  { label: "tts", color: "#ff5fa8" },
  { label: "browser", color: "#5be09a" },
  { label: "compute", color: "#ffd14a" },
  { label: "embed", color: "#9b6cff" },
  { label: "vector", color: "#39d6c4" },
];

const CARD_W = 3.4;
const CARD_H = 2.1;
const CARD_T = 0.05;

export default function SupercardScene({ expanded }: { expanded: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const expandedRef = useRef(expanded);
  const hoverRef = useRef(false);
  const pointerRef = useRef({ x: 0, y: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);

  const categoryChips = useMemo<CategoryChip[]>(
    () => CATEGORIES.map((c) => ({ label: c.label, color: c.color })),
    []
  );

  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducedMotion(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0, 8.2);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(2.2, 3.5, 4);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x8aa0ff, 0.9);
    rimLight.position.set(-3, -1.5, -2);
    scene.add(rimLight);

    const fillLight = new THREE.PointLight(0xff9bd4, 0.45, 14);
    fillLight.position.set(-2.5, 1.8, 3.5);
    scene.add(fillLight);

    const card = new THREE.Group();
    scene.add(card);

    const cardGeom = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_T, 1, 1, 1);

    const frontTex = createFrontTexture();
    const backTex = createBackTexture();

    const sideMat = new THREE.MeshPhysicalMaterial({
      color: 0x0d0d18,
      roughness: 0.55,
      metalness: 0.5,
      clearcoat: 0.35,
      clearcoatRoughness: 0.5,
    });
    const frontMat = new THREE.MeshPhysicalMaterial({
      map: frontTex,
      roughness: 0.35,
      metalness: 0.25,
      clearcoat: 0.9,
      clearcoatRoughness: 0.18,
      sheen: 0.35,
      sheenColor: new THREE.Color(0x88aaff),
      transparent: true,
      alphaTest: 0.01,
    });
    const backMat = new THREE.MeshPhysicalMaterial({
      map: backTex,
      roughness: 0.55,
      metalness: 0.15,
      clearcoat: 0.4,
      clearcoatRoughness: 0.4,
      transparent: true,
      alphaTest: 0.01,
    });

    // BoxGeometry material groups: +X, -X, +Y, -Y, +Z (front), -Z (back)
    const materials = [sideMat, sideMat, sideMat, sideMat, frontMat, backMat] as const;
    const cardMesh = new THREE.Mesh(cardGeom, materials.slice());
    card.add(cardMesh);

    // Holographic shader overlay above front face
    const holoGeom = new THREE.PlaneGeometry(CARD_W, CARD_H, 1, 1);
    const holoMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform float uTime;
        uniform vec2 uMouse;
        void main() {
          vec2 p = vUv - uMouse;
          float dist = length(p);
          float hue = atan(p.y, p.x) / 6.2831853 + uTime * 0.04;
          float band = sin(dist * 28.0 - uTime * 1.3) * 0.5 + 0.5;
          vec3 col = vec3(
            sin(hue * 6.2831853) * 0.5 + 0.5,
            sin((hue + 0.33) * 6.2831853) * 0.5 + 0.5,
            sin((hue + 0.66) * 6.2831853) * 0.5 + 0.5
          );
          float alpha = pow(1.0 - smoothstep(0.0, 0.92, dist), 1.3)
            * (0.16 + 0.20 * band);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    const holoOverlay = new THREE.Mesh(holoGeom, holoMat);
    holoOverlay.position.z = CARD_T / 2 + 0.001;
    card.add(holoOverlay);

    // Category satellites that fan out behind the card on expand
    const satellites = CATEGORIES.map((cat, i) => {
      const tex = createChipTexture(cat);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const geom = new THREE.PlaneGeometry(0.95, 0.95);
      const mesh = new THREE.Mesh(geom, mat);

      // Final position when fully expanded: arc behind the card
      const t = i / (CATEGORIES.length - 1);
      const angle = Math.PI * 1.05 - t * Math.PI * 1.4;
      const radius = 4.4;
      mesh.userData.finalPos = new THREE.Vector3(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * 0.55,
        -1.5 - (i % 2 === 0 ? 0 : 0.5)
      );
      mesh.userData.finalRot = new THREE.Euler(0, -angle * 0.55, angle * 0.04);
      mesh.userData.restPos = new THREE.Vector3(0, 0, -0.005 - i * 0.0015);
      mesh.userData.index = i;
      scene.add(mesh);
      return mesh;
    });

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      pointerRef.current.x = x * 2 - 1;
      pointerRef.current.y = -(y * 2 - 1);
      hoverRef.current = true;
    };
    const onLeave = () => {
      hoverRef.current = false;
      pointerRef.current.x = 0;
      pointerRef.current.y = 0;
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);

    const clock = new THREE.Clock();
    let rafId = 0;

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const t = clock.elapsedTime;
      const hover = hoverRef.current;
      const exp = expandedRef.current ? 1 : 0;

      const targetScale = 1 + exp * 0.18;
      card.scale.x += (targetScale - card.scale.x) * 0.10;
      card.scale.y = card.scale.x;
      card.scale.z = card.scale.x;

      const tiltStrength = hover ? 0.9 : 0.28;
      const idleX = reducedMotion ? 0 : 0.04 * Math.sin(t * 0.4);
      const idleY = reducedMotion ? 0 : 0.06 * Math.sin(t * 0.3);
      const targetTiltX = pointerRef.current.y * tiltStrength + idleX;
      const targetTiltY = pointerRef.current.x * tiltStrength + idleY;

      card.rotation.x += (targetTiltX - card.rotation.x) * 0.09;
      card.rotation.y += (targetTiltY - card.rotation.y) * 0.09;

      const holoU = holoMat.uniforms;
      holoU.uTime.value = t;
      holoU.uMouse.value.set(
        pointerRef.current.x * 0.5 + 0.5,
        pointerRef.current.y * 0.5 + 0.5
      );

      satellites.forEach((mesh, i) => {
        const finalPos = mesh.userData.finalPos as THREE.Vector3;
        const finalRot = mesh.userData.finalRot as THREE.Euler;
        const restPos = mesh.userData.restPos as THREE.Vector3;
        const stagger = Math.max(0, exp * 1.5 - i * 0.07);
        const targetPos = new THREE.Vector3().lerpVectors(restPos, finalPos, stagger);
        mesh.position.lerp(targetPos, 0.08);
        mesh.rotation.x += (finalRot.x * stagger - mesh.rotation.x) * 0.08;
        mesh.rotation.y += (finalRot.y * stagger - mesh.rotation.y) * 0.08;
        const mat = mesh.material as THREE.MeshBasicMaterial;
        const targetOpacity = exp * (0.95 - i * 0.04);
        mat.opacity += (Math.max(0, targetOpacity) - mat.opacity) * 0.10;
      });

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      cardGeom.dispose();
      sideMat.dispose();
      frontMat.dispose();
      backMat.dispose();
      frontTex.dispose();
      backTex.dispose();
      holoGeom.dispose();
      holoMat.dispose();
      satellites.forEach((m) => {
        (m.material as THREE.Material).dispose();
        m.geometry.dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === el) {
        el.removeChild(renderer.domElement);
      }
    };
    // categoryChips stable, reducedMotion toggles rarely
  }, [reducedMotion, categoryChips]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      aria-label="3D Supercard — hover to expand categories"
      role="img"
    />
  );
}
