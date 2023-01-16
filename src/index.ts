import { initSetup } from "@nxg-org/mineflayer-physics-util";
import type { Bot } from "mineflayer";
import { InputReader } from "./inputReader";

declare module "mineflayer" {

    interface Bot {
        inputReader: InputReader
    }
}



export function loader(bot: Bot) {
    initSetup(bot.registry);
    bot.inputReader = new InputReader(bot);
}

