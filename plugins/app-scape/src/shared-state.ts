/**
 * Module-level pass-through for the current LLM response text.
 *
 * The autonomous loop in `ScapeGameService` writes the LLM's output here
 * before dispatching any Actions, so Action handlers can parse their
 * own params out of the free-form response (e.g.
 * `<destination>lumbridge bank</destination>`).
 *
 * Same shape 2004scape uses — copied intentionally so the two plugins
 * stay recognizable.
 */
let currentLlmResponse = "";

export function setCurrentLlmResponse(text: string): void {
    currentLlmResponse = text;
}

export function getCurrentLlmResponse(): string {
    return currentLlmResponse;
}
