import { TelegramAccountClient } from "./telegramAccountClient";

const telegramAccountPlugin = {
    name: "telegramAccount",
    description: "Telegram account connector plugin",
    services: [TelegramAccountClient],
};
export default telegramAccountPlugin;
