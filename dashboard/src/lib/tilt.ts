import React from "react";

/** Spread onto any card div to get the 3-D perspective tilt on hover */
export const tilt: React.HTMLAttributes<HTMLDivElement> = {
  onMouseMove: (e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width  - 0.5) * 14;
    const y = -((e.clientY - rect.top)  / rect.height - 0.5) * 14;
    el.style.transform = `perspective(900px) rotateY(${x}deg) rotateX(${y}deg) translateZ(8px)`;
    el.style.transition = "transform 0.08s ease-out";
    el.style.willChange = "transform";
  },
  onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.transform =
      "perspective(900px) rotateY(0deg) rotateX(0deg) translateZ(0px)";
    e.currentTarget.style.transition = "transform 0.5s ease-out";
    e.currentTarget.style.willChange = "auto";
  },
};
