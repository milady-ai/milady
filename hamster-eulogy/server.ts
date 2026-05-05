import { Hono } from "hono";
import { cors } from "hono/cors";
import Anthropic from "@anthropic-ai/sdk";

const app = new Hono();
app.use("/api/*", cors());

const client = new Anthropic();

interface EulogyRequest {
  name: string;
  age?: string;
  personality?: string;
  favoriteActivity?: string;
  causeOfDeath?: string;
  ownerName?: string;
  tone: "heartfelt" | "humorous" | "poetic" | "dramatic";
}

app.post("/api/generate", async (c) => {
  const body = await c.req.json<EulogyRequest>();

  if (!body.name?.trim()) {
    return c.json({ error: "Hamster name is required" }, 400);
  }

  const details = [
    `Name: ${body.name}`,
    body.age && `Age: ${body.age}`,
    body.personality && `Personality traits: ${body.personality}`,
    body.favoriteActivity && `Favorite activity: ${body.favoriteActivity}`,
    body.causeOfDeath && `Cause of death: ${body.causeOfDeath}`,
    body.ownerName && `Owner's name: ${body.ownerName}`,
    `Tone: ${body.tone}`,
  ]
    .filter(Boolean)
    .join("\n");

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Write a eulogy for a deceased hamster with these details:\n\n${details}\n\nWrite a ${body.tone} eulogy of 3-5 paragraphs. Be creative and touching. Address the audience as if speaking at a small memorial service.`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";
  return c.json({ eulogy: text });
});

export default {
  port: 3001,
  fetch: app.fetch,
};
