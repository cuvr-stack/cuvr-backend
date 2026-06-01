import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Loader2, AlertCircle, Maximize2 } from "lucide-react";
import { assetUrl } from "@/lib/utils";

interface ImmersiveViewerProps {
  imageUrl: string;
  depthUrl: string;
  height?: number;
}

const POINT_RES = 384; // 384×384 point cloud = 147,456 points
const DEPTH_SCALE = 1.6;
const CAMERA_START_Z = 2.6;

export default function ImmersiveViewer({ imageUrl, depthUrl, height = 520 }: ImmersiveViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState(true);

  useEffect(() => {
    if (hint) {
      const t = setTimeout(() => setHint(false), 4000);
      return () => clearTimeout(t);
    }
  }, [hint]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !imageUrl || !depthUrl) return;

    setLoading(true);
    setError(null);

    const W = container.clientWidth;
    const H = container.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(W, H);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080d1a);
    scene.fog = new THREE.FogExp2(0x080d1a, 0.08);

    const camera = new THREE.PerspectiveCamera(65, W / H, 0.01, 50);
    camera.position.set(0, 0, CAMERA_START_Z);

    // ── Load images and build point cloud on the CPU ──────────────────────
    let disposed = false;

    const loadImage = (src: string): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load ${src}`));
        img.src = src;
      });

    const readPixels = (img: HTMLImageElement, w: number, h: number): Uint8ClampedArray => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      return ctx.getImageData(0, 0, w, h).data;
    };

    Promise.all([loadImage(assetUrl(imageUrl)), loadImage(assetUrl(depthUrl))]).then(([colorImg, depthImg]) => {
      if (disposed) return;

      const colorPixels = readPixels(colorImg, POINT_RES, POINT_RES);
      const rawDepth = readPixels(depthImg, POINT_RES, POINT_RES);

      // 5×5 box blur on depth to remove quantization artifacts and horizontal banding
      const depthSmooth = new Float32Array(POINT_RES * POINT_RES);
      const R = 2;
      for (let y = 0; y < POINT_RES; y++) {
        for (let x = 0; x < POINT_RES; x++) {
          let sum = 0, count = 0;
          for (let dy = -R; dy <= R; dy++) {
            for (let dx = -R; dx <= R; dx++) {
              const nx = Math.min(POINT_RES - 1, Math.max(0, x + dx));
              const ny = Math.min(POINT_RES - 1, Math.max(0, y + dy));
              sum += rawDepth[(ny * POINT_RES + nx) * 4];
              count++;
            }
          }
          depthSmooth[y * POINT_RES + x] = sum / count / 255;
        }
      }

      const totalPoints = POINT_RES * POINT_RES;
      const positions = new Float32Array(totalPoints * 3);
      const colors = new Float32Array(totalPoints * 3);

      const aspect = colorImg.naturalWidth / colorImg.naturalHeight;

      for (let y = 0; y < POINT_RES; y++) {
        for (let x = 0; x < POINT_RES; x++) {
          const i = y * POINT_RES + x;
          const px = i * 4;
          const d = depthSmooth[i]; // smoothed depth 0–1

          positions[i * 3 + 0] = (x / POINT_RES - 0.5) * aspect * 3.2;
          positions[i * 3 + 1] = (0.5 - y / POINT_RES) * 3.2;
          positions[i * 3 + 2] = d * DEPTH_SCALE;

          colors[i * 3 + 0] = colorPixels[px] / 255;
          colors[i * 3 + 1] = colorPixels[px + 1] / 255;
          colors[i * 3 + 2] = colorPixels[px + 2] / 255;
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

      const material = new THREE.PointsMaterial({
        size: 0.028,
        vertexColors: true,
        sizeAttenuation: true,
        transparent: false,
      });

      const points = new THREE.Points(geometry, material);
      scene.add(points);

      if (!disposed) setLoading(false);
    }).catch((err) => {
      if (!disposed) setError(err.message ?? "Could not load images");
    });

    // ── Camera controls ───────────────────────────────────────────────────
    let isDragging = false;
    let lastX = 0, lastY = 0;
    let targetYaw = 0, targetPitch = 0;
    let currentYaw = 0, currentPitch = 0;
    let targetDolly = CAMERA_START_Z;
    let currentDolly = CAMERA_START_Z;

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      targetYaw -= dx * 0.004;
      targetPitch -= dy * 0.004;
      targetPitch = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, targetPitch));
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onPointerUp = () => { isDragging = false; };

    const onWheel = (e: WheelEvent) => {
      targetDolly -= e.deltaY * 0.005;
      targetDolly = Math.max(0.4, Math.min(CAMERA_START_Z, targetDolly));
    };

    // Touch support (two-finger pinch = dolly)
    let lastTouchDist = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        lastTouchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        targetDolly -= (dist - lastTouchDist) * 0.008;
        targetDolly = Math.max(0.4, Math.min(CAMERA_START_Z, targetDolly));
        lastTouchDist = dist;
      }
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: true });
    renderer.domElement.addEventListener("touchstart", onTouchStart, { passive: true });
    renderer.domElement.addEventListener("touchmove", onTouchMove, { passive: true });

    // ── Render loop ───────────────────────────────────────────────────────
    let animId: number;
    const euler = new THREE.Euler(0, 0, 0, "YXZ");

    const animate = () => {
      animId = requestAnimationFrame(animate);

      // Smooth interpolation
      currentYaw += (targetYaw - currentYaw) * 0.1;
      currentPitch += (targetPitch - currentPitch) * 0.1;
      currentDolly += (targetDolly - currentDolly) * 0.08;

      euler.set(currentPitch, currentYaw, 0);
      camera.rotation.copy(euler);
      camera.position.z = currentDolly;

      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [imageUrl, depthUrl]);

  return (
    <div className="relative w-full rounded-xl overflow-hidden select-none" style={{ height }}>
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ cursor: "grab" }}
        onMouseDown={(e) => (e.currentTarget.style.cursor = "grabbing")}
        onMouseUp={(e) => (e.currentTarget.style.cursor = "grab")}
      />

      {loading && !error && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ background: "rgba(15,17,23,0.92)" }}
        >
          <Loader2 className="w-10 h-10 animate-spin mb-3" style={{ color: "#00e676" }} />
          <p className="text-sm font-medium text-white">Building immersive scene…</p>
          <p className="text-xs mt-1" style={{ color: "#ffffff" }}>
            Analysing depth from every pixel
          </p>
        </div>
      )}

      {error && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ background: "rgba(15,17,23,0.9)" }}
        >
          <AlertCircle className="w-8 h-8 mb-2" style={{ color: "#ef4444" }} />
          <p className="text-sm font-medium text-white">Failed to load scene</p>
          <p className="text-xs mt-1 text-center max-w-xs" style={{ color: "#ffffff" }}>{error}</p>
        </div>
      )}

      {!loading && !error && hint && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-xs text-white pointer-events-none"
          style={{ background: "rgba(0,0,0,0.6)", whiteSpace: "nowrap" }}
        >
          Drag to look around · Scroll / pinch to walk forward
        </div>
      )}

      {!loading && !error && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
          style={{ background: "rgba(0,230,118,0.18)", border: "1px solid rgba(0,230,118,0.3)", color: "#00e676" }}>
          <Maximize2 className="w-3 h-3" />
          Immersive 3D
        </div>
      )}
    </div>
  );
}
