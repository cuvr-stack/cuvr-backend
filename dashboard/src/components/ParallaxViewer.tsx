import { useRef, useEffect } from "react";

interface Props {
  imageUrl: string;
  height?: number;
}

/**
 * Immersive parallax viewer — mouse/touch movement shifts a slightly-zoomed
 * image to create a depth illusion. No WebGL, just smooth CSS transforms.
 */
export default function ParallaxViewer({ imageUrl, height = 480 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef       = useRef<HTMLImageElement>(null);
  const rafRef       = useRef<number>(0);
  const targetRef    = useRef({ x: 0, y: 0 });
  const currentRef   = useRef({ x: 0, y: 0 });
  const activeRef    = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      targetRef.current = {
        x: ((e.clientX - rect.left) / rect.width  - 0.5) * -5,
        y: ((e.clientY - rect.top)  / rect.height - 0.5) * -4,
      };
      activeRef.current = true;
    };

    const onTouch = (e: TouchEvent) => {
      const rect = container.getBoundingClientRect();
      const touch = e.touches[0];
      targetRef.current = {
        x: ((touch.clientX - rect.left) / rect.width  - 0.5) * -5,
        y: ((touch.clientY - rect.top)  / rect.height - 0.5) * -4,
      };
      activeRef.current = true;
    };

    const onLeave = () => {
      targetRef.current = { x: 0, y: 0 };
      activeRef.current = false;
    };

    const animate = () => {
      // Faster lerp when active, slower drift back to centre
      const t = activeRef.current ? 0.09 : 0.05;
      currentRef.current.x += (targetRef.current.x - currentRef.current.x) * t;
      currentRef.current.y += (targetRef.current.y - currentRef.current.y) * t;
      if (imgRef.current) {
        imgRef.current.style.transform =
          `scale(1.12) translate(${currentRef.current.x}%, ${currentRef.current.y}%)`;
      }
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    container.addEventListener("mousemove",  onMove);
    container.addEventListener("mouseleave", onLeave);
    container.addEventListener("touchmove",  onTouch, { passive: true });
    container.addEventListener("touchend",   onLeave);

    return () => {
      cancelAnimationFrame(rafRef.current);
      container.removeEventListener("mousemove",  onMove);
      container.removeEventListener("mouseleave", onLeave);
      container.removeEventListener("touchmove",  onTouch);
      container.removeEventListener("touchend",   onLeave);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        height,
        overflow: "hidden",
        cursor: "crosshair",
        position: "relative",
        background: "#000",
      }}
    >
      <img
        ref={imgRef}
        src={imageUrl}
        alt="Immersive view"
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: "scale(1.12) translate(0%, 0%)",
          userSelect: "none",
          pointerEvents: "none",
          willChange: "transform",
          transition: "opacity 0.4s ease",
        }}
      />

      {/* Vignette — edges darkened for immersive feel */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.6) 100%)",
          pointerEvents: "none",
        }}
      />
      {/* Bottom gradient */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 35%)",
          pointerEvents: "none",
        }}
      />
      {/* Top subtle gradient */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, transparent 20%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
