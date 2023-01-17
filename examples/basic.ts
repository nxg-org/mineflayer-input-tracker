import { ControlStateHandler } from "@nxg-org/mineflayer-physics-util";
import { Bot, createBot } from "mineflayer";
import type { Entity } from "prismarine-entity";
import { loader } from "../src/index";
const netlog = require("prismarine-inspector");

const bot = createBot({
  auth: "offline",
  username: "inpTracker",
  host: "localhost",
  port: 25566,
});

netlog(bot);
bot.loadPlugin(loader);
bot.setMaxListeners(1000);

bot.on("spawn", () => {
  bot.on("chat", async (username, message) => {
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
      case "jump":
        bot.setControlState("jump", true);
        const list = () => {
          if (bot.entity.onGround) {
            bot.removeListener("physicsTick", list);
            bot.setControlState("jump", false);
          }
          console.log(bot.entity.position, bot.entity.velocity);
        };
        // await bot.waitForTicks(1);
        bot.on("physicsTick", list);
        break;
      case "forward":
      case "back":
      case "left":
      case "right":
        const orgPos = bot.entity.position.clone();
        bot.setControlState(cmd, true);
        const list1 = () => {
          if (orgPos.distanceTo(bot.entity.position) > 2) {
            bot.removeListener("physicsTick", list1);
            bot.setControlState(cmd as any, false);
          }
          console.log(bot.entity.position, bot.entity.velocity);
        };
        // await bot.waitForTicks(1);
        bot.on("physicsTick", list1);
        break;
    }
  });
});

function findEntity(desc: string, author: string) {
  return (
    bot.nearestEntity((e) => !!e.username && e.username === desc) ??
    bot.nearestEntity((e) => !!e.name && e.name === desc) ??
    bot.nearestEntity((e) => !!e.type && e.type === desc) ??
    bot.nearestEntity((e) => !!e.username && e.username === author)
  );
}

function reporter(e: Entity) {
  if (!bot.inputReader.isTracking(e)) return;

  const res = bot.inputReader.getControls(e.id);
  // console.log(res);
}
