"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InputReader = exports.States = void 0;
const mineflayer_physics_util_1 = require("@nxg-org/mineflayer-physics-util");
// taken from https://github.com/PrismarineJS/mineflayer/blob/e5c7f7bad35a4778ade759297d4a63a8524c38a8/lib/plugins/entities.js#L3
const NAMED_ENTITY_HEIGHT = 1.62;
const NAMED_ENTITY_WIDTH = 0.6;
const CROUCH_HEIGHT = NAMED_ENTITY_HEIGHT - 0.08;
var States;
(function (States) {
    States[States["NONE"] = 0] = "NONE";
    States[States["CROUCHING"] = 1] = "CROUCHING";
    States[States["JUMPING"] = 2] = "JUMPING";
    States[States["CROUCHJUMPING"] = 3] = "CROUCHJUMPING";
    States[States["SPRINTING"] = 4] = "SPRINTING";
    States[States["SPRINTJUMPING"] = 5] = "SPRINTJUMPING";
})(States = exports.States || (exports.States = {}));
function modifyControls(controls, state) {
    switch (state) {
        case States.CROUCHING:
            controls.set("sneak", true);
            break;
        case States.SPRINTING:
            controls.set("sprint", true);
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
/**
 * Note: this tracker will never be perfect because we receive one position update every TWO ticks.
 * We test PER TICK, meaning our results will not match.
 *
 * I can try something else, however.
 */
class InputReader extends mineflayer_physics_util_1.BaseSimulator {
    get enabled() {
        return this._enabled;
    }
    set enabled(enabled) {
        if (enabled && !this._enabled)
            this.initListeners();
        else if (!enabled && this._enabled)
            this.cleanupListeners();
        this._enabled = enabled;
    }
    constructor(bot) {
        super(new mineflayer_physics_util_1.EntityPhysics(bot.registry));
        this.bot = bot;
        this.targets = {};
        this._enabled = false;
        this.lastChecked = Date.now();
        this.trackJumps = (entity) => {
            if (!this.targets[entity.id])
                return;
            const check = Date.now();
            // console.log(check - this.lastChecked);
            this.lastChecked = check;
            const info = this.targets[entity.id];
            const e = info.entity;
            const orgPos = e.position.clone();
            const orgDir = orgPos.normalize();
            const inpInfo = [];
            const ectx = mineflayer_physics_util_1.EPhysicsCtx.FROM_ENTITY(this.ctx, e);
            let state = States.NONE;
            if (e.crouching)
                state = States.CROUCHING;
            else if (e.sprinting)
                state = States.SPRINTING; // prefer sprint over crouch (override).
            // 0 -> 2 for jump, 1 -> 3 for crouch jump, 2 -> 4 for sprint jump.
            if (entity.position.y > info.lastPos.y && !entity.onGround)
                state += 2;
            // first, sort out tangent movement options.
            for (const dir of InputReader.DIRECTIONS) {
                const controls = modifyControls(mineflayer_physics_util_1.ControlStateHandler.DEFAULT(), state);
                controls.set(dir, true);
                console.log("first", controls.get(dir), dir);
                const res = this.predictForwardRaw(ectx, this.bot.world, 1, controls);
                const resDir = res.position.normalize();
                let angle = Math.acos(orgPos.dot(res.position) / (orgPos.norm() * res.position.norm())); // gets angle, 0 - 2PI
                angle = (angle * 180) / Math.PI; // to degrees.
                console.log(orgPos, res.position);
                console.log(dir, angle);
                if (Math.abs(angle - 90) < 45)
                    continue; // skip considering this, too tangent of a move to matter.
                console.log("pushing", dir);
                inpInfo.push([dir, res]);
                ectx.state.updateFromEntity(e);
            }
            let closestMatch = Infinity;
            let ret = mineflayer_physics_util_1.ControlStateHandler.DEFAULT();
            // second, simulate the good options again to confirm we are moving in the right direction.
            for (const [dir, res] of inpInfo) {
                const newCtx = mineflayer_physics_util_1.EPhysicsCtx.FROM_ENTITY_STATE(this.ctx, res); // TODO: generalize to any entity type.
                console.log("second", newCtx.state.controlState.get(dir), dir);
                const newRes = this.predictForwardRaw(newCtx, this.bot.world, 1);
                let angle = Math.acos(orgPos.dot(newRes.position) / (orgPos.norm() * newRes.position.norm())); // gets angle, 0 - 2PI
                if (angle < closestMatch) {
                    closestMatch = angle;
                    ret = newRes.controlState;
                }
            }
            // end
            info.lastPos = orgPos;
            info.controls = ret;
        };
        this.sprintHandler = (packet) => {
            if (!this.targets[packet.entityId])
                return;
            const entity = this.targets[packet.entityId].entity;
            const bitField = packet.metadata.find((p) => p.key === 0);
            if (bitField === undefined) {
                return;
            }
            if ((bitField.value & 8) !== 0) {
                entity.sprinting = true;
            }
            else if (entity.sprinting) {
                entity.sprinting = false;
            }
        };
    }
    track(entity) {
        if (this.enabled) {
            this.clearInfo(entity.id);
        }
        this.targets[entity.id] = {
            entity: entity,
            lastPos: entity.position.clone(),
            controls: mineflayer_physics_util_1.ControlStateHandler.DEFAULT(),
        };
        this.enabled = true;
    }
    disable() {
        this.enabled = false;
    }
    clearInfo(id) {
        delete this.targets[id];
    }
    getInfo(id) {
        return this.targets[id];
    }
    getControls(id) {
        return this.targets[id].controls;
    }
    isTracking(e) {
        return !!this.targets[e.id];
    }
    initListeners() {
        this.bot.on("entityMoved", this.trackJumps);
        this.bot._client.on("entity_metadata", this.sprintHandler);
    }
    cleanupListeners() {
        this.bot.off("entityMoved", this.trackJumps);
        this.bot._client.off("entity_metadata", this.sprintHandler);
    }
}
exports.InputReader = InputReader;
InputReader.DIRECTIONS = ["forward", "back", "left", "right"];
InputReader.DIRECTION_MODIFIERS = ["sprint", "sneak", "jump"];
