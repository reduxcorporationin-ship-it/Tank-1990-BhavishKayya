import Phaser from "phaser";

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: "game-container",
  backgroundColor: "#111111",
  pixelArt: true,
  physics: {
    default: "arcade",
    arcade: { debug: false }
  }
};