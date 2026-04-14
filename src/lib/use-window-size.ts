import { useEffect, useState } from "react";

export type WindowSize = {
  width: number;
  height: number;
  /** width < 1100 — collapse chrome like the sidebar */
  isCramped: boolean;
  /** width < 900 — single-column stacking, hide optional rails */
  isNarrow: boolean;
};

function readSize(): WindowSize {
  if (typeof window === "undefined") {
    return { width: 1440, height: 900, isCramped: false, isNarrow: false };
  }
  const width = window.innerWidth;
  const height = window.innerHeight;
  return {
    width,
    height,
    isCramped: width < 1100,
    isNarrow: width < 900,
  };
}

export function useWindowSize(): WindowSize {
  const [size, setSize] = useState<WindowSize>(() => readSize());

  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setSize(readSize());
      });
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return size;
}
