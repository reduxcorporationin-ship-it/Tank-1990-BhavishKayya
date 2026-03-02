import Phaser from "phaser";

type EnemyType = {
  key:      string;
  speed:    number;
  fireRate: number;
  hp:       number;
  tint:     number;
};

type Direction = "up" | "down" | "left" | "right";
const DIRS: Direction[] = ["up", "down", "left", "right"];

const BULLET_SPEED        = 320;
const ENEMY_BULLET_SPEED  = 200;
const PLAYER_MAX_SPEED    = 110;
const PLAYER_ACCEL        = 14;
const PLAYER_DRAG         = 12;

const TANK_SCALE     = 0.13;
const TANK_BODY_SIZE = 20;

const ENEMY_TYPES: EnemyType[] = [
  { key: "enemy_basic", speed: 50,  fireRate: 2200, hp: 1, tint: 0xff4444 },
  { key: "enemy_fast",  speed: 85,  fireRate: 2600, hp: 1, tint: 0xff9900 },
  { key: "enemy_heavy", speed: 55,  fireRate: 2400, hp: 3, tint: 0xaa44ff },
];

type PowerUpKind = "star" | "shield" | "bomb" | "extraLife" | "timer";
const POWERUP_KINDS: PowerUpKind[] = ["star", "shield", "bomb", "extraLife", "timer"];
const POWERUP_COLORS: Record<PowerUpKind, number> = {
  star:       0xffdd00,
  shield:     0x44aaff,
  bomb:       0xff5500,
  extraLife:  0xff4466,
  timer:      0xcc88ff,
};
const POWERUP_LETTERS: Record<PowerUpKind, string> = {
  star:       "S",
  shield:     "P",
  bomb:       "B",
  extraLife:  "L",
  timer:      "T",
};


const LEVEL_CONFIGS = [
  { mapKey: "level1", enemies: 5  },
  { mapKey: "level2", enemies: 10 },
  { mapKey: "level3", enemies: 15 },
];

export default class GameScene extends Phaser.Scene {

  private bullets!:      Phaser.GameObjects.Group;
  private enemyBullets!: Phaser.GameObjects.Group;
  private enemies!:      Phaser.Physics.Arcade.Group;

  private breakableLayer!: Phaser.Tilemaps.TilemapLayer;
  private steelLayer!:     Phaser.Tilemaps.TilemapLayer;
  private mapWidthPx  = 0;
  private mapHeightPx = 0;

  private player!:       Phaser.Physics.Arcade.Sprite;
  private eagle!:        Phaser.Physics.Arcade.Sprite;
  private shieldSprite?: Phaser.GameObjects.Sprite;

  private eagleZone!: Phaser.Geom.Rectangle;

  private cursors!:  Phaser.Types.Input.Keyboard.CursorKeys;
  private fireKey!:  Phaser.Input.Keyboard.Key;

  private playerAlive        = true;
  private playerInvulnerable = false;
  private playerBulletActive = false;
  private fireCooldown       = false;
  private moveSpeed          = 0;
  private playerSpawn        = new Phaser.Math.Vector2();

  private playerHitFlashing  = false;

  private score         = 0;
  private lives         = 3;
  private gameEnded     = false;
  private levelFinished = false;

  private spawnPoints: Phaser.Math.Vector2[] = [];
  private enemiesAlive   = 0;
  private enemiesToSpawn = 20;

  private enemyTimers       = new Map<Phaser.Physics.Arcade.Sprite, Phaser.Time.TimerEvent>();
  private enemyFireCooldown = new WeakMap<Phaser.Physics.Arcade.Sprite, boolean>();

  private hudText!: Phaser.GameObjects.Text;

  private currentLevel = 0;

  private powerUps!: Phaser.GameObjects.Group;
  private enemiesFrozen    = false;
  private playerSpeedBoost = false;
  private activeBulletSpeed  = BULLET_SPEED;
  private activeMoveMaxSpeed = PLAYER_MAX_SPEED;

  constructor() { super("GameScene"); }

  
  create() {
    this.cameras.main.setBackgroundColor("#000000");

    this.currentLevel       = this.registry.get("currentLevel") ?? 0;
    this.enemiesFrozen      = false;
    this.playerSpeedBoost   = false;
    this.activeBulletSpeed  = BULLET_SPEED;
    this.activeMoveMaxSpeed = PLAYER_MAX_SPEED;
    this.levelFinished      = false;
    this.gameEnded          = false;

    this.score = this.registry.get("score") ?? 0;
    this.lives = this.registry.get("lives") ?? 3;
    this.enemiesAlive       = 0;
    this.playerAlive        = true;
    this.playerBulletActive = false;
    this.fireCooldown       = false;
    this.playerInvulnerable = false;
    this.playerHitFlashing  = false;
    this.moveSpeed          = 0;
    this.enemyTimers.clear();

    const levelCfg = LEVEL_CONFIGS[this.currentLevel] ?? LEVEL_CONFIGS[0];

    const map     = this.make.tilemap({ key: levelCfg.mapKey });
    const tileset = map.addTilesetImage("tank_tiles", "tileset");

    if (!tileset) {
      console.error(
        `[GameScene] Failed to load tileset for "${levelCfg.mapKey}". ` +
        `Make sure the tilemap was exported from Tiled with an EMBEDDED tileset ` +
        `(right-click tileset → Embed Tileset → re-export).`
      );
      return; 
    }

    map.createLayer("grass", tileset, 0, 0);
    this.breakableLayer = map.createLayer("breakable_brick", tileset, 0, 0)!;
    this.steelLayer     = map.createLayer("steel_wall",      tileset, 0, 0)!;

    this.breakableLayer.setCollisionByExclusion([-1]);
    this.steelLayer.setCollisionByExclusion([-1]);
    this.breakableLayer.setDepth(2);
    this.steelLayer.setDepth(2);

    this.mapWidthPx  = map.widthInPixels;
    this.mapHeightPx = map.heightInPixels;

    this.physics.world.setBounds(0, 0, this.mapWidthPx, this.mapHeightPx);
    this.cameras.main.setBounds(0, 0, this.mapWidthPx, this.mapHeightPx);

    this.bullets      = this.add.group();
    this.enemyBullets = this.add.group();
    this.powerUps     = this.add.group();

    this.enemies = this.physics.add.group({
      classType: Phaser.Physics.Arcade.Sprite,
      runChildUpdate: false,
    });

    const spawnX = 96;
    const spawnY = this.mapHeightPx - 96;
    this.playerSpawn.set(spawnX, spawnY);

    this.player = this.physics.add.sprite(spawnX, spawnY, "player");
    this.player.setScale(TANK_SCALE).setCollideWorldBounds(true).setDepth(5);
    const pb = this.player.body as Phaser.Physics.Arcade.Body;
    pb.setSize(TANK_BODY_SIZE, TANK_BODY_SIZE, true);
    pb.setAllowGravity(false);
    pb.setMaxVelocity(200, 200);

    const eaglePos = this.getEaglePosition();

    this.eagle = this.physics.add.sprite(eaglePos.x, eaglePos.y, "player");
    this.eagle.setScale(TANK_SCALE)
              .setTint(0xffdd00)   
              .setImmovable(true)
              .setDepth(6);
    (this.eagle.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    (this.eagle.body as Phaser.Physics.Arcade.Body).setSize(TANK_BODY_SIZE, TANK_BODY_SIZE, true);

    this.add.text(eaglePos.x, eaglePos.y - 18, "BASE", {
      fontSize: "9px", fontStyle: "bold",
      color: "#ffdd00", stroke: "#000000", strokeThickness: 2,
    }).setOrigin(0.5).setDepth(7);

    this.eagleZone = new Phaser.Geom.Rectangle(
      eaglePos.x - 32,
      eaglePos.y - 32,
      64,
      64
    );

    this.cameras.main.startFollow(this.player, true, 0.09, 0.09);
    this.cameras.main.setDeadzone(160, 120);

    this.hudText = this.add.text(10, 10, "", {
      fontSize: "14px", color: "#ffffff",
      stroke: "#000000", strokeThickness: 3,
    }).setScrollFactor(0).setDepth(200);

    this.spawnPoints = this.buildSpawnPoints(map);

    this.enemiesToSpawn = levelCfg.enemies;

    this.physics.add.collider(this.player,  this.breakableLayer);
    this.physics.add.collider(this.player,  this.steelLayer);
    this.physics.add.collider(this.player,  this.eagle);
    this.physics.add.collider(this.enemies, this.breakableLayer);
    this.physics.add.collider(this.enemies, this.steelLayer);
    this.physics.add.collider(this.enemies, this.eagle);
    this.physics.add.collider(this.enemies, this.player);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.fireKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.time.addEvent({
      delay: 2500, loop: true,
      callback: this.trySpawnEnemy, callbackScope: this,
    });

    this.trySpawnAtPoint(this.spawnPoints[0]);
    this.trySpawnAtPoint(this.spawnPoints[1]);
    this.trySpawnAtPoint(this.spawnPoints[2]);

    this.playerInvulnerable = true;
    this.shieldSprite?.destroy();
    this.shieldSprite = this.add.sprite(this.player.x, this.player.y, "shield").setDepth(10);
    try { this.shieldSprite.play("shield_anim"); } catch { /* optional */ }
    this.time.delayedCall(2000, () => {
      this.playerInvulnerable = false;
      this.shieldSprite?.destroy();
      this.shieldSprite = undefined;
    });

    this.showLevelIntro(this.currentLevel + 1);
  }


  update() {
    if (this.gameEnded) return;

    if (this.playerAlive) {
      this.handlePlayerMovement();
      if (Phaser.Input.Keyboard.JustDown(this.fireKey)) this.fireBullet();
    } else {
      this.player.setVelocity(0, 0);
    }

    this.enemies.children.each((obj) => {
      const e = obj as Phaser.Physics.Arcade.Sprite;
      if (e.active) {
        if (!this.enemiesFrozen) this.updateEnemyAI(e);
        else e.setVelocity(0, 0);
      }
      return true;
    });

    this.checkBulletCollisions();
    this.cleanupBullets();

    if (this.playerAlive) this.checkPowerUpPickup();

    if (this.shieldSprite && this.player.active) {
      this.shieldSprite.setPosition(this.player.x, this.player.y);
    }

    this.hudText.setText(
      `♥ ${this.lives}   Score: ${this.score}   Lv: ${this.currentLevel + 1}   ` +
      `Left: ${this.enemiesToSpawn}   On: ${this.enemiesAlive}` +
      (this.enemiesFrozen    ? "  [FROZEN]" : "") +
      (this.playerSpeedBoost ? "  [STAR]"   : "")
    );

    if (!this.levelFinished && this.enemiesToSpawn === 0 && this.enemiesAlive === 0) {
      this.levelFinished = true;
      this.levelComplete();
    }
  }


  private handlePlayerMovement() {
    const L = this.cursors.left?.isDown;
    const R = this.cursors.right?.isDown;
    const U = this.cursors.up?.isDown;
    const D = this.cursors.down?.isDown;
    const moving = L || R || U || D;

    this.moveSpeed = Phaser.Math.Clamp(
      this.moveSpeed + (moving ? PLAYER_ACCEL : -PLAYER_DRAG),
      0, this.activeMoveMaxSpeed
    );

    let vx = 0, vy = 0;
    if (L) { vx = -1; this.player.setAngle(-90); }
    if (R) { vx =  1; this.player.setAngle(90);  }
    if (U) { vy = -1; vx = 0; this.player.setAngle(0);   }
    else if (D) { vy = 1; vx = 0; this.player.setAngle(180); }

    if (vx !== 0 || vy !== 0) {
      const v = new Phaser.Math.Vector2(vx, vy).normalize().scale(this.moveSpeed);
      this.player.setVelocity(v.x, v.y);
    } else if (!moving) {
      this.player.setVelocity(0, 0);
    }
  }

   private fireBullet() {
    if (this.playerBulletActive || this.fireCooldown) return;

    const angleRad = Phaser.Math.DegToRad(this.player.angle - 90);
    const bx = this.player.x + Math.cos(angleRad) * 16;
    const by = this.player.y + Math.sin(angleRad) * 16;

    const bullet = this.physics.add.image(bx, by, "bullet") as Phaser.Physics.Arcade.Image;
    bullet.setScale(0.12).setDepth(6).setRotation(angleRad);
    bullet.setData("isPlayerBullet", true);
    bullet.setData("lifetime", 0);

    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(8, 8, true);
    body.setVelocity(
      Math.cos(angleRad) * this.activeBulletSpeed,
      Math.sin(angleRad) * this.activeBulletSpeed
    );

    this.bullets.add(bullet);
    this.playerBulletActive = true;
    this.fireCooldown = true;
    this.time.delayedCall(280, () => { this.fireCooldown = false; });
    this.createMuzzleFlash(angleRad);
  }

  
  private enemyShoot(enemy: Phaser.Physics.Arcade.Sprite) {
    if (!enemy.active) return;
    if (this.enemyFireCooldown.get(enemy)) return;
    if (!this.hasLineOfSightToPlayer(enemy) && !this.hasLineOfSightToBrick(enemy)) return;

    this.enemyFireCooldown.set(enemy, true);
    this.time.delayedCall(900, () => {
      if (enemy.active) this.enemyFireCooldown.set(enemy, false);
    });

    const dx = this.player.x - enemy.x;
    const dy = this.player.y - enemy.y;

    let fireAngleDeg: number;
    if (Math.abs(dx) > Math.abs(dy)) {
      fireAngleDeg = dx > 0 ? 0 : 180;
    } else {
      fireAngleDeg = dy > 0 ? 90 : -90;
    }

    enemy.setAngle(fireAngleDeg + 90);

    const fireRad = Phaser.Math.DegToRad(fireAngleDeg);
    const bx = enemy.x + Math.cos(fireRad) * 20;
    const by = enemy.y + Math.sin(fireRad) * 20;

    const bullet = this.physics.add.image(bx, by, "bullet") as Phaser.Physics.Arcade.Image;
    bullet.setScale(0.10).setDepth(6).setRotation(fireRad);
    bullet.setData("isPlayerBullet", false);
    bullet.setData("lifetime", 0);

    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(6, 6, true);
    body.setVelocity(Math.cos(fireRad) * ENEMY_BULLET_SPEED, Math.sin(fireRad) * ENEMY_BULLET_SPEED);

    this.enemyBullets.add(bullet);
  }

  
  private checkBulletCollisions() {

    this.bullets.children.each((obj) => {
      const bullet = obj as Phaser.Physics.Arcade.Image;
      if (!bullet.active) return true;

      const brickTile = this.getTileInArea(bullet, this.breakableLayer);
      if (brickTile) {
        const bx = bullet.x, by = bullet.y;
        this.killPlayerBullet(bullet);
        this.createExplosion(bx, by);
        this.breakableLayer.removeTileAt(brickTile.x, brickTile.y, true, true);
        return true;
      }

      const steelTile = this.getTileInArea(bullet, this.steelLayer);
      if (steelTile) {
        this.killPlayerBullet(bullet);
        this.createExplosion(bullet.x, bullet.y);
        return true;
      }

      const enemyList = this.enemies.children.entries.slice() as Phaser.Physics.Arcade.Sprite[];
      for (const enemy of enemyList) {
        if (!enemy.active || !bullet.active) continue;
        if (Phaser.Math.Distance.Between(bullet.x, bullet.y, enemy.x, enemy.y) < 18) {
          this.onPlayerBulletHitEnemy(bullet, enemy);
        }
      }

     
      if (bullet.active) {
        const ebList = this.enemyBullets.children.entries.slice() as Phaser.Physics.Arcade.Image[];
        for (const eb of ebList) {
          if (!eb.active || !bullet.active) continue;
          if (Phaser.Math.Distance.Between(bullet.x, bullet.y, eb.x, eb.y) < 10) {
            const mx = (bullet.x + eb.x) / 2;
            const my = (bullet.y + eb.y) / 2;
            this.killPlayerBullet(bullet);
            this.killEnemyBullet(eb);
            this.createExplosion(mx, my);
          }
        }
      }

      return true;
    });

    
    this.enemyBullets.children.each((obj) => {
      const bullet = obj as Phaser.Physics.Arcade.Image;
      if (!bullet.active) return true;

      const brickTile = this.getTileInArea(bullet, this.breakableLayer);
      if (brickTile) {
        const bx = bullet.x, by = bullet.y;
        this.killEnemyBullet(bullet);
        this.createExplosion(bx, by);
        this.breakableLayer.removeTileAt(brickTile.x, brickTile.y, true, true);
        return true;
      }

      const steelTile = this.getTileInArea(bullet, this.steelLayer);
      if (steelTile) {
        this.killEnemyBullet(bullet);
        this.createExplosion(bullet.x, bullet.y);
        return true;
      }

      if (this.playerAlive && !this.playerInvulnerable) {
        if (Phaser.Math.Distance.Between(bullet.x, bullet.y, this.player.x, this.player.y) < 14) {
          this.killEnemyBullet(bullet);
          this.onEnemyBulletHitPlayer();
          return true;
        }
      }

      const bulletInEagleZone = this.eagleZone.contains(bullet.x, bullet.y);
      const bulletNearSprite  = this.eagle.active &&
        Phaser.Math.Distance.Between(bullet.x, bullet.y, this.eagle.x, this.eagle.y) < 32;

      if (bulletInEagleZone || bulletNearSprite) {
        this.killEnemyBullet(bullet);
        this.createExplosion(this.eagle.x, this.eagle.y);
        this.gameOver();
        return true;
      }

      return true;
    });
  }

  private getTileInArea(
    bullet: Phaser.Physics.Arcade.Image,
    layer:  Phaser.Tilemaps.TilemapLayer
  ): Phaser.Tilemaps.Tile | null {
    const HALF = 5;
    const tiles = layer.getTilesWithinWorldXY(
      bullet.x - HALF, bullet.y - HALF,
      HALF * 2,         HALF * 2,
      { isNotEmpty: true }
    );
    return tiles && tiles.length > 0 ? tiles[0] : null;
  }

  private killPlayerBullet(bullet: Phaser.Physics.Arcade.Image) {
    if (!bullet.active) return;
    bullet.setActive(false).setVisible(false);
    (bullet.body as Phaser.Physics.Arcade.Body).stop();
    this.playerBulletActive = false;
    this.time.delayedCall(16, () => { if (bullet.scene) bullet.destroy(); });
  }

  private killEnemyBullet(bullet: Phaser.Physics.Arcade.Image) {
    if (!bullet.active) return;
    bullet.setActive(false).setVisible(false);
    (bullet.body as Phaser.Physics.Arcade.Body).stop();
    this.time.delayedCall(16, () => { if (bullet.scene) bullet.destroy(); });
  }

  private cleanupBullets() {
    const b  = this.physics.world.bounds;
    const dt = this.game.loop.delta;
    const MAX_LIFE = 4000;

    const processGroup = (group: Phaser.GameObjects.Group, isPlayer: boolean) => {
      group.children.each((obj) => {
        const bullet = obj as Phaser.Physics.Arcade.Image;
        if (!bullet.active) return true;
        const life = (bullet.getData("lifetime") as number || 0) + dt;
        bullet.setData("lifetime", life);
        const oob = bullet.x < b.left || bullet.x > b.right ||
                    bullet.y < b.top  || bullet.y > b.bottom;
        if (oob || life > MAX_LIFE) {
          bullet.setActive(false).setVisible(false);
          if (isPlayer) this.playerBulletActive = false;
          this.time.delayedCall(16, () => { if (bullet.scene) bullet.destroy(); });
        }
        return true;
      });
    };

    processGroup(this.bullets,      true);
    processGroup(this.enemyBullets, false);
  }

  private onPlayerBulletHitEnemy(
    bullet: Phaser.Physics.Arcade.Image,
    enemy:  Phaser.Physics.Arcade.Sprite
  ) {
    if (!bullet.active || !enemy.active) return;
    this.killPlayerBullet(bullet);
    let hp = (enemy.getData("hp") as number) - 1;
    enemy.setData("hp", hp);
    if (hp <= 0) {
      const k = enemy.getData("typeKey") as string;
      if (k === "enemy_basic")      this.score += 100;
      else if (k === "enemy_fast")  this.score += 200;
      else if (k === "enemy_heavy") this.score += 300;
      
      
      this.registry.set("score", this.score);
      this.destroyEnemy(enemy);
    } else {
      enemy.setTint(0xffffff);
      this.time.delayedCall(120, () => {
        if (enemy.active) {
          const baseTint = enemy.getData("baseTint") as number;
          enemy.setTint(baseTint);
        }
      });
    }
  }

  private onEnemyBulletHitPlayer() {
    if (!this.playerAlive || this.playerInvulnerable) return;

    this.cameras.main.flash(180, 200, 0, 0);

    this.cameras.main.shake(220, 0.018);

    if (!this.playerHitFlashing) {
      this.playerHitFlashing = true;
      let flashes = 0;
      const doFlash = () => {
        if (!this.player.active) { this.playerHitFlashing = false; return; }
        this.player.setTint(flashes % 2 === 0 ? 0xff2222 : 0xffffff);
        flashes++;
        if (flashes < 8) {
          this.time.delayedCall(80, doFlash);
        } else {
          if (this.player.active) this.player.clearTint();
          this.playerHitFlashing = false;
        }
      };
      doFlash();
    }

    this.lives--;

    this.registry.set("lives", this.lives);
    if (this.lives <= 0) {

      this.time.delayedCall(200, () => this.gameOver());
      return;
    }


    this.playerAlive = false;
    this.time.delayedCall(220, () => {
      if (!this.player.active) return;
      this.createExplosion(this.player.x, this.player.y);
      this.player.setActive(false).setVisible(false);
      (this.player.body as Phaser.Physics.Arcade.Body).stop();
    });
    this.time.delayedCall(1800, () => this.respawnPlayer());
  }

  private trySpawnEnemy() {
    if (this.gameEnded || this.enemiesToSpawn <= 0 || this.enemiesAlive >= this.getMaxAlive()) return;
    const shuffled = Phaser.Utils.Array.Shuffle([...this.spawnPoints]) as Phaser.Math.Vector2[];
    for (const pt of shuffled) {
      if (this.trySpawnAtPoint(pt)) return;
    }
  }

  private trySpawnAtPoint(pt: Phaser.Math.Vector2): boolean {
    if (this.enemiesToSpawn <= 0)                    return false;
    if (this.enemiesAlive >= this.getMaxAlive())     return false;

    if (Phaser.Math.Distance.Between(pt.x, pt.y, this.player.x, this.player.y) < 80) return false;

    if (this.steelLayer.getTileAtWorldXY(pt.x, pt.y))     return false;
    if (this.breakableLayer.getTileAtWorldXY(pt.x, pt.y)) return false;

    const half = TANK_BODY_SIZE / 2 + 2;
    const checkOffsets = [
      { x: pt.x - half, y: pt.y - half },
      { x: pt.x + half, y: pt.y - half },
      { x: pt.x - half, y: pt.y + half },
      { x: pt.x + half, y: pt.y + half },
    ];
    for (const off of checkOffsets) {
      if (this.steelLayer.getTileAtWorldXY(off.x, off.y))     return false;
      if (this.breakableLayer.getTileAtWorldXY(off.x, off.y)) return false;
    }

    const enemy = this.doSpawnEnemy(pt.x, pt.y);
    if (!enemy) return false;

    this.enemiesAlive++;
    this.enemiesToSpawn--;
    return true;
  }

  private doSpawnEnemy(x: number, y: number): Phaser.Physics.Arcade.Sprite | null {

    const baseType = this.getEnemyForLevel();


    const speedMult    = 1 + this.currentLevel * 0.20;          // +20% per level
    const fireRateMult = 1 - this.currentLevel * 0.15;          // -15% delay per level
    const MIN_FIRE_RATE = 900;                                   // never below 900ms

    const type: EnemyType = {
      ...baseType,
      speed:    Math.round(baseType.speed    * speedMult),
      fireRate: Math.max(MIN_FIRE_RATE, Math.round(baseType.fireRate * fireRateMult)),
    };

    const enemy = this.enemies.create(x, y, "player") as Phaser.Physics.Arcade.Sprite;
    if (!enemy) return null;

    enemy.setScale(TANK_SCALE).setCollideWorldBounds(true).setDepth(5);
    enemy.setTint(type.tint);

    const body = enemy.body as Phaser.Physics.Arcade.Body;
    body.setSize(TANK_BODY_SIZE, TANK_BODY_SIZE, true);
    body.setAllowGravity(false);

    enemy.setData("hp",       type.hp);
    enemy.setData("speed",    type.speed);
    enemy.setData("fireRate", type.fireRate);
    enemy.setData("typeKey",  type.key);
    enemy.setData("baseTint", type.tint);
    enemy.setData("direction", Phaser.Utils.Array.GetRandom(DIRS) as Direction);
    enemy.setData("dirTimer",  0);
    enemy.setData("baseTimer", Phaser.Math.Between(3000, 7000));

    enemy.setTint(0xffffaa);
    this.time.delayedCall(500, () => {
      if (enemy.active) enemy.setTint(type.tint);
    });

    try {
      const fx = this.add.sprite(x, y, "spawnflash").setDepth(7);
      fx.play("spawn_anim");
      fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
    } catch { /* animation optional */ }

    if (type.hp > 1) {
      const indicator = this.add.text(x, y - 14, "★".repeat(type.hp), {
        fontSize: "8px", color: "#ffffff",
        stroke: "#000000", strokeThickness: 2,
      }).setOrigin(0.5).setDepth(6);
      enemy.setData("indicator", indicator);
    }

    const timer = this.time.addEvent({
      delay: type.fireRate + Phaser.Math.Between(400, 1200),
      loop: true,
      callback: () => {
        if (enemy.active && this.playerAlive && !this.gameEnded) {
          this.enemyShoot(enemy);
        }
      },
    });
    this.enemyTimers.set(enemy, timer);
    return enemy;
  }

  private destroyEnemy(enemy: Phaser.Physics.Arcade.Sprite) {
    if (!enemy.active) return;
    const ex = enemy.x, ey = enemy.y;

    const indicator = enemy.getData("indicator") as Phaser.GameObjects.Text | undefined;
    if (indicator) indicator.destroy();

    this.createExplosion(ex, ey);
    const timer = this.enemyTimers.get(enemy);
    if (timer) { timer.remove(false); this.enemyTimers.delete(enemy); }
    this.enemiesAlive = Math.max(0, this.enemiesAlive - 1);
    enemy.destroy();
    if (Phaser.Math.Between(0, 2) === 0) this.spawnPowerUp(ex, ey);
  }

  private updateEnemyAI(enemy: Phaser.Physics.Arcade.Sprite) {
    const speed = enemy.getData("speed")     as number;
    const body  = enemy.body as Phaser.Physics.Arcade.Body;
    let   dir   = enemy.getData("direction") as Direction;
    const dx    = this.player.x - enemy.x;
    const dy    = this.player.y - enemy.y;
    const dist  = Math.sqrt(dx * dx + dy * dy);

    const indicator = enemy.getData("indicator") as Phaser.GameObjects.Text | undefined;
    if (indicator) indicator.setPosition(enemy.x, enemy.y - 14);

    if (body.blocked.left || body.blocked.right || body.blocked.up || body.blocked.down) {
      dir = this.dirTowardPlayer(enemy);
      if ((dir === "left"  && body.blocked.left)  ||
          (dir === "right" && body.blocked.right) ||
          (dir === "up"    && body.blocked.up)    ||
          (dir === "down"  && body.blocked.down)) {
        dir = Phaser.Utils.Array.GetRandom(DIRS) as Direction;
      }
      enemy.setData("direction", dir);
      enemy.setData("dirTimer",  0);
    }

    
    const targetDir = (roll: number): Direction =>
      roll < 7 ? this.dirTowardPlayer(enemy) : this.dirTowardEagle(enemy);

    let baseTimer = (enemy.getData("baseTimer") as number) - this.game.loop.delta;
    if (baseTimer <= 0) {
      dir = targetDir(Phaser.Math.Between(0, 9));
      enemy.setData("direction", dir);
      enemy.setData("dirTimer",  0);
      baseTimer = Phaser.Math.Between(3000, 7000);
    }
    enemy.setData("baseTimer", baseTimer);

    const CHASE_RANGE = 250;
    let dirTimer = (enemy.getData("dirTimer") as number) + this.game.loop.delta;
    if (dist < CHASE_RANGE) {
      if (dirTimer > 1200) {

        dir = targetDir(Phaser.Math.Between(0, 9));
        enemy.setData("direction", dir);
        dirTimer = 0;
      }
    } else {
      if (dirTimer > 2000 || Phaser.Math.Between(0, 300) === 0) {

        dir = targetDir(Phaser.Math.Between(0, 9));
        enemy.setData("direction", dir);
        dirTimer = 0;
      }
    }
    enemy.setData("dirTimer", dirTimer);

    switch (dir) {
      case "up":    enemy.setVelocity(0, -speed); enemy.setAngle(0);    break;
      case "down":  enemy.setVelocity(0,  speed); enemy.setAngle(180);  break;
      case "left":  enemy.setVelocity(-speed, 0); enemy.setAngle(-90);  break;
      case "right": enemy.setVelocity( speed, 0); enemy.setAngle(90);   break;
    }
  }

  private dirTowardPlayer(enemy: Phaser.Physics.Arcade.Sprite): Direction {
    const dx = this.player.x - enemy.x;
    const dy = this.player.y - enemy.y;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
  }

  private dirTowardEagle(enemy: Phaser.Physics.Arcade.Sprite): Direction {
    const dx = this.eagle.x - enemy.x;
    const dy = this.eagle.y - enemy.y;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
  }

  private hasLineOfSightToPlayer(enemy: Phaser.Physics.Arcade.Sprite): boolean {
    const ex = enemy.x, ey = enemy.y;
    const px = this.player.x, py = this.player.y;
    const STEP = 8;

    if (Math.abs(ey - py) < 16) {
      const minX = Math.min(ex, px), maxX = Math.max(ex, px);
      for (let x = minX; x <= maxX; x += STEP) {
        if (this.steelLayer.getTileAtWorldXY(x, ey)) return false;
      }
      return true;
    }
    if (Math.abs(ex - px) < 16) {
      const minY = Math.min(ey, py), maxY = Math.max(ey, py);
      for (let y = minY; y <= maxY; y += STEP) {
        if (this.steelLayer.getTileAtWorldXY(ex, y)) return false;
      }
      return true;
    }
    return false;
  }

  private hasLineOfSightToBrick(enemy: Phaser.Physics.Arcade.Sprite): boolean {
    const angle = enemy.angle;
    const STEP  = 8, MAX = 300;
    let stepX = 0, stepY = 0;
    if      (angle === 0)   stepY = -STEP;
    else if (angle === 180) stepY =  STEP;
    else if (angle === 90)  stepX =  STEP;
    else if (angle === -90) stepX = -STEP;
    else return false;

    let cx = enemy.x + stepX, cy = enemy.y + stepY, travelled = 0;
    while (travelled < MAX) {
      if (this.steelLayer.getTileAtWorldXY(cx, cy))     return false;
      if (this.breakableLayer.getTileAtWorldXY(cx, cy)) return true;
      cx += stepX; cy += stepY; travelled += STEP;
    }
    return false;
  }

  private spawnPowerUp(x: number, y: number) {
    const kind = Phaser.Utils.Array.GetRandom(POWERUP_KINDS) as PowerUpKind;

    const bg = this.add.rectangle(x, y, 22, 22, 0x111111, 0.9)
      .setDepth(8)
      .setStrokeStyle(2, POWERUP_COLORS[kind]);

    const letter = this.add.text(x, y, POWERUP_LETTERS[kind], {
      fontSize: "13px",
      fontStyle: "bold",
      color: "#" + POWERUP_COLORS[kind].toString(16).padStart(6, "0"),
    }).setOrigin(0.5).setDepth(9);

    this.tweens.add({
      targets: bg,
      alpha: { from: 0.9, to: 0.6 },
      yoyo: true, repeat: -1, duration: 500,
    });

    const container = { bg, letter, kind, alive: true };
    this.powerUps.add(bg);
    bg.setData("kind",      kind);
    bg.setData("letterRef", letter);
    bg.setData("container", container);

    this.time.delayedCall(10000, () => {
      if (container.alive) {
        container.alive = false;
        if (bg.scene)     bg.destroy();
        if (letter.scene) letter.destroy();
      }
    });
  }

  private checkPowerUpPickup() {
    this.powerUps.children.each((obj) => {
      const bg = obj as Phaser.GameObjects.Rectangle;
      if (!bg.active) return true;
      if (Phaser.Math.Distance.Between(bg.x, bg.y, this.player.x, this.player.y) < 22) {
        const kind      = bg.getData("kind")      as PowerUpKind;
        const letterRef = bg.getData("letterRef") as Phaser.GameObjects.Text;
        const container = bg.getData("container") as { alive: boolean };
        container.alive = false;
        bg.destroy();
        letterRef?.destroy();
        this.activatePowerUp(kind);
      }
      return true;
    });
  }

  private activatePowerUp(kind: PowerUpKind) {
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY - 40;
    const msg = this.add.text(cx, cy, `POWER UP: ${kind.toUpperCase()}`, {
      fontSize: "20px", color: "#ffff00",
      stroke: "#000000", strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(210);
    this.tweens.add({
      targets: msg, y: cy - 30, alpha: 0,
      duration: 1800, ease: "Power2",
      onComplete: () => msg.destroy(),
    });

    switch (kind) {
      case "star":
        this.activeBulletSpeed  = BULLET_SPEED * 1.6;
        this.activeMoveMaxSpeed = PLAYER_MAX_SPEED * 1.5;
        this.playerSpeedBoost   = true;
        this.time.delayedCall(8000, () => {
          this.activeBulletSpeed  = BULLET_SPEED;
          this.activeMoveMaxSpeed = PLAYER_MAX_SPEED;
          this.playerSpeedBoost   = false;
        });
        break;

      case "shield":
        this.playerInvulnerable = true;
        this.shieldSprite?.destroy();
        this.shieldSprite = this.add.sprite(this.player.x, this.player.y, "shield").setDepth(10);
        try { this.shieldSprite.play("shield_anim"); } catch { /* optional */ }
        this.time.delayedCall(6000, () => {
          this.playerInvulnerable = false;
          this.shieldSprite?.destroy();
          this.shieldSprite = undefined;
        });
        break;

      case "bomb": {
        const toKill = this.enemies.children.entries.slice() as Phaser.Physics.Arcade.Sprite[];
        toKill.forEach(e => { if (e.active) { this.score += 50; this.destroyEnemy(e); } });
        break;
      }

      case "extraLife":
        this.lives++;
        // Change 1: keep registry in sync
        this.registry.set("lives", this.lives);
        break;

      case "timer":
        this.enemiesFrozen = true;
        this.enemies.children.each((obj) => {
          const e = obj as Phaser.Physics.Arcade.Sprite;
          if (e.active) e.setTint(0x4488ff);
          return true;
        });
        this.time.delayedCall(5000, () => {
          this.enemiesFrozen = false;
          this.enemies.children.each((obj) => {
            const e = obj as Phaser.Physics.Arcade.Sprite;
            if (e.active) {
              const baseTint = e.getData("baseTint") as number;
              e.setTint(baseTint ?? 0xff4444);
            }
            return true;
          });
        });
        break;
    }
  }

    private respawnPlayer() {
    this.playerBulletActive = false;
    this.fireCooldown       = false;
    // Change 6: reset all power-up upgrades on respawn (classic Tank 1990 rule)
    this.activeBulletSpeed  = BULLET_SPEED;
    this.activeMoveMaxSpeed = PLAYER_MAX_SPEED;
    this.playerSpeedBoost   = false;
    this.player.setPosition(this.playerSpawn.x, this.playerSpawn.y);
    this.player.setActive(true).setVisible(true);
    this.player.setVelocity(0, 0);
    this.player.setAngle(0);
    this.player.clearTint();   // ensure no leftover red flash tint
    (this.player.body as Phaser.Physics.Arcade.Body).reset(this.playerSpawn.x, this.playerSpawn.y);
    this.playerAlive        = true;
    this.playerInvulnerable = true;
    this.playerHitFlashing  = false;

    this.shieldSprite?.destroy();
    this.shieldSprite = this.add.sprite(this.player.x, this.player.y, "shield").setDepth(10);
    try { this.shieldSprite.play("shield_anim"); } catch { /* optional */ }

    this.time.delayedCall(2000, () => {
      this.playerInvulnerable = false;
      this.shieldSprite?.destroy();
      this.shieldSprite = undefined;
    });
  }

  private createExplosion(x: number, y: number) {
    this.cameras.main.shake(75, 0.005);
    this.cameras.main.zoomTo(1.015, 50, undefined, true, (_: unknown, p: number) => {
      if (p === 1) this.cameras.main.zoomTo(1, 90);
    });
    try {
      const boom = this.add.sprite(x, y, "explosion").setScale(0.9).setDepth(9);
      boom.play("explode");
      boom.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => boom.destroy());
    } catch { /* optional */ }
  }

  private createMuzzleFlash(angleRad: number) {
    const flash = this.add.image(
      this.player.x + Math.cos(angleRad) * 20,
      this.player.y + Math.sin(angleRad) * 20,
      "muzzleflash"
    ).setScale(0.35).setRotation(angleRad).setDepth(9);
    this.time.delayedCall(55, () => { if (flash.scene) flash.destroy(); });
  }

   private gameOver() {
    if (this.gameEnded) return;
    this.gameEnded = true;
    if (this.eagle?.active) {
      this.createExplosion(this.eagle.x, this.eagle.y);
      this.eagle.destroy();
    }
    this.physics.pause();
    this.registry.set("currentLevel", 0);
    this.registry.set("score",        0);
    this.registry.set("lives",        3);
    this.showEndScreen("GAME OVER", "#ff3333", false);
  }

  private levelComplete() {
    this.gameEnded = true;
    this.physics.pause();
    const nextLevel = this.currentLevel + 1;
    if (nextLevel < LEVEL_CONFIGS.length) {
      this.registry.set("currentLevel", nextLevel);
      this.registry.set("score",        this.score);
      this.registry.set("lives",        this.lives);
      this.showEndScreen(`LEVEL ${this.currentLevel + 1} CLEAR!`, "#00ff88", true);
    } else {
      this.registry.set("currentLevel", 0);
      this.registry.set("score",        0);
      this.registry.set("lives",        3);
      this.showEndScreen("YOU WIN! ALL CLEARED!", "#ffff00", false);
    }
  }

  private showEndScreen(title: string, color: string, autoAdvance: boolean) {
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;
    this.add.rectangle(cx, cy, 480, 150, 0x000000, 0.85)
      .setScrollFactor(0).setDepth(199).setOrigin(0.5);
    this.add.text(cx, cy - 26, title, {
      fontSize: "28px", color, stroke: "#000000", strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200);
    this.add.text(cx, cy + 26,
      autoAdvance ? "PRESS ENTER FOR NEXT LEVEL" : "PRESS ENTER TO RESTART",
      { fontSize: "16px", color: "#ffffff" }
    ).setOrigin(0.5).setScrollFactor(0).setDepth(200);
    this.input.keyboard!
      .addKey(Phaser.Input.Keyboard.KeyCodes.ENTER)
      .once("down", () => this.scene.restart());
  }

  private buildSpawnPoints(map: Phaser.Tilemaps.Tilemap): Phaser.Math.Vector2[] {
     const W = map.widthInPixels;
    const H = map.heightInPixels;

    const candidates: Phaser.Math.Vector2[] = [
      new Phaser.Math.Vector2(64,       48),
      new Phaser.Math.Vector2(W / 2,    48),
      new Phaser.Math.Vector2(W - 64,   48),
      new Phaser.Math.Vector2(W * 0.25, 48),
      new Phaser.Math.Vector2(W * 0.75, 48),
      new Phaser.Math.Vector2(64,       112),
      new Phaser.Math.Vector2(W / 2,    112),
      new Phaser.Math.Vector2(W - 64,   112),
      new Phaser.Math.Vector2(W * 0.25, 112),
      new Phaser.Math.Vector2(W * 0.75, 112),
      new Phaser.Math.Vector2(64,       176),
      new Phaser.Math.Vector2(W / 2,    176),
      new Phaser.Math.Vector2(W - 64,   176),
      new Phaser.Math.Vector2(48,       H * 0.25),
      new Phaser.Math.Vector2(W - 48,   H * 0.25),
    ];

    return candidates;
  }

  private getEaglePosition(): Phaser.Math.Vector2 {
    switch (this.currentLevel) {
      case 0: 
      case 1: 
        return new Phaser.Math.Vector2(80, this.mapHeightPx - 64);

      case 2: 
        return new Phaser.Math.Vector2(
          this.mapWidthPx  / 2,
          this.mapHeightPx / 2
        );

      default:
        return new Phaser.Math.Vector2(80, this.mapHeightPx - 64);
    }
  }


   private getMaxAlive(): number {
    return 4 + this.currentLevel; // 4 / 5 / 6
  }

  private getEnemyForLevel(): EnemyType {
    const [basic, fast, heavy] = ENEMY_TYPES; // destructure by index for clarity
    const roll = Phaser.Math.Between(0, 9);

    switch (this.currentLevel) {
      case 0: // Level 1 — 70% Basic, 30% Fast, 0% Heavy
        return roll < 7 ? basic : fast;

      case 1: // Level 2 — 40% Basic, 30% Fast, 30% Heavy
        if (roll < 4) return basic;
        if (roll < 7) return fast;
        return heavy;

      case 2: // Level 3 — 20% Basic, 30% Fast, 50% Heavy
        if (roll < 2) return basic;
        if (roll < 5) return fast;
        return heavy;

      default: // fallback for any extra levels
        return Phaser.Utils.Array.GetRandom(ENEMY_TYPES) as EnemyType;
    }
  }

  private showLevelIntro(levelNumber: number) {
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;

    const bg = this.add.rectangle(cx, cy, 340, 80, 0x000000, 0.75)
      .setScrollFactor(0).setDepth(210).setOrigin(0.5);

    const text = this.add.text(cx, cy, `LEVEL  ${levelNumber}`, {
      fontSize: "36px",
      fontStyle: "bold",
      color: "#ffff00",
      stroke: "#000000",
      strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(211);

    this.time.delayedCall(1300, () => {
      this.tweens.add({
        targets: [bg, text],
        alpha: 0,
        duration: 400,
        onComplete: () => { bg.destroy(); text.destroy(); },
      });
    });
  }
}