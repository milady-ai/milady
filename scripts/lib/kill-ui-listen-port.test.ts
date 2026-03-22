import { describe, expect, it } from "vitest";

import { parseNetstatListeningPids } from "./kill-ui-listen-port.mjs";

describe("parseNetstatListeningPids", () => {
  it("finds IPv4 LISTENING rows for the port", () => {
    const sample = `
  TCP    127.0.0.1:2138         0.0.0.0:0              LISTENING       45212
  TCP    0.0.0.0:80            0.0.0.0:0              LISTENING       4
`;
    expect(parseNetstatListeningPids(sample, 2138)).toEqual([45212]);
  });

  it("does not match a longer port suffix (e.g. 21380 when port is 2138)", () => {
    const sample =
      "  TCP    127.0.0.1:21380         0.0.0.0:0              LISTENING       99\n";
    expect(parseNetstatListeningPids(sample, 2138)).toEqual([]);
  });

  it("collects multiple PIDs", () => {
    const sample = `
  TCP    127.0.0.1:2138         0.0.0.0:0              LISTENING       111
  TCP    [::1]:2138             [::]:0                 LISTENING       222
`;
    expect(
      parseNetstatListeningPids(sample, 2138).sort((a, b) => a - b),
    ).toEqual([111, 222]);
  });

  it("dedupes the same PID", () => {
    const sample = `
  TCP    127.0.0.1:2138         0.0.0.0:0              LISTENING       7
  TCP    [::1]:2138             [::]:0                 LISTENING       7
`;
    expect(parseNetstatListeningPids(sample, 2138)).toEqual([7]);
  });

  it("ignores non-LISTENING lines", () => {
    const sample =
      "  TCP    127.0.0.1:2138         1.2.3.4:443            ESTABLISHED     55\n";
    expect(parseNetstatListeningPids(sample, 2138)).toEqual([]);
  });
});
