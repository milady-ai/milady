import { expect, test } from "@playwright/test";

const COMPONENTS = [
  { id: "badge--default", name: "Badge-Default" },
  { id: "badge--secondary", name: "Badge-Secondary" },
  { id: "badge--destructive", name: "Badge-Destructive" },
  { id: "badge--outline", name: "Badge-Outline" },
  { id: "banner--info", name: "Banner-Info" },
  { id: "banner--warning", name: "Banner-Warning" },
  { id: "banner--error", name: "Banner-Error" },
  { id: "button--default", name: "Button-Default" },
  { id: "button--destructive", name: "Button-Destructive" },
  { id: "button--outline", name: "Button-Outline" },
  { id: "button--secondary", name: "Button-Secondary" },
  { id: "button--ghost", name: "Button-Ghost" },
  { id: "button--link", name: "Button-Link" },
  { id: "card--default", name: "Card-Default" },
  { id: "chatAtoms-typingindicator--default", name: "TypingIndicator" },
  { id: "chatAtoms-chatemptystate--default", name: "ChatEmptyState" },
  { id: "checkbox--default", name: "Checkbox-Default" },
  { id: "confirmdelete--default", name: "ConfirmDelete-Default" },
  { id: "confirmdialog--danger", name: "ConfirmDialog-Danger" },
  { id: "connectionstatus--connected", name: "ConnectionStatus-Connected" },
  { id: "connectionstatus--disconnected", name: "ConnectionStatus-Disconnected" },
  { id: "connectionstatus--error", name: "ConnectionStatus-Error" },
  { id: "copybutton--default", name: "CopyButton-Default" },
  { id: "emptystate--with-icon-and-action", name: "EmptyState-Full" },
  { id: "grid--two-columns", name: "Grid-TwoColumns" },
  { id: "input--default", name: "Input-Default" },
  { id: "label--default", name: "Label-Default" },
  { id: "savefooter--default", name: "SaveFooter-Default" },
  { id: "searchbar--default", name: "SearchBar-Default" },
  { id: "searchinput--default", name: "SearchInput-Default" },
  { id: "sectioncard--default", name: "SectionCard-Default" },
  { id: "sectioncard--collapsible", name: "SectionCard-Collapsible" },
  { id: "separator--horizontal", name: "Separator-Horizontal" },
  { id: "skeleton--skeleton", name: "Skeleton-Default" },
  { id: "skeleton--skeletoncard", name: "Skeleton-Card" },
  { id: "skeleton--skeletonchat", name: "Skeleton-Chat" },
  { id: "spinner--default", name: "Spinner-Default" },
  { id: "stack--vertical", name: "Stack-Vertical" },
  { id: "stack--horizontal", name: "Stack-Horizontal" },
  { id: "statusbadge--success", name: "StatusBadge-Success" },
  { id: "statusbadge--warning", name: "StatusBadge-Warning" },
  { id: "statusbadge--danger", name: "StatusBadge-Danger" },
  { id: "statcard--default", name: "StatCard-Default" },
  { id: "switch--default", name: "Switch-Default" },
  { id: "tageditor--with-items", name: "TagEditor-WithItems" },
  { id: "taginput--with-items", name: "TagInput-WithItems" },
  { id: "textarea--default", name: "Textarea-Default" },
  { id: "themedselect--default", name: "ThemedSelect-Default" },
  { id: "typography-text--default", name: "Text-Default" },
  { id: "typography-heading--heading-1", name: "Heading-H1" },
];

for (const { id, name } of COMPONENTS) {
  test.describe(name, () => {
    test("light mode", async ({ page }) => {
      await page.goto(
        `/iframe.html?id=${id}&viewMode=story&globals=theme:light`,
      );
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveScreenshot(`${name}-light.png`);
    });

    test("dark mode", async ({ page }) => {
      await page.goto(
        `/iframe.html?id=${id}&viewMode=story&globals=theme:dark`,
      );
      await page.waitForLoadState("networkidle");
      // The theme decorator adds .dark to the body
      await expect(page).toHaveScreenshot(`${name}-dark.png`);
    });
  });
}
