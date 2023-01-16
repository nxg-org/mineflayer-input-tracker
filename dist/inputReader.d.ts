import { BaseSimulator, ControlStateHandler } from "@nxg-org/mineflayer-physics-util";
import type { Bot } from "mineflayer";
import type { Entity } from "prismarine-entity";
import type { Vec3 } from "vec3";
export declare enum States {
    NONE = 0,
    CROUCHING = 1,
    JUMPING = 2,
    CROUCHJUMPING = 3,
    SPRINTING = 4,
    SPRINTJUMPING = 5
}
/**
 * Note: this tracker will never be perfect because we receive one position update every TWO ticks.
 * We test PER TICK, meaning our results will not match.
 *
 * I can try something else, however.
 */
export declare class InputReader extends BaseSimulator {
    private bot;
    private static readonly DIRECTIONS;
    private static readonly DIRECTION_MODIFIERS;
    targets: {
        [id: number]: {
            entity: Entity & {
                crouching?: boolean;
                sprinting?: boolean;
            };
            lastPos: Vec3;
            controls: ControlStateHandler;
        };
    };
    private _enabled;
    private lastChecked;
    get enabled(): boolean;
    set enabled(enabled: boolean);
    constructor(bot: Bot);
    track(entity: Entity): void;
    disable(): void;
    clearInfo(id: number): void;
    getInfo(id: number): {
        entity: Entity & {
            crouching?: boolean | undefined;
            sprinting?: boolean | undefined;
        };
        lastPos: Vec3;
        controls: ControlStateHandler;
    };
    getControls(id: number): ControlStateHandler;
    isTracking(e: Entity): boolean;
    private trackJumps;
    private initListeners;
    private cleanupListeners;
    private sprintHandler;
}
