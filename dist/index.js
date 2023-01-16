"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loader = void 0;
const mineflayer_physics_util_1 = require("@nxg-org/mineflayer-physics-util");
const inputReader_1 = require("./inputReader");
function loader(bot) {
    (0, mineflayer_physics_util_1.initSetup)(bot.registry);
    bot.inputReader = new inputReader_1.InputReader(bot);
}
exports.loader = loader;
