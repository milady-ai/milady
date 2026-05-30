import type { Electroview } from "electrobun/view";
import type { MainViewRPC } from "../../shared/rpc";
import type { AppCommandId } from "../../shared/domain";

const commands: Array<{ id: AppCommandId; title: string }> = [
  { id: "agent.run", title: "Run Agent" },
  { id: "updates.check", title: "Check for Updates" },
  { id: "settings.open", title: "Open Settings" },
];

export function installCommandPalette(electroview: Electroview<MainViewRPC>) {
  const dialog = document.querySelector<HTMLDialogElement>("#command-palette");
  const list = document.querySelector<HTMLUListElement>("#command-list");
  const search = document.querySelector<HTMLInputElement>("#command-search");
  if (!dialog || !list || !search) return;

  function render(filter = "") {
    list.replaceChildren(
      ...commands
        .filter((command) => command.title.toLowerCase().includes(filter.toLowerCase()))
        .map((command) => {
          const item = document.createElement("li");
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = command.title;
          button.addEventListener("click", async () => {
            await electroview.rpc.request.dispatchCommand({ id: command.id });
            dialog.close();
          });
          item.append(button);
          return item;
        }),
    );
  }

  window.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      render();
      dialog.showModal();
      search.focus();
    }
  });

  search.addEventListener("input", () => render(search.value));
}
