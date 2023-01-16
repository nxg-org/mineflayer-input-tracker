import { BaseSimulator, ControlStateHandler, EntityState } from "@nxg-org/mineflayer-physics-util";
import type { Bot } from "mineflayer";
import type { Entity } from "prismarine-entity";
export declare enum States {
    NONE = 0,
    JUMPING = 2,
    CROUCHING = 3,
    SPRINTING = 4,
    CROUCHJUMPING = 5,
    SPRINTJUMPING = 6
}
/**
 * Note: this tracker will never be perfect because we receive one position update every TWO ticks.
 * We test PER TICK, meaning our results will not match.
 *
 * I can try something else, however.
 */
export declare class InputReader extends BaseSimulator {
    private bot;
    targets: {
        [id: number]: EntityState;
    };
    private _enabled;
    private lastChecked;
    get enabled(): boolean;
    set enabled(enabled: boolean);
    constructor(bot: Bot);
    track(entity: Entity): void;
    disable(): void;
    clearInfo(id: number): void;
    getInfo(id: number): EntityState;
    getControls(id: number): ControlStateHandler;
    isTracking(e: Entity): boolean;
    private initListeners;
    private cleanupListeners;
    private sprintHandler;
    private trackJumps;
}
