import { useEffect, useRef } from "react";
import Game from "./game/Game";

function App() {
  const gameRef = useRef<Game | null>(null);

  useEffect(() => {
    if (!gameRef.current) {
      gameRef.current = new Game();
    }

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div
      id="game-container"
      style={{
        width: "800px",
        margin: "0 auto",
      }}
    ></div>
  );
}

export default App;