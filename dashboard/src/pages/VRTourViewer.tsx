/**
 * VRTourViewer — immersive WebXR tour player for CUVR
 *
 * Features:
 *  • Auto-detects 360° panoramas (aspect ≥ 1.75) → equirectangular sphere
 *  • Standard photos rendered as a large floating panel
 *  • WebXR VR mode via Three.js VRButton
 *  • Gaze navigation in VR: look at arrow disc for 2 s → advance scene
 *  • Desktop: orbit controls + arrow buttons
 *  • Scene thumbnail strip with assetUrl() mapping
 *  • Stars particle background
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { VRButton } from "three/examples/jsm/webxr/VRButton.js";
import { api } from "../lib/api";
import { assetUrl } from "../lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScenePhoto {
  id: string;
  thumbnail_url: string;
  original_url: string;
  room_label?: string;
}

interface TourScene {
  id: string;
  order: number;
  label: string;
  photo: ScenePhoto | null;
}

interface TourData {
  id: string;
  name: string;
  scenes: TourScene[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if the texture looks like a 360° equirectangular panorama. */
function isPanorama(tex: THREE.Texture): boolean {
  const img = tex.image as HTMLImageElement | HTMLCanvasElement | null;
  if (!img) return false;
  const w = "naturalWidth" in img ? img.naturalWidth : img.width;
  const h = "naturalHeight" in img ? img.naturalHeight : img.height;
  return h > 0 && w / h >= 1.75;
}

/** Build a progress-ring canvas texture (0–1 fill). */
function makeRingTexture(progress: number, size = 128): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cx = size / 2, r = size * 0.38, lw = size * 0.1;

  // track
  ctx.beginPath();
  ctx.arc(cx, cx, r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = lw;
  ctx.stroke();

  // fill
  if (progress > 0) {
    ctx.beginPath();
    ctx.arc(cx, cx, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.strokeStyle = "#00e676";
    ctx.lineWidth = lw;
    ctx.stroke();
  }

  // arrow (chevron right)
  ctx.save();
  ctx.translate(cx, cx);
  ctx.strokeStyle = "white";
  ctx.lineWidth = size * 0.06;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(-size * 0.1, -size * 0.12);
  ctx.lineTo(size * 0.1, 0);
  ctx.lineTo(-size * 0.1, size * 0.12);
  ctx.stroke();
  ctx.restore();

  return new THREE.CanvasTexture(canvas);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VRTourViewer() {
  const { token } = useParams<{ token: string }>();
  const mountRef = useRef<HTMLDivElement>(null);

  const [tour, setTour] = useState<TourData | null>(null);
  const [currentScene, setCurrentScene] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Three.js refs kept across renders
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshGroupRef = useRef<THREE.Group | null>(null);

  // Gaze navigation (VR)
  const gazeRef = useRef({
    mesh: null as THREE.Mesh | null,
    texture: null as THREE.CanvasTexture | null,
    startTime: 0,
    active: false,
    triggered: false,
  });

  // Forward the current scene index into Three.js callbacks without re-creating them
  const currentSceneRef = useRef(currentScene);
  const tourRef = useRef<TourData | null>(tour);
  useEffect(() => { currentSceneRef.current = currentScene; }, [currentScene]);
  useEffect(() => { tourRef.current = tour; }, [tour]);

  // ── Fetch tour ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    api
      .get<TourData>(`/api/tours/view/${token}`)
      .then((r) => { setTour(r.data); setLoading(false); })
      .catch(() => { setError("Tour not found or the link is invalid."); setLoading(false); });
  }, [token]);

  // ── Navigate scene helper (used by buttons AND gaze) ───────────────────────
  const goToScene = useCallback((index: number) => {
    const t = tourRef.current;
    if (!t) return;
    const scenes = [...t.scenes].sort((a, b) => a.order - b.order);
    if (index < 0 || index >= scenes.length) return;
    setCurrentScene(index);
  }, []);

  // ── Init Three.js (runs once after tour data arrives) ──────────────────────
  useEffect(() => {
    const container = mountRef.current;
    if (!container || !tour) return;

    const W = container.clientWidth;
    const H = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Stars
    const starGeo = new THREE.BufferGeometry();
    const sv: number[] = [];
    for (let i = 0; i < 3000; i++) {
      sv.push(
        (Math.random() - 0.5) * 80,
        (Math.random() - 0.5) * 80,
        (Math.random() - 0.5) * 80,
      );
    }
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(sv, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.06 })));

    // Camera
    const camera = new THREE.PerspectiveCamera(75, W / H, 0.01, 200);
    camera.position.set(0, 0, 0.01); // inside sphere
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.xr.enabled = true;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // VR Button (styled)
    const vrBtn = VRButton.createButton(renderer);
    vrBtn.style.cssText = `
      position:absolute; bottom:90px; right:20px; z-index:20;
      padding:10px 20px; border-radius:50px; border:none; cursor:pointer;
      background:linear-gradient(135deg,#00e676,#6600cc);
      color:#fff; font-size:13px; font-weight:600; letter-spacing:.5px;
      box-shadow:0 4px 20px rgba(0,230,118,0.4);
    `;
    container.appendChild(vrBtn);

    // Ambient light (for panel mode)
    scene.add(new THREE.AmbientLight(0xffffff, 2.5));

    // Mesh group
    const group = new THREE.Group();
    scene.add(group);
    meshGroupRef.current = group;

    // Gaze arrow disc (shown in VR, always at ~3 m in front)
    const discGeo = new THREE.CircleGeometry(0.18, 48);
    const initTex = makeRingTexture(0);
    const discMat = new THREE.MeshBasicMaterial({ map: initTex, transparent: true, depthWrite: false });
    const gazeMesh = new THREE.Mesh(discGeo, discMat);
    gazeMesh.position.set(1.6, -0.3, -2.8);
    gazeMesh.visible = false;
    scene.add(gazeMesh);
    gazeRef.current.mesh = gazeMesh;
    gazeRef.current.texture = initTex;

    // Orbit controls (desktop)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.rotateSpeed = -0.4; // inverted = look around
    controls.zoomSpeed = 0.5;
    controls.enablePan = false;
    controls.minDistance = 0.01;
    controls.maxDistance = 8;
    controlsRef.current = controls;

    // Raycaster for gaze detection (VR)
    const raycaster = new THREE.Raycaster();
    const center = new THREE.Vector2(0, 0);

    // Animation loop
    renderer.setAnimationLoop(() => {
      controls.update();

      // Gaze check (only when in XR session)
      if (renderer.xr.isPresenting && gazeRef.current.mesh) {
        raycaster.setFromCamera(center, camera);
        const hits = raycaster.intersectObject(gazeRef.current.mesh);

        if (hits.length > 0) {
          if (!gazeRef.current.active) {
            gazeRef.current.active = true;
            gazeRef.current.startTime = performance.now();
            gazeRef.current.triggered = false;
          }
          const elapsed = (performance.now() - gazeRef.current.startTime) / 1000;
          const progress = Math.min(elapsed / 2, 1);

          // Update ring texture
          if (gazeRef.current.texture) gazeRef.current.texture.dispose();
          const newTex = makeRingTexture(progress);
          gazeRef.current.texture = newTex;
          (gazeRef.current.mesh.material as THREE.MeshBasicMaterial).map = newTex;
          (gazeRef.current.mesh.material as THREE.MeshBasicMaterial).needsUpdate = true;

          if (progress >= 1 && !gazeRef.current.triggered) {
            gazeRef.current.triggered = true;
            const next = currentSceneRef.current + 1;
            const total = tourRef.current?.scenes.length ?? 0;
            if (next < total) {
              setCurrentScene(next);
            }
          }
        } else {
          if (gazeRef.current.active) {
            gazeRef.current.active = false;
            // Reset ring
            if (gazeRef.current.texture) gazeRef.current.texture.dispose();
            const resetTex = makeRingTexture(0);
            gazeRef.current.texture = resetTex;
            (gazeRef.current.mesh.material as THREE.MeshBasicMaterial).map = resetTex;
            (gazeRef.current.mesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
          }
        }

        // Show/hide gaze disc based on whether next scene exists
        const hasNext = currentSceneRef.current < (tourRef.current?.scenes.length ?? 0) - 1;
        gazeMesh.visible = hasNext;
      } else {
        gazeMesh.visible = false;
      }

      renderer.render(scene, camera);
    });

    // Resize handler
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      renderer.setAnimationLoop(null);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      if (container.contains(vrBtn)) container.removeChild(vrBtn);
    };
  }, [tour]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load photo mesh when scene index changes ────────────────────────────────
  useEffect(() => {
    if (!tour || !meshGroupRef.current || !sceneRef.current) return;

    const scenes = [...tour.scenes].sort((a, b) => a.order - b.order);
    const scene = scenes[currentScene];
    if (!scene?.photo) return;

    const photoUrl = assetUrl(scene.photo.original_url || scene.photo.thumbnail_url);
    if (!photoUrl) return;

    setSceneLoading(true);

    // Clear previous mesh
    const group = meshGroupRef.current;
    while (group.children.length) {
      const child = group.children[0] as THREE.Mesh;
      const mat = child.material as THREE.Material | THREE.Material[];
      (Array.isArray(mat) ? mat : [mat]).forEach((m) => m.dispose?.());
      (child.geometry as THREE.BufferGeometry).dispose?.();
      group.remove(child);
    }

    const loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";

    loader.load(
      photoUrl,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;

        if (isPanorama(tex)) {
          // ── 360° equirectangular sphere ──────────────────────────────────
          const geo = new THREE.SphereGeometry(50, 64, 32);
          geo.scale(-1, 1, 1); // flip normals — camera is inside

          const mat = new THREE.MeshBasicMaterial({ map: tex });
          const sphere = new THREE.Mesh(geo, mat);
          group.add(sphere);

          // Reset camera to look forward
          if (cameraRef.current) {
            cameraRef.current.position.set(0, 0, 0.01);
          }
          if (controlsRef.current) {
            controlsRef.current.target.set(0, 0, 0);
            controlsRef.current.minDistance = 0.01;
            controlsRef.current.maxDistance = 0.01; // locked inside sphere
            controlsRef.current.update();
          }
        } else {
          // ── Standard flat photo panel ─────────────────────────────────────
          const img = tex.image as HTMLImageElement;
          const aspect = img ? img.naturalWidth / img.naturalHeight : 16 / 9;
          const panelH = 3.2;
          const panelW = panelH * aspect;

          const geo = new THREE.PlaneGeometry(panelW, panelH);
          const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
          const panel = new THREE.Mesh(geo, mat);
          panel.position.set(0, 0, -4);
          group.add(panel);

          // Purple edge glow
          const edgeGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(panelW + 0.04, panelH + 0.04));
          const edgeMat = new THREE.LineBasicMaterial({ color: 0xbf00ff, transparent: true, opacity: 0.5 });
          const edge = new THREE.LineSegments(edgeGeo, edgeMat);
          edge.position.copy(panel.position);
          group.add(edge);

          // Reset camera for panel mode
          if (cameraRef.current) {
            cameraRef.current.position.set(0, 0, 2);
          }
          if (controlsRef.current) {
            controlsRef.current.target.set(0, 0, -4);
            controlsRef.current.minDistance = 0.5;
            controlsRef.current.maxDistance = 8;
            controlsRef.current.update();
          }
        }

        setSceneLoading(false);
      },
      undefined,
      () => setSceneLoading(false),
    );
  }, [tour, currentScene]);

  // ─── UI ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#060c1a" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            border: "4px solid #00e676", borderTopColor: "transparent",
            animation: "spin 0.8s linear infinite", margin: "0 auto 16px",
          }} />
          <p style={{ color: "white", fontWeight: 600, fontSize: 16, margin: 0 }}>Loading VR Tour…</p>
          <p style={{ color: "#ffffff", fontSize: 13, marginTop: 6 }}>Preparing your immersive experience</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#060c1a" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
          <p style={{ color: "white", fontWeight: 700, fontSize: 22, margin: "0 0 8px" }}>Tour Not Found</p>
          <p style={{ color: "#ffffff", fontSize: 14 }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!tour) return null;

  const scenes = [...tour.scenes].sort((a, b) => a.order - b.order);
  const currentLabel = scenes[currentScene]?.label ?? `Scene ${currentScene + 1}`;

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden", background: "#060c1a" }}>
      {/* Three.js canvas mount */}
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 24px",
        background: "linear-gradient(to bottom, rgba(6,12,26,0.92) 0%, transparent 100%)",
        pointerEvents: "none",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/cuvr-logo.png" alt="CUVR" style={{ height: 32, objectFit: "contain" }} />
          <div>
            <p style={{ color: "white", fontWeight: 700, fontSize: 14, margin: 0 }}>{tour.name}</p>
            <p style={{ color: "#ffffff", fontSize: 12, margin: "2px 0 0" }}>{currentLabel}</p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* 360 badge — shown when panorama (heuristic: always show for now) */}
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20,
            background: "rgba(0,188,212,0.15)", color: "#00bcd4",
            border: "1px solid rgba(0,188,212,0.3)", letterSpacing: 1,
          }}>
            360°
          </span>
          <span style={{
            fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 20,
            background: "rgba(0,230,118,0.15)", color: "#00e676",
            border: "1px solid rgba(0,230,118,0.3)",
          }}>
            {currentScene + 1} / {scenes.length}
          </span>
        </div>
      </div>

      {/* ── Scene loading spinner ─────────────────────────────────────────── */}
      {sceneLoading && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 20,
          display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            border: "4px solid #00e676", borderTopColor: "transparent",
            animation: "spin 0.8s linear infinite",
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ── Navigation arrows ─────────────────────────────────────────────── */}
      {scenes.length > 1 && (
        <>
          {currentScene > 0 && (
            <button
              onClick={() => goToScene(currentScene - 1)}
              style={{
                position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)",
                zIndex: 10, width: 48, height: 48, borderRadius: "50%", border: "none",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(0,230,118,0.2)", backdropFilter: "blur(8px)",
                boxShadow: "0 0 0 1px rgba(0,230,118,0.4), 0 4px 16px rgba(0,0,0,0.4)",
                transition: "transform 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-50%) scale(1.1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(-50%) scale(1)"; }}
            >
              <svg width="20" height="20" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          )}
          {currentScene < scenes.length - 1 && (
            <button
              onClick={() => goToScene(currentScene + 1)}
              style={{
                position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)",
                zIndex: 10, width: 48, height: 48, borderRadius: "50%", border: "none",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(0,230,118,0.2)", backdropFilter: "blur(8px)",
                boxShadow: "0 0 0 1px rgba(0,230,118,0.4), 0 4px 16px rgba(0,0,0,0.4)",
                transition: "transform 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-50%) scale(1.1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(-50%) scale(1)"; }}
            >
              <svg width="20" height="20" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )}
        </>
      )}

      {/* ── Bottom scene strip ────────────────────────────────────────────── */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 10,
        padding: "32px 16px 16px",
        background: "linear-gradient(to top, rgba(6,12,26,0.96) 0%, transparent 100%)",
      }}>
        {/* Thumbnails */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", overflowX: "auto", paddingBottom: 4 }}>
          {scenes.map((s, i) => (
            <button
              key={s.id}
              onClick={() => goToScene(i)}
              style={{
                position: "relative", flexShrink: 0, borderRadius: 10, overflow: "hidden",
                width: 80, height: 52, border: "none", padding: 0, cursor: "pointer",
                outline: i === currentScene ? "2px solid #00e676" : "2px solid rgba(255,255,255,0.08)",
                boxShadow: i === currentScene ? "0 0 14px rgba(0,230,118,0.6)" : "none",
                opacity: i === currentScene ? 1 : 0.55,
                transition: "opacity 0.2s, box-shadow 0.2s",
              }}
              onMouseEnter={(e) => { if (i !== currentScene) e.currentTarget.style.opacity = "0.85"; }}
              onMouseLeave={(e) => { if (i !== currentScene) e.currentTarget.style.opacity = "0.55"; }}
            >
              {s.photo?.thumbnail_url ? (
                <img
                  src={assetUrl(s.photo.thumbnail_url)}
                  alt={s.label}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              ) : (
                <div style={{ width: "100%", height: "100%", background: "rgba(0,230,118,0.1)" }} />
              )}
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0,
                padding: "2px 4px", textAlign: "center",
                background: "rgba(0,0,0,0.65)", fontSize: 8, color: "white",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {s.label}
              </div>
            </button>
          ))}
        </div>

        {/* Hint text */}
        <p style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.28)", margin: "8px 0 0" }}>
          Drag to look around · Scroll to zoom · Click <span style={{ color: "#00e676" }}>Enter VR</span> for headset · In VR: gaze at arrow to advance
        </p>
      </div>
    </div>
  );
}
