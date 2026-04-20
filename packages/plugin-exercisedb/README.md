# @milady/plugin-exercisedb

An elizaOS plugin that exposes a `GET_WORKOUT_GIF` action. The agent calls the
[exercisedb API](https://github.com/exercisedb/exercisedb-api) and replies with
an exercise name, target muscle, equipment, and gif URL in response to messages
like:

- "show me a chest workout gif"
- "give me a yoga pose"
- "workout gif for biceps"

## Configuration

- `EXERCISEDB_BASE_URL` — optional override for the API base URL. Defaults to
  `https://exercisedb-api.vercel.app/api/v2`. If the primary endpoint errors,
  the action falls back to the GitHub-hosted dataset.

## Usage

```ts
import { exercisedbPlugin } from "@milady/plugin-exercisedb";

export const agent = {
  plugins: [exercisedbPlugin],
  // ...
};
```
