import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Loader2 } from "lucide-react";

interface MeshViewerProps {
  imageUrl: string;
  depthUrl: string;
}

export default function MeshViewer({ imageUrl, depthUrl }: MeshViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setLoading(true);
    setError(null);

    const W = container.clientWidth;
    const H = container.clientHeight;

    // Scene + camera
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080d1a);

    const camera = new THREE.PerspectiveCamera(55, W / H, 0.001, 100);
    camera.position.set(0, 0, 1.4);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(W, H);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // Orbit controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(0, 0, 0);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 2));
    const dir = new THREE.DirectionalLight(0xffffff, 1);
    dir.position.set(2, 3, 4);
    scene.add(dir);

    const loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";

    Promise.all([
      new Promise<THREE.Texture>((res, rej) => loader.load(imageUrl, res, undefined, rej)),
      new Promise<THREE.Texture>((res, rej) => loader.load(depthUrl, res, undefined, rej)),
    ])
      .then(([colorTex, depthTex]) => {
        colorTex.colorSpace = THREE.SRGBColorSpace;

        // High-res plane with displacement from depth map
        const segments = 256;
        const geo = new THREE.PlaneGeometry(1.6, 1.6, segments, segments);

        const mat = new THREE.MeshStandardMaterial({
          map: colorTex,
          displacementMap: depthTex,
          displacementScale: 0.25,
          displacementBias: -0.05,
          roughness: 0.8,
          metalness: 0.0,
        });

        const mesh = new THREE.Mesh(geo, mat);
        scene.add(mesh);
        setLoading(false);
      })
      .catch((err) => {
        console.error("MeshViewer load error", err);
        setError("Could not load images. Make sure the backend is running.");
        setLoading(false);
      });

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

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [imageUrl, depthUrl]);

  return (
    <div className="relative w-full" style={{ height: "480px" }}>
      <div ref={containerRef} className="w-full h-full" />
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: "rgba(15,17,23,0.9)" }}>
          <Loader2 className="w-8 h-8 animate-spin mb-2" style={{ color: "#00e676" }} />
          <p className="text-sm" style={{ color: "#ffffff" }}>Building 3D mesh...</p>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: "rgba(15,17,23,0.9)" }}>
          <p className="text-sm font-medium" style={{ color: "#ef4444" }}>{error}</p>
        </div>
      )}
    </div>
  );
}
