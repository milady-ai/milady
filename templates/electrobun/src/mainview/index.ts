import { Electroview } from "electrobun/view";
import type { MainViewRPC } from "../shared/rpc";
import { installCommandPalette } from "./ui/command-palette";

const rpc = Electroview.defineRPC<MainViewRPC>({
  handlers: {
    requests: {
      showAgentProgress({ runId, message, progress }) {
        const result = document.querySelector<HTMLOutputElement>("#result");
        if (result) result.value = `${runId}: ${message}${progress ? ` (${progress}%)` : ""}`;
        return { accepted: true };
      },
    },
    messages: {
      showToast({ level, message }) {
        console[level === "error" ? "error" : "log"](message);
      },
    },
  },
});

const electroview = new Electroview({ rpc });

const prompt = document.querySelector<HTMLTextAreaElement>("#prompt");
const result = document.querySelector<HTMLOutputElement>("#result");

document.querySelector<HTMLButtonElement>("#run-agent")?.addEventListener("click", async () => {
  const response = await electroview.rpc.request.runAgent({
    prompt: prompt?.value ?? "",
    mode: "dry-run",
  });
  if (result) result.value = response.ok ? response.value.summary : response.error.message;
});

document.querySelector<HTMLButtonElement>("#check-updates")?.addEventListener("click", async () => {
  const response = await electroview.rpc.request.checkForUpdate({});
  if (result) result.value = response.ok ? JSON.stringify(response.value, null, 2) : response.error.message;
});

installCommandPalette(electroview);
