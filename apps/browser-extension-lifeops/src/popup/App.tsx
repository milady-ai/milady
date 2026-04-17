import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { loadSettings } from "../settings.js";
import type { ExtensionSettings } from "../types.js";

export function App(): ReactElement {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  return (
    <div>
      <h1>LifeOps</h1>
      <div className="status">
        {settings ? (
          <>
            <div>Agent: {settings.wsUrl}</div>
            <div>
              Reporting:{" "}
              {settings.activityReportingEnabled ? "enabled" : "paused"}
            </div>
            <div>
              Flush every {Math.round(settings.flushIntervalMs / 1000)}s
            </div>
          </>
        ) : (
          "Loading…"
        )}
      </div>
      <button
        type="button"
        onClick={() => chrome.runtime.openOptionsPage()}
        style={{ marginTop: 12 }}
      >
        Open settings
      </button>
    </div>
  );
}
