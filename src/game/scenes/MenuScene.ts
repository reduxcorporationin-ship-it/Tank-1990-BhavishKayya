export default class MenuScene extends Phaser.Scene {

  constructor() {
    super("MenuScene");
  }

  create() {

    const { width, height } = this.scale;

    this.add.text(width/2, height/2 - 80,
      "TANK 1990",
      { fontSize: "42px", color:"#00ff88" }
    ).setOrigin(0.5);

    this.add.text(width/2, height/2,
      "Arrow Keys - Move\nSPACE - Fire",
      { fontSize:"18px", align:"center" }
    ).setOrigin(0.5);

    this.add.text(width/2, height/2 + 80,
      "PRESS ENTER TO START",
      { fontSize:"20px", color:"#ffffff" }
    ).setOrigin(0.5);

    this.input.keyboard?.once("keydown-ENTER", () => {
      this.scene.start("GameScene");
    });
  }
}