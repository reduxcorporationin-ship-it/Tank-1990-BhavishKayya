import Phaser from "phaser";
import { gameConfig } from "./config";
import GameScene from "./scenes/GameScene";
import BootScene from "./scenes/BootScene";
import PreloadScene from "./scenes/PreloadScene";
import MenuScene from "./scenes/MenuScene";

export default class Game extends Phaser.Game {
  constructor() {
    super({
      ...gameConfig,
      scene: [BootScene, PreloadScene, MenuScene, GameScene], 
    });
  }
}