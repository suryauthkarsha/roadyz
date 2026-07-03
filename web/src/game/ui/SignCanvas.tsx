import { useEffect, useRef } from "react";
import { drawSign } from "../signs";

/** Crisp canvas-rendered road sign used by the quiz and the sticker book. */
export function SignCanvas({
  signId,
  size,
  className,
  dim = false,
}: {
  signId: string;
  size: number;
  className?: string;
  dim?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const scale = Math.min(3, window.devicePixelRatio || 1) * 1.5;
    canvas.width = size * scale;
    canvas.height = size * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawSign(ctx, signId, size * scale);
    if (dim) {
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = "rgba(10, 14, 22, 0.88)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-over";
    }
  }, [signId, size, dim]);

  return (
    <canvas
      ref={ref}
      className={className}
      style={{ width: size, height: size }}
      aria-label={dim ? "Unknown sign" : `Road sign`}
    />
  );
}
