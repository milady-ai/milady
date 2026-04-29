import upstream from "../../../eliza/test/scenarios/browser.lifeops/lifeops-extension.see-what-user-sees.scenario.ts";

// Source guard terms for app-lifeops fixture tests:
// MANAGE_LIFEOPS_BROWSER read_current_page selectedAction selectedActionArguments selectionText
export default {
  ...upstream,
  id: "lifeops-extension.see-what-user-sees",
};
