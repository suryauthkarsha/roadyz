import { GameCanvas } from "@/game/components/GameCanvas";
import { useGameInput } from "@/game/useGameInput";
import { useGameUI } from "@/game/store";
import { MenuScreen } from "@/game/ui/MenuScreen";
import { GameHUD } from "@/game/ui/GameHUD";
import { GameOverScreen } from "@/game/ui/GameOverScreen";
import { QuizOverlay } from "@/game/ui/QuizOverlay";

const Index = () => {
  const ui = useGameUI();
  useGameInput();

  return (
    <div className="relative h-dvh w-screen select-none overflow-hidden bg-slate-950">
      <GameCanvas />
      {ui.phase === "menu" && <MenuScreen />}
      {ui.phase === "playing" && <GameHUD />}
      {ui.phase === "quiz" && <QuizOverlay />}
      {ui.phase === "over" && <GameOverScreen />}
    </div>
  );
};

export default Index;
