import {
  BaseSimulator,
  ControlStateHandler,
  EntityPhysics,
  EntityState,
  EPhysicsCtx,
} from "@nxg-org/mineflayer-physics-util";
import type { Bot, ControlState } from "mineflayer";
import type { Entity } from "prismarine-entity";
import { Vec3 } from "vec3";

// taken from https://github.com/PrismarineJS/mineflayer/blob/e5c7f7bad35a4778ade759297d4a63a8524c38a8/lib/plugins/entities.js#L3
const NAMED_ENTITY_HEIGHT = 1.62;
const NAMED_ENTITY_WIDTH = 0.6;
const CROUCH_HEIGHT = NAMED_ENTITY_HEIGHT - 0.08;

export enum States {
  NONE,
  JUMPING = 2,
  CROUCHING,
  SPRINTING,
  CROUCHJUMPING,
  SPRINTJUMPING,
}

function modifyControls(controls: ControlStateHandler, state: States): ControlStateHandler {
  switch (state) {
    case States.CROUCHING:
      controls.set("sneak", true);
      break;
    case States.SPRINTING:
      controls.set("sprint", true);
      break;
    case States.JUMPING:
      controls.set("jump", true);
      break;
    case States.CROUCHJUMPING:
      controls.set("sneak", true);
      controls.set("jump", true);
      break;
    case States.SPRINTJUMPING:
      controls.set("sprint", true);
      controls.set("jump", true);
      break;
  }
  return controls;
}

function getControls(state:States): ControlState[] {
  switch (state) {
    case States.NONE:
      return [];
    case States.CROUCHING:
      return ["sneak"]
    case States.SPRINTING:
      return ["sprint"]
    case States.JUMPING:
      return ["jump"]
    case States.CROUCHJUMPING:
      return ["sneak", "jump"]
    case States.SPRINTJUMPING:
      return ["sprint", "jump"]
  }

}

function countDecimals(value: number) {
  if (Math.floor(value) !== value) return value.toString().split(".")[1].length || 0;
  return 0;
}

/**
 * Note: this tracker will never be perfect because we receive one position update every TWO ticks.
 * We test PER TICK, meaning our results will not match.
 *
 * I can try something else, however.
 */
export class InputReader extends BaseSimulator {

  public targets: {[id: number]: EntityState; } = {};

  private _enabled: boolean = false;

  private lastChecked = Date.now();

  public get enabled() {
    return this._enabled;
  }

  public set enabled(enabled: boolean) {
    if (enabled && !this._enabled) this.initListeners();
    else if (!enabled && this._enabled) this.cleanupListeners();
    this._enabled = enabled;
  }

  constructor(private bot: Bot) {
    super(new EntityPhysics(bot.registry));
  }

  public track(entity: Entity) {
    if (this.enabled) {
      this.clearInfo(entity.id);
    }
    this.targets[entity.id] = EntityState.CREATE_FROM_ENTITY(this.ctx, entity);
    this.enabled = true;
  }

  public disable() {
    this.enabled = false;
  }

  public clearInfo(id: number) {
    delete this.targets[id];
  }

  public getLastState(id: number) {
    return this.targets[id];
  }

  public getControls(id: number): ControlStateHandler {
    return this.targets[id].controlState;
  }

  public isTracking(e: Entity): boolean {
    return !!this.targets[e.id];
  }

  private initListeners() {
    this.bot.on("entityMoved", this.trackJumps);
    this.bot._client.on("entity_metadata", this.sprintHandler);
  }

  private cleanupListeners() {
    this.bot.off("entityMoved", this.trackJumps);
    this.bot._client.off("entity_metadata", this.sprintHandler);
  }

  private sprintHandler = (packet: { entityId: number; metadata: any[] }) => {
    if (!this.targets[packet.entityId]) return;

    const entity: Entity & { crouching?: boolean; sprinting?: boolean } = this.bot.entities[packet.entityId];
    const bitField = packet.metadata.find((p) => p.key === 0);
    if (bitField === undefined) {
      return;
    }
    if ((bitField.value & 8) !== 0) {
      entity.sprinting = true;
    } else if (entity.sprinting) {
      entity.sprinting = false;
    }
  };

  private trackJumps = (e: Entity & { crouching?: boolean; sprinting?: boolean }) => {
    if (!this.targets[e.id]) return;
    const info = this.targets[e.id];

    // look update, update state.
    if ((e.yaw !== info.yaw || e.pitch !== info.pitch) && e.position.equals(info.position)) {
      info.yaw = e.yaw;
      info.pitch = e.pitch;
      return;
    }

    const check = Date.now();
    const tickCount = Math.round((check - this.lastChecked) / 50);
    this.lastChecked = check;

    let state = States.NONE;
    if (e.crouching) {
      state = States.CROUCHING;
    } else if (e.sprinting) {
      state = States.SPRINTING;
    }

    // 0 -> 2 for jump, 1 -> 3 for crouch jump, 2 -> 4 for sprint jump.
    // Note: we assume that if serious decimal, we are free-floating so we are jumping.
    if (countDecimals(e.position.y) > 3 && e.position.y > info.position.y) {
      state += 2;
    }

    let minDist = Infinity;
    let minDistLastIter = Infinity;
    let firstControl: ControlStateHandler | null = null;
    let deferBreak = false;
    let tick = 0;
    loop1: for (tick = 0; tick < tickCount; tick++) {
      let lastState = info.clone();

      for (const lat of [null, "forward", "back"] as const) {
        for (const long of [null, "left", "right"] as const) {
          const controls = modifyControls(ControlStateHandler.DEFAULT(), state);
          if (lat !== null) controls.set(lat, true);
          if (long !== null) controls.set(long, true);
          const ectx = EPhysicsCtx.FROM_ENTITY_STATE(this.ctx, lastState.clone());
          ectx.state.controlState = controls;
          const newPos = this.predictForwardRaw(ectx, this.bot.world, 1, controls);
          const dist = newPos.position.distanceSquared(e.position);

          if (dist < minDist) {
            minDist = dist;
            firstControl = controls;
            lastState = lastState;
          }

          if (dist === 0) break loop1;
        }
        if (deferBreak) break loop1;
      }
      if (minDist <= minDistLastIter && minDist > 0) minDistLastIter = minDist;
      else break loop1;
      
    }

    const res = EntityState.CREATE_FROM_ENTITY(this.ctx, e);

    res.controlState = firstControl ?? info.controlState;
    this.targets[e.id] = res;

    // debug purposes.
    // if (tick < tickCount) {
    //   if (minDist > 0) {
    //     console.log("FAILED:", tick, tickCount, minDist, (100 * failCount / totalCount).toFixed(3))
    //     failCount++;
    //   } 
    // }
    // console.log(minDist, tickCount);
   
    // totalCount++;
  };
}


let failCount = 0;
let totalCount = 0;