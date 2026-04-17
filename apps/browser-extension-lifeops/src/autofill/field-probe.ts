/**
 * Identifies fillable fields on the current page without touching them.
 *
 * T8e is scoped to detection only — autofill injection lives in T8f.
 * The probe reports field metadata (name, type, autocomplete token)
 * to the background worker, which can forward it to the agent when
 * requested.
 */

export interface ProbedField {
  readonly name: string;
  readonly type: string;
  readonly autocomplete: string | null;
}

export function probeFillableFields(root: Document): readonly ProbedField[] {
  const inputs = root.querySelectorAll<HTMLInputElement>(
    "input, textarea, select",
  );
  const results: ProbedField[] = [];
  for (const el of Array.from(inputs)) {
    if (!isFillable(el)) {
      continue;
    }
    const type = (
      el.getAttribute("type") ?? el.tagName.toLowerCase()
    ).toLowerCase();
    const nameAttr = el.getAttribute("name") ?? el.getAttribute("id") ?? "";
    if (nameAttr.length === 0) {
      continue;
    }
    results.push({
      name: nameAttr,
      type,
      autocomplete: el.getAttribute("autocomplete"),
    });
  }
  return results;
}

function isFillable(el: Element): boolean {
  if (
    !(
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement
    )
  ) {
    return false;
  }
  if (el.disabled) {
    return false;
  }
  if (
    (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) &&
    el.readOnly
  ) {
    return false;
  }
  const style = el.ownerDocument?.defaultView?.getComputedStyle(el);
  if (style && (style.display === "none" || style.visibility === "hidden")) {
    return false;
  }
  if (el instanceof HTMLInputElement) {
    const t = (el.getAttribute("type") ?? "text").toLowerCase();
    if (t === "hidden" || t === "submit" || t === "button" || t === "reset") {
      return false;
    }
  }
  return true;
}
