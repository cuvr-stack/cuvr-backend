/**
 * FloorPlanViewer.tsx
 * Renders the floor-plan GLB as a single scene primitive.
 * Raycasting detects which room was clicked → side panel shows FLUX photo.
 * Materials are updated imperatively (primitives don't accept JSX children).
 * Camera smoothly flies to selected room when chosen from the right panel.
 */

import { Suspense, useRef, useState, useEffect, useCallback } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, Center, Html } from "@react-three/drei";
import { X, Maximize2, RotateCcw } from "lucide-react";
import * as THREE from "three";

// ── Types ─────────────────────────────────────────────────────────────────────
type NavNode = {
  nodeId: string;
  roomId: string;
  label: string;
  textureUrl: string;
};

type FlyTarget = { center: THREE.Vector3; radius: number } | null;

// Shared handle exposed by Scene to the parent (outside Canvas)
type SceneHandle = {
  getRoomBBox: (roomId: string) => THREE.Box3 | null;
};

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// ── Scene ─────────────────────────────────────────────────────────────────────
function Scene({
  url,
  selectedRoomId,
  onRoomClick,
  flyTargetRef,
  flyTick,
  controlsRef,
  handleRef,
}: {
  url: string;
  selectedRoomId: string | null;
  onRoomClick: (roomId: string | null) => void;
  flyTargetRef: React.MutableRefObject<FlyTarget>;
  flyTick: number;
  controlsRef: React.MutableRefObject<any>;
  handleRef: React.MutableRefObject<SceneHandle | null>;
}) {
  const { scene } = useGLTF(url);
  const { camera, gl } = useThree();
  const sceneRef = useRef<THREE.Group>(null);

  const baseMatsRef  = useRef<Map<string, THREE.MeshStandardMaterial>>(new Map());
  const meshIndexRef = useRef<Map<string, string>>(new Map()); // mesh uuid → roomId
  const roomBBoxRef  = useRef<Map<string, THREE.Box3>>(new Map()); // roomId → bbox

  // Fly-to animation state
  const flyingRef      = useRef(false);
  const flyProgressRef = useRef(0);
  const flyFromCamRef  = useRef(new THREE.Vector3());
  const flyFromTgtRef  = useRef(new THREE.Vector3());
  const flyToCamRef    = useRef(new THREE.Vector3());
  const flyToTgtRef    = useRef(new THREE.Vector3());

  // ── Build materials & bbox map once ─────────────────────────────────────
  useEffect(() => {
    roomBBoxRef.current.clear();

    scene.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      mesh.castShadow    = true;
      mesh.receiveShadow = true;

      // mesh_0000 / mesh_0001 both → room_0, mesh_0002 / mesh_0003 → room_1 …
      const match = mesh.name.match(/mesh_(\d+)/);
      if (match) {
        const roomIdx = Math.floor(parseInt(match[1], 10) / 2);
        const roomId  = `room_${roomIdx}`;
        meshIndexRef.current.set(mesh.uuid, roomId);

        // Accumulate world-space bounding box per room
        const box = new THREE.Box3().setFromObject(mesh);
        if (roomBBoxRef.current.has(roomId)) {
          roomBBoxRef.current.get(roomId)!.union(box);
        } else {
          roomBBoxRef.current.set(roomId, box.clone());
        }
      }

      if (!baseMatsRef.current.has(mesh.uuid)) {
        const mat = new THREE.MeshStandardMaterial({
          vertexColors:        true,
          side:                THREE.DoubleSide,
          roughness:           0.75,
          metalness:           0.02,
          polygonOffset:       true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits:  1,
        });
        baseMatsRef.current.set(mesh.uuid, mat);
        mesh.material = mat;
      }
    });

    // Expose bbox lookup to parent (outside Canvas)
    handleRef.current = {
      getRoomBBox: (roomId) => roomBBoxRef.current.get(roomId) ?? null,
    };
  }, [scene, handleRef]);

  // ── Emissive highlight on selection change ────────────────────────────────
  useEffect(() => {
    scene.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      const mat  = baseMatsRef.current.get(mesh.uuid);
      if (!mat) return;
      const roomId     = meshIndexRef.current.get(mesh.uuid);
      const isSelected = !!selectedRoomId && roomId === selectedRoomId;
      mat.emissive.set(isSelected ? 0x00e676 : 0x000000);
      mat.emissiveIntensity = isSelected ? 0.6 : 0;
      mat.needsUpdate = true;
    });
  }, [selectedRoomId, scene]);

  // ── Kick off fly-to animation when flyTick increments ────────────────────
  useEffect(() => {
    if (!flyTargetRef.current) return;
    const { center, radius } = flyTargetRef.current;

    flyFromCamRef.current.copy(camera.position);
    flyFromTgtRef.current.copy(
      controlsRef.current?.target ?? new THREE.Vector3(),
    );

    // Destination: a bit above and behind the room center
    flyToCamRef.current.set(
      center.x,
      center.y + radius * 1.8,
      center.z + radius * 2.4,
    );
    flyToTgtRef.current.copy(center);

    flyProgressRef.current = 0;
    flyingRef.current      = true;
    flyTargetRef.current   = null; // consume
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTick]);

  // ── Per-frame lerp animation ──────────────────────────────────────────────
  useFrame((_, delta) => {
    if (!flyingRef.current) return;
    flyProgressRef.current = Math.min(flyProgressRef.current + delta * 2.0, 1);
    const t = easeInOut(flyProgressRef.current);

    camera.position.lerpVectors(flyFromCamRef.current, flyToCamRef.current, t);

    if (controlsRef.current) {
      controlsRef.current.target.lerpVectors(flyFromTgtRef.current, flyToTgtRef.current, t);
      controlsRef.current.update();
    }

    if (flyProgressRef.current >= 1) flyingRef.current = false;
  });

  // ── Canvas click → raycast → room selection ───────────────────────────────
  const handleClick = useCallback(
    (e: MouseEvent) => {
      if (!sceneRef.current) return;
      const rect  = gl.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width)  * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const ray  = new THREE.Raycaster();
      ray.setFromCamera(mouse, camera);
      const hits = ray.intersectObjects(sceneRef.current.children, true);
      if (!hits.length) { onRoomClick(null); return; }
      const mesh   = hits[0].object as THREE.Mesh;
      const roomId = meshIndexRef.current.get(mesh.uuid) ?? null;
      onRoomClick(roomId);
    },
    [camera, gl, onRoomClick],
  );

  useEffect(() => {
    const canvas = gl.domElement;
    canvas.addEventListener("click", handleClick);
    return () => canvas.removeEventListener("click", handleClick);
  }, [gl, handleClick]);

  return (
    <Center>
      <group ref={sceneRef}>
        <primitive object={scene} />
      </group>
    </Center>
  );
}

// ── Loading fallback ──────────────────────────────────────────────────────────
function LoadingFallback() {
  return (
    <Html center>
      <div style={{ color: "#00e676", fontSize: 14, textAlign: "center" }}>
        <div style={{
          width: 32, height: 32,
          border: "2px solid rgba(0,230,118,0.3)",
          borderTop: "2px solid #00e676",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
          margin: "0 auto 8px",
        }} />
        Loading 3D model…
      </div>
    </Html>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface FloorPlanViewerProps {
  glbUrl: string;
  filename: string;
  navNodes?: NavNode[];
  onClose: () => void;
  /** Called with the selected room's texture URL + label (or undefined if no room selected) */
  onSketchRender?: (roomImageUrl?: string, roomLabel?: string) => void;
}

export default function FloorPlanViewer({
  glbUrl,
  filename,
  navNodes = [],
  onClose,
  onSketchRender,
}: FloorPlanViewerProps) {
  const controlsRef  = useRef<any>(null);
  const handleRef    = useRef<SceneHandle | null>(null);
  const flyTargetRef = useRef<FlyTarget>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flyTick, setFlyTick]       = useState(0);

  const roomMap      = Object.fromEntries(navNodes.map((n) => [n.roomId, n]));
  const selectedNode = selectedId ? roomMap[selectedId] : null;

  // Select a room AND fly the camera to it
  const selectAndFly = useCallback((roomId: string) => {
    setSelectedId(roomId);

    requestAnimationFrame(() => {
      const bbox = handleRef.current?.getRoomBBox(roomId);
      if (!bbox) return;

      const center = new THREE.Vector3();
      bbox.getCenter(center);
      const size   = new THREE.Vector3();
      bbox.getSize(size);
      const radius = Math.max(size.x, size.y, size.z) * 0.5 + 2;

      flyTargetRef.current = { center, radius };
      setFlyTick((t) => t + 1);
    });
  }, []);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "#080d1a",
      display: "flex", flexDirection: "column",
    }}>

      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 20px", flexShrink: 0,
        background: "rgba(10,15,26,0.98)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Maximize2 size={16} color="#00e676" />
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#fff" }}>{filename}</p>
            <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
              {navNodes.length} rooms · Click a room to preview interior
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => controlsRef.current?.reset()} style={{
            padding: "6px 12px", borderRadius: 8, border: "none",
            background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 12,
          }}>
            <RotateCcw size={13} /> Reset
          </button>
          {onSketchRender && (
            <button
              onClick={() => onSketchRender(selectedNode?.textureUrl, selectedNode?.label)}
              style={{
                padding: "6px 16px", borderRadius: 8, border: "none",
                background: "linear-gradient(135deg,#00e676,#00c362)",
                color: "#000", fontWeight: 700, fontSize: 12, cursor: "pointer",
              }}
              title={selectedNode ? `Sketch render: ${selectedNode.label}` : "Sketch render floor plan"}
            >
              🎨 {selectedNode ? `Redesign ${selectedNode.label}` : "Sketch Render"}
            </button>
          )}
          <button onClick={onClose} style={{
            padding: "6px 10px", borderRadius: 8, border: "none",
            background: "rgba(239,68,68,0.12)", color: "#ef4444", cursor: "pointer",
            display: "flex", alignItems: "center",
          }}>
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>

        {/* Canvas */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, position: "relative", overflow: "hidden" }}>
          <Canvas
            camera={{ position: [0, 12, 16], fov: 48 }}
            style={{ background: "#080d1a", display: "block", width: "100%", height: "100%" }}
            gl={{ antialias: true }}
            shadows
          >
            <ambientLight intensity={1.4} />
            <directionalLight position={[8, 14, 8]} intensity={1.2} castShadow />
            <directionalLight position={[-6, 8, -6]} intensity={0.5} />
            <gridHelper args={[60, 60, "#111827", "#111827"]} />
            <Suspense fallback={<LoadingFallback />}>
              <Scene
                url={glbUrl}
                selectedRoomId={selectedId}
                onRoomClick={setSelectedId}
                flyTargetRef={flyTargetRef}
                flyTick={flyTick}
                controlsRef={controlsRef}
                handleRef={handleRef}
              />
            </Suspense>
            <OrbitControls
              ref={controlsRef}
              enableDamping dampingFactor={0.07}
              minDistance={1} maxDistance={80}
              maxPolarAngle={Math.PI / 1.8}
            />
          </Canvas>

          <div style={{
            position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)",
            borderRadius: 20, padding: "6px 16px",
            fontSize: 11, color: "rgba(255,255,255,0.5)", pointerEvents: "none",
          }}>
            Drag · orbit &nbsp;|&nbsp; Scroll · zoom &nbsp;|&nbsp; Click room · preview
          </div>
        </div>

        {/* ── Side panel (selected) ── */}
        {selectedNode ? (
          <div style={{
            width: "520px", flexShrink: 0,
            background: "rgba(10,15,26,0.98)",
            borderLeft: "1px solid rgba(255,255,255,0.08)",
            display: "flex", flexDirection: "column",
          }}>
            {/* Panel header */}
            <div style={{
              padding: "14px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#fff" }}>
                  {selectedNode.label}
                </p>
                <p style={{ margin: "2px 0 0", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                  AI Interior Preview
                </p>
              </div>
              <button onClick={() => setSelectedId(null)} style={{
                background: "none", border: "none", cursor: "pointer",
                color: "rgba(255,255,255,0.4)", lineHeight: 1,
              }}>
                <X size={14} />
              </button>
            </div>

            {/* FLUX photo */}
            <div style={{ position: "relative", aspectRatio: "16/10", flexShrink: 0, overflow: "hidden" }}>
              {selectedNode.textureUrl ? (
                <img src={selectedNode.textureUrl} alt={selectedNode.label}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{
                  width: "100%", height: "100%", background: "rgba(255,255,255,0.03)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "rgba(255,255,255,0.3)", fontSize: 12,
                }}>
                  No preview
                </div>
              )}
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0,
                padding: "24px 14px 12px",
                background: "linear-gradient(transparent, rgba(0,0,0,0.75))",
              }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#fff" }}>
                  {selectedNode.label}
                </p>
              </div>
            </div>

            {/* Room list */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {navNodes.map((n) => (
                <button key={n.roomId} onClick={() => selectAndFly(n.roomId)} style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px", border: "none", cursor: "pointer", textAlign: "left",
                  background: selectedId === n.roomId ? "rgba(0,230,118,0.08)" : "transparent",
                  borderLeft: selectedId === n.roomId ? "3px solid #00e676" : "3px solid transparent",
                  transition: "background 0.15s",
                }}>
                  {n.textureUrl ? (
                    <img src={n.textureUrl} alt={n.label}
                      style={{ width: 56, height: 40, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 56, height: 40, borderRadius: 6, background: "rgba(255,255,255,0.05)", flexShrink: 0 }} />
                  )}
                  <span style={{
                    fontSize: 13, flex: 1, minWidth: 0,
                    color: selectedId === n.roomId ? "#00e676" : "rgba(255,255,255,0.85)",
                    fontWeight: selectedId === n.roomId ? 600 : 400,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {n.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

        ) : (
          /* ── Collapsed thumbnail strip ── */
          navNodes.length > 0 && (
            <div style={{
              width: "110px", flexShrink: 0,
              background: "rgba(10,15,26,0.98)",
              borderLeft: "1px solid rgba(255,255,255,0.08)",
              display: "flex", flexDirection: "column", alignItems: "center",
              gap: 6, padding: "12px 8px", overflowY: "auto",
            }}>
              <p style={{
                margin: "0 0 6px", fontSize: 10, fontWeight: 700,
                color: "rgba(255,255,255,0.3)", letterSpacing: 1, textTransform: "uppercase",
              }}>
                Rooms
              </p>
              {navNodes.map((n) => (
                <button key={n.roomId} onClick={() => selectAndFly(n.roomId)}
                  title={n.label}
                  style={{
                    width: "100%", border: "none", cursor: "pointer",
                    borderRadius: 8, overflow: "hidden", background: "rgba(255,255,255,0.05)",
                    flexShrink: 0, padding: 0,
                  }}>
                  {n.textureUrl ? (
                    <img src={n.textureUrl} alt={n.label}
                      style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", display: "block" }} />
                  ) : (
                    <div style={{ width: "100%", aspectRatio: "4/3", background: "rgba(255,255,255,0.04)" }} />
                  )}
                </button>
              ))}
            </div>
          )
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
