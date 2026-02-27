/**
 * CustomHtml — User-provided HTML/CSS/JS or external URL rendered in a
 * sandboxed iframe. Events delivered via postMessage.
 */

import { useEffect, useRef } from "react";
import { registerWidget } from "../registry";
import type { WidgetDefinition, WidgetRenderProps } from "../types";

function CustomHtml({ instance, events }: WidgetRenderProps) {
  const mode = (instance.config.mode as string) ?? "inline";
  const htmlContent = (instance.config.html as string) ?? "";
  const cssContent = (instance.config.css as string) ?? "";
  const jsContent = (instance.config.js as string) ?? "";
  const url = (instance.config.url as string) ?? "";

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Forward events to iframe via postMessage
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || events.length === 0) return;

    const latest = events[events.length - 1];
    iframe.contentWindow.postMessage(
      { type: "milady-widget-event", event: latest },
      "*",
    );
  }, [events]);

  if (mode === "url" && url) {
    return (
      <iframe
        ref={iframeRef}
        src={url}
        sandbox="allow-scripts"
        className="w-full h-full border-0 rounded"
        title="Custom widget"
      />
    );
  }

  // Inline mode: render HTML/CSS/JS via srcdoc
  const srcdoc = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>${cssContent}</style></head>
<body>${htmlContent}<script>${jsContent}</script></body>
</html>`;

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcdoc}
      sandbox="allow-scripts"
      className="w-full h-full border-0 rounded"
      title="Custom widget"
    />
  );
}

const definition: WidgetDefinition = {
  type: "custom-html",
  name: "Custom HTML",
  description:
    "User-provided HTML/CSS/JS or external URL in a sandboxed iframe",
  subscribesTo: [],
  defaultPosition: { x: 10, y: 10, width: 30, height: 30 },
  defaultZIndex: 20,
  configSchema: {
    mode: {
      type: "select",
      label: "Mode",
      default: "inline",
      options: [
        { label: "Inline HTML", value: "inline" },
        { label: "External URL", value: "url" },
      ],
    },
    html: { type: "string", label: "HTML", default: "" },
    css: { type: "string", label: "CSS", default: "" },
    js: { type: "string", label: "JavaScript", default: "" },
    url: { type: "string", label: "URL", default: "" },
  },
  defaultConfig: { mode: "inline", html: "", css: "", js: "", url: "" },
  render: CustomHtml,
};

registerWidget(definition);
export default definition;
