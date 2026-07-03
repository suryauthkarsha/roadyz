import { useEffect } from "react";
import { playerInput } from "./runtime";

/** Keyboard + touch swipe controls. Attach once at the game root. */
export function useGameInput(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case "ArrowLeft":
        case "KeyA":
          playerInput.moveLane(-1);
          break;
        case "ArrowRight":
        case "KeyD":
          playerInput.moveLane(1);
          break;
        case "ArrowUp":
        case "KeyW":
        case "Space":
          e.preventDefault();
          playerInput.jump();
          break;
        case "ArrowDown":
        case "KeyS":
          playerInput.slide();
          break;
        default:
          break;
      }
    };

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      touchStartTime = performance.now();
    };

    const onTouchEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;
      const elapsed = performance.now() - touchStartTime;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (absX < 24 && absY < 24 && elapsed < 260) {
        playerInput.jump();
        return;
      }
      if (absX > absY) {
        playerInput.moveLane(dx > 0 ? 1 : -1);
      } else if (dy < 0) {
        playerInput.jump();
      } else {
        playerInput.slide();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, []);
}
