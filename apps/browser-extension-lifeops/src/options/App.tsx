import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { loadSettings, saveSettings } from "../settings.js";
import { DEFAULT_SETTINGS, type ExtensionSettings } from "../types.js";

export function App(): ReactElement {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  const onSave = async (): Promise<void> => {
    await saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 1_500);
  };

  return (
    <div>
      <h1>LifeOps extension settings</h1>
      <p>
        These settings control how this extension talks to the local Milady /
        LifeOps agent.
      </p>

      <label htmlFor="wsUrl">Agent WebSocket URL</label>
      <input
        id="wsUrl"
        type="text"
        value={settings.wsUrl}
        onChange={(e) => setSettings({ ...settings, wsUrl: e.target.value })}
      />

      <label htmlFor="flushIntervalMs">Flush interval (ms, min 1000)</label>
      <input
        id="flushIntervalMs"
        type="number"
        min={1000}
        step={1000}
        value={settings.flushIntervalMs}
        onChange={(e) =>
          setSettings({
            ...settings,
            flushIntervalMs: Math.max(1000, Number(e.target.value) || 0),
          })
        }
      />

      <label>
        <input
          type="checkbox"
          checked={settings.activityReportingEnabled}
          onChange={(e) =>
            setSettings({
              ...settings,
              activityReportingEnabled: e.target.checked,
            })
          }
        />{" "}
        Activity reporting enabled
      </label>

      <div>
        <button type="button" onClick={onSave}>
          Save
        </button>
        {saved ? (
          <span style={{ marginLeft: 12, color: "green" }}>Saved</span>
        ) : null}
      </div>
    </div>
  );
}
