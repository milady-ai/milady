import { createRoot } from "react-dom/client";
import { App } from "./App.js";

const container = document.getElementById("root");
if (!container) {
  throw new Error("options root element missing");
}
createRoot(container).render(<App />);
