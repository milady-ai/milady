import type { Plugin } from "@elizaos/core";
import { getWorkoutGifAction } from "./actions/getWorkoutGif";

export { getWorkoutGifAction } from "./actions/getWorkoutGif";

export const exercisedbPlugin: Plugin = {
  name: "exercisedb",
  description:
    "Surfaces workout gifs and exercise metadata from the exercisedb API (https://github.com/exercisedb/exercisedb-api).",
  actions: [getWorkoutGifAction],
};

export default exercisedbPlugin;
