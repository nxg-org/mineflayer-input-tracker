import { initSetup } from "@nxg-org/mineflayer-physics-util";
import type { Bot } from "mineflayer";
import { InputReader } from "./inputReader";
import tracker from "@nxg-org/mineflayer-tracker"


declare module "mineflayer" {

    interface Bot {
        inputReader: InputReader
    }
}



export function loader(bot: Bot) {
    initSetup(bot.registry);
    if (!bot.hasPlugin(tracker)) bot.loadPlugin(tracker)
    bot.inputReader = new InputReader(bot);
}

