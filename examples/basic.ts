import { ControlStateHandler } from "@nxg-org/mineflayer-physics-util";
import { Bot, createBot } from "mineflayer";
import type {Entity} from "prismarine-entity";
import { loader } from "../src/index";

const bot = createBot({
  auth: "offline",
  username: "inpTracker",
  host: "localhost",
  port: 25566,
});

bot.loadPlugin(loader);

bot.on("spawn", () => {
  bot.on("chat", (username, message) => {
    let [cmd, ...args] = message.trim().split(" ");
    let target;
    switch (cmd) {
      case "start":
        target = findEntity(args[0], username);
        if (!target) return;
        bot.inputReader.track(target);
        bot.on("entityMoved", reporter);
        break;
      case "stop":
        bot.inputReader.disable();
        break;
    }
  });
});

function findEntity(desc: string, author: string) {
  return (
    bot.nearestEntity((e) => e.username === desc) ??
    bot.nearestEntity((e) => e.name === desc) ??
    bot.nearestEntity((e) => e.type === desc) ??
    bot.nearestEntity((e) => e.username === author)
  );
}

function reporter(e: Entity) {
  if (!bot.inputReader.isTracking(e)) return;

  const res = bot.inputReader.getControls(e.id);
  if (res) {
    console.log(res);
  }
}