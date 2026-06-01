import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LumaSplatsThree } from "@lumaai/luma-web";
import { Loader2, AlertCircle } from "lucide-react";

interface SplatViewerProps {
  /** Luma AI scene URL e.g. https://lumalabs.ai/capture/xxx  OR a direct .splat file URL */
  src: string;
  height?: number;
}

export default function SplatViewer({ src, height = 520 }: SplatViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !src) return;

    setLoading(true);
    setError(null);

    const W = container.clientWidth;
    const H = container.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(W, H);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080d1a);

    const camera = new THREE.PerspectiveCamera(75, W / H, 0.1, 1000);
    camera.position.set(0, 0, 5);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Load Luma splat
    const splat = new LumaSplatsThree({ source: src });
    splat.onLoad = () => setLoading(false);
    scene.add(splat);

    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
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

    // Timeout fallback — if not loaded in 30s show error
    const timeout = setTimeout(() => {
      if (loading) setError("Scene took too long to load. Check your Luma AI URL.");
    }, 30000);

    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [src]);

  return (
    <div className="relative w-full rounded-xl overflow-hidden" style={{ height }}>
      <div ref={containerRef} className="w-full h-full" />
      {loading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ background: "rgba(15,17,23,0.9)" }}>
          <Loader2 className="w-10 h-10 animate-spin mb-3" style={{ color: "#00e676" }} />
          <p className="text-sm font-medium text-white">Loading Gaussian Splat...</p>
          <p className="text-xs mt-1" style={{ color: "#ffffff" }}>This may take a moment</p>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ background: "rgba(15,17,23,0.9)" }}>
          <AlertCircle className="w-8 h-8 mb-2" style={{ color: "#ef4444" }} />
          <p className="text-sm font-medium text-white">Failed to load scene</p>
          <p className="text-xs mt-1 text-center max-w-xs" style={{ color: "#ffffff" }}>{error}</p>
        </div>
      )}
    </div>
  );
}
