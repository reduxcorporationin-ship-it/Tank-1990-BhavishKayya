import Phaser from "phaser";

export default class PreloadScene extends Phaser.Scene {

  constructor() {
    super("PreloadScene");
  }

  preload() {

    const loadingText = this.add.text(260, 280, "Loading Assets...", {
      color: "#ffffff",
      fontSize: "22px"
    });

    const progressBar = this.add.graphics();

    this.load.on("progress", (value: number) => {
      progressBar.clear();
      progressBar.fillStyle(0xffffff, 1);
      progressBar.fillRect(200, 320, 400 * value, 20);
    });

    this.load.on("complete", () => {
      loadingText.setText("Loading Complete");
    });

    this.load.spritesheet(
      "explosion",
      "assets/explosion_big_sheet.png",
      {
        frameWidth: 64,
        frameHeight: 64
      }
    );

    this.load.image("player",      "assets/player_tank_base.png");
    this.load.image("enemy_basic", "assets/enemy_basic.png");
    this.load.image("bullet",      "assets/bullet_small.png");
    this.load.image("tiles",       "assets/Tileset.png");
    this.load.image("muzzleflash", "assets/muzzle_flash.png");
    this.load.image("tileset",     "assets/Tileset.png");

    this.load.tilemapTiledJSON("level1", "assets/level1.json");
    this.load.tilemapTiledJSON("level2", "assets/level2.json"); // ← ADDED
    this.load.tilemapTiledJSON("level3", "assets/level3.json"); // ← ADDED (ready for when you make it)
  }

  create() {
    this.anims.create({
      key: "explode",
      frames: this.anims.generateFrameNumbers("explosion", {
        start: 0,
        end: 15
      }),
      frameRate: 20,
      repeat: 0
    });

    this.scene.start("MenuScene");
  }
}