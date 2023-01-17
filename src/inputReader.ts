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

const DEFAULT_VELOCITY = new Vec3(0, -0.0784000015258789, 0);

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

  public targets: {[id: number]: EntityState & {posChange: boolean}; } = {};

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
    this.bot.tracker.trackEntity(entity);
    this.targets[entity.id] = EntityState.CREATE_FROM_ENTITY(this.ctx, entity) as any;
    this.targets[entity.id].posChange = true;
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
    // this.bot.on("entityMoved", this.trackJumps);
    this.bot.on("entityMoved", this.didMove);
    this.bot.on("physicTick", this.trackJumpNew)
    this.bot._client.on("entity_metadata", this.sprintHandler);
  }

  private cleanupListeners() {
    // this.bot.off("entityMoved", this.trackJumps);
    this.bot.off("entityMoved", this.didMove);
    this.bot.off("physicTick", this.trackJumpNew)
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


  public getState(e: Entity & {crouching?: boolean, sprinting?: boolean}) {
    if (!this.targets[e.id]) return States.NONE;

    let state = States.NONE;
    if (e.crouching) {
      state = States.CROUCHING;
    } else if (e.sprinting) {
      state = States.SPRINTING;
    }

    // 0 -> 2 for jump, 1 -> 3 for crouch jump, 2 -> 4 for sprint jump.
    // Note: we assume that if serious decimal, we are free-floating so we are jumping.
    if (countDecimals(e.position.y) > 3 && e.position.y > this.targets[e.id].position.y) {
      state += 2;
    }
    return state;
  }

  private didMove = (e: Entity) => {
    const info = this.targets[e.id];
    if (!info) return;
    const movedBefore = info.posChange;
    console.log(movedBefore, e.position.equals(info.position))
    info.posChange = !e.position.equals(info.position)
    if (movedBefore === info.posChange && !movedBefore) {
      info.velocity = DEFAULT_VELOCITY.clone();
    }
    if (movedBefore !== info.posChange && !info.posChange) {
      info.updateFromEntity(e);
    }
  }

  private trackJumpNew = () => {
    for (const e of Object.values(this.bot.entities).filter(e => !!this.targets[e.id])) {
      const info = this.targets[e.id];

      if ((e.yaw !== info.yaw || e.pitch !== info.pitch) && e.position.equals(info.position)) {
        info.yaw = e.yaw;
        info.pitch = e.pitch;
        continue;
      }


      if (info.velocity.equals(DEFAULT_VELOCITY)) {
        info.controlState = ControlStateHandler.DEFAULT();
        // continue;
      }

      if (info.velocity.equals(new Vec3(0, 0, 0))) {
        info.velocity = DEFAULT_VELOCITY.clone();
      }


      const state = this.getState(e);
      // console.log("hi", this.targets[e.id].velocity)
      if (info.posChange) {
        let minDist = Infinity;
        let closestState = info.clone();
        // const goal = e.position;
        loop1: for (const lat of [null, "forward", "back"] as const) {
          for (const long of [null, "left", "right"] as const) {
            const controls = modifyControls(ControlStateHandler.DEFAULT(), state);
            if (lat !== null) controls.set(lat, true);
            if (long !== null) controls.set(long, true);
            const ectx = EPhysicsCtx.FROM_ENTITY_STATE(this.ctx, info.clone());
            const newPos = this.predictForwardRaw(ectx, this.bot.world, 1, controls);
            const dist = Math.sqrt(Math.pow(newPos.position.x - e.position.x, 2) + Math.pow(newPos.position.z - e.position.z, 2));
  
            console.log(dist, lat, long, e.position, ectx.state.position, ectx.state.velocity);
            if (dist < minDist) {
              console.log(minDist, dist, lat, long)
              minDist = dist;
              closestState = ectx.state;
            }
  
            if (dist === 0) break loop1;
          }
        }
        this.targets[e.id] = closestState as any;
        this.targets[e.id].posChange = false;
        console.log(this.targets[e.id].controlState)
      } else {
        const ectx = EPhysicsCtx.FROM_ENTITY_STATE(this.ctx, this.targets[e.id]);
        const res = this.predictForwardRaw(ectx, this.bot.world, 1);
      
        console.log("interpolate", this.targets[e.id].velocity, res.velocity)
        console.log(this.targets[e.id].controlState)
      }



    }
  }





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


    if (tickCount < 1) {
      info.velocity = e.position.minus(info.position)
    }

    if (tickCount > 0) {
      // info.velocity = e.position.minus(info.position).scaled(1 / tickCount)
      // console.log(info.velocity, tickCount);
    }
    // console.log(info.velocity)
    const state = this.getState(e);

    let minDist = Infinity;
    let minDistLastIter = Infinity;
    let firstControl: ControlStateHandler | null = null;
    let deferBreak = false;
    let onGround = false;
    let tick = 0;
    loop1: for (tick = 0; tick < tickCount; tick++) {
      let lastState = info.clone();

      for (const lat of [null, "forward", "back"] as const) {
        for (const long of [null, "left", "right"] as const) {
          const controls = modifyControls(ControlStateHandler.DEFAULT(), state);
          if (lat !== null) controls.set(lat, true);
          if (long !== null) controls.set(long, true);
          const ectx = EPhysicsCtx.FROM_ENTITY_STATE(this.ctx, lastState.clone());
          const newPos = this.predictForwardRaw(ectx, this.bot.world, 1, controls);
          const dist = Math.sqrt(Math.pow(newPos.position.x - e.position.x, 2) + Math.pow(newPos.position.z - e.position.z, 2));

          if (dist < minDist) {
            console.log(minDist, dist, lat, long, tick)
            minDist = dist;
            firstControl = controls;
            lastState = lastState;
            onGround = ectx.state.onGround;
          }

          if (dist === 0) break loop1;
        }
        if (deferBreak) break loop1;
      }
      if (minDist <= minDistLastIter && minDist > 0) minDistLastIter = minDist;
      else break loop1;
      
    }

    const res = EntityState.CREATE_FROM_ENTITY(this.ctx, e);
    res.onGround = onGround;
    res.controlState = firstControl ?? info.controlState;
    this.targets[e.id] = res as any;
    this.targets[e.id].posChange = false;
    // console.log(res.controlState)

    //  // debug purposes.
    // if (tick < tickCount) {
    //   if (minDist > 0) {
    //     console.log("FAILED:", tick, tickCount, minDist, (100 * failCount / totalCount).toFixed(3))
    //     failCount++;
    //   } 
    // }
    // console.log(minDist, tick, tickCount);
    // totalCount++;
  };
}


let failCount = 0;
let totalCount = 0;