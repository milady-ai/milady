import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAgentReadyListeners,
  isAgentReady,
  offAgentReadyChange,
  onAgentReadyChange,
  setAgentReady,
} from "../agent-ready-state";

describe("agent-ready-state", () => {
  beforeEach(() => {
    // Reset to default state
    setAgentReady(false);
    clearAgentReadyListeners();
  });

  it("returns false initially", () => {
    expect(isAgentReady()).toBe(false);
  });

  it("setAgentReady(true) changes return value", () => {
    setAgentReady(true);
    expect(isAgentReady()).toBe(true);
  });

  it("setAgentReady(false) toggles back", () => {
    setAgentReady(true);
    expect(isAgentReady()).toBe(true);
    setAgentReady(false);
    expect(isAgentReady()).toBe(false);
  });

  it("onAgentReadyChange listener fires on set", () => {
    const calls: boolean[] = [];
    onAgentReadyChange((ready) => calls.push(ready));

    setAgentReady(true);
    expect(calls).toEqual([true]);

    setAgentReady(false);
    expect(calls).toEqual([true, false]);
  });

  it("listener receives correct boolean value", () => {
    let received: boolean | undefined;
    onAgentReadyChange((ready) => {
      received = ready;
    });

    setAgentReady(true);
    expect(received).toBe(true);

    setAgentReady(false);
    expect(received).toBe(false);
  });

  it("multiple listeners all fire", () => {
    const calls1: boolean[] = [];
    const calls2: boolean[] = [];

    onAgentReadyChange((ready) => calls1.push(ready));
    onAgentReadyChange((ready) => calls2.push(ready));

    setAgentReady(true);
    expect(calls1).toEqual([true]);
    expect(calls2).toEqual([true]);
  });

  it("offAgentReadyChange removes a specific listener", () => {
    const oldCalls: boolean[] = [];
    const newCalls: boolean[] = [];

    const oldListener = (ready: boolean) => oldCalls.push(ready);
    onAgentReadyChange(oldListener);
    setAgentReady(true);
    expect(oldCalls).toEqual([true]);

    offAgentReadyChange(oldListener);
    onAgentReadyChange((ready) => newCalls.push(ready));
    setAgentReady(false);
    expect(oldCalls).toEqual([true]); // old listener not called again
    expect(newCalls).toEqual([false]);
  });

  it("setAgentReady with same value still fires listener", () => {
    const calls: boolean[] = [];
    onAgentReadyChange((ready) => calls.push(ready));

    setAgentReady(true);
    setAgentReady(true);
    expect(calls).toEqual([true, true]);
  });
});
