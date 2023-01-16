import type { Bot } from "mineflayer";
import { InputReader } from "./inputReader";
declare module "mineflayer" {
    interface Bot {
        inputReader: InputReader;
    }
}
export declare function loader(bot: Bot): void;
