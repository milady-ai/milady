/**
 * Autofill engine.
 *
 * Receives an autofill instruction (from the background service worker,
 * which proxies the agent's `REQUEST_FIELD_FILL` action) and:
 *
 *   1. Checks the current tab's registrable domain against the effective
 *      whitelist. If not whitelisted, refuses — even if the agent asks.
 *   2. Delegates to a password-manager bridge (1Password, ProtonPass) to
 *      resolve the actual credential. The PM injects the value; the
 *      engine only identifies candidate fields and calls the React-patched
 *      setter when the bridge returns a value to write.
 *
 * Credential material does not flow through the agent: the bridge either
 * resolves-and-fills in one step on the PM side, or returns a value the
 * content script writes directly to a DOM input without re-exposing it.
 */
import { createLogger } from "../logger.js";
import { isWhitelisted } from "./whitelist.js";

const log = createLogger("autofill.engine");

export type FieldPurpose = "email" | "password" | "name" | "phone" | "custom";

export interface AutofillInstruction {
  readonly tabUrl: string;
  readonly fieldPurpose: FieldPurpose;
  readonly fieldSelector?: string;
  readonly customKey?: string;
}

export interface AutofillBridgeRequest {
  readonly tabUrl: string;
  readonly fieldPurpose: FieldPurpose;
  readonly fieldSelector?: string;
  readonly customKey?: string;
}

export type AutofillBridgeResponse =
  | {
      readonly success: true;
      /** Selectors or purposes the PM confirmed it filled. */
      readonly filledFields: readonly string[];
    }
  | {
      readonly success: false;
      readonly reason: string;
    };

export interface AutofillBridge {
  readonly name: string;
  requestFill(request: AutofillBridgeRequest): Promise<AutofillBridgeResponse>;
}

export type AutofillRefusalReason =
  | "not-whitelisted"
  | "no-bridge-available"
  | "password-manager-not-installed"
  | "password-manager-refused"
  | "password-manager-error"
  | "invalid-url";

export type AutofillResult =
  | {
      readonly success: true;
      readonly bridge: string;
      readonly matchedDomain: string;
      readonly filledFields: readonly string[];
    }
  | {
      readonly success: false;
      readonly reason: AutofillRefusalReason | string;
      readonly registrableDomain: string | null;
    };

export interface AutofillEngineOptions {
  readonly whitelist: readonly string[];
  readonly bridges: readonly AutofillBridge[];
}

export class AutofillEngine {
  private readonly whitelist: readonly string[];
  private readonly bridges: readonly AutofillBridge[];

  constructor(options: AutofillEngineOptions) {
    this.whitelist = options.whitelist;
    this.bridges = options.bridges;
  }

  async execute(instruction: AutofillInstruction): Promise<AutofillResult> {
    const check = isWhitelisted(instruction.tabUrl, this.whitelist);
    if (!check.registrableDomain) {
      log.warn("Autofill refused: invalid URL", { tabUrl: instruction.tabUrl });
      return {
        success: false,
        reason: "invalid-url",
        registrableDomain: null,
      };
    }
    if (!check.allowed) {
      log.warn("Autofill refused: non-whitelisted domain", {
        registrableDomain: check.registrableDomain,
        fieldPurpose: instruction.fieldPurpose,
      });
      return {
        success: false,
        reason: "not-whitelisted",
        registrableDomain: check.registrableDomain,
      };
    }

    if (this.bridges.length === 0) {
      return {
        success: false,
        reason: "no-bridge-available",
        registrableDomain: check.registrableDomain,
      };
    }

    let lastReason: string = "password-manager-not-installed";
    for (const bridge of this.bridges) {
      const response = await bridge.requestFill({
        tabUrl: instruction.tabUrl,
        fieldPurpose: instruction.fieldPurpose,
        ...(instruction.fieldSelector !== undefined
          ? { fieldSelector: instruction.fieldSelector }
          : {}),
        ...(instruction.customKey !== undefined
          ? { customKey: instruction.customKey }
          : {}),
      });
      if (response.success) {
        log.info("Autofill succeeded", {
          bridge: bridge.name,
          registrableDomain: check.registrableDomain,
          fieldPurpose: instruction.fieldPurpose,
        });
        return {
          success: true,
          bridge: bridge.name,
          matchedDomain: check.matched ?? check.registrableDomain,
          filledFields: response.filledFields,
        };
      }
      lastReason = response.reason;
    }
    return {
      success: false,
      reason: lastReason,
      registrableDomain: check.registrableDomain,
    };
  }
}

/**
 * Fill a DOM input using React's synthetic-event patched value setter.
 *
 * React overrides the prototype `value` setter on mount to track state; a
 * plain `element.value = x` bypasses that tracker and React overwrites the
 * value on the next render. The workaround is to grab the original
 * descriptor and call it explicitly, then dispatch an `input` event so
 * React's onChange fires.
 *
 * Content scripts call this directly when a bridge returns a value to
 * write. It is exported for use by the content script and for unit tests.
 */
export function setReactCompatibleInputValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const proto =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  const nativeSetter = descriptor?.set;
  if (nativeSetter) {
    nativeSetter.call(element, value);
  } else {
    element.value = value;
  }
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Locate candidate fields in the current document that match a given
 * purpose. Used by the content script when the bridge hands back a raw
 * value to inject. Returns an empty array if nothing plausible is found.
 */
export function findFieldsForPurpose(
  doc: Document,
  purpose: FieldPurpose,
  explicitSelector?: string,
): readonly HTMLInputElement[] {
  if (explicitSelector) {
    const nodes = doc.querySelectorAll<HTMLInputElement>(explicitSelector);
    return Array.from(nodes).filter(
      (n): n is HTMLInputElement => n instanceof HTMLInputElement,
    );
  }
  const inputs = Array.from(
    doc.querySelectorAll<HTMLInputElement>("input"),
  ).filter((n): n is HTMLInputElement => n instanceof HTMLInputElement);
  switch (purpose) {
    case "email":
      return inputs.filter(
        (i) =>
          i.type === "email" ||
          /email/i.test(i.name) ||
          /email/i.test(i.id) ||
          i.autocomplete === "email" ||
          i.autocomplete === "username",
      );
    case "password":
      return inputs.filter(
        (i) =>
          i.type === "password" ||
          i.autocomplete === "current-password" ||
          i.autocomplete === "new-password",
      );
    case "name":
      return inputs.filter(
        (i) =>
          /name/i.test(i.name) ||
          /name/i.test(i.id) ||
          i.autocomplete === "name",
      );
    case "phone":
      return inputs.filter(
        (i) =>
          i.type === "tel" ||
          /phone|tel/i.test(i.name) ||
          i.autocomplete === "tel",
      );
    case "custom":
      return [];
  }
}
