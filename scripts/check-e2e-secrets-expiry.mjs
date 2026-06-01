#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const dayMs = 24 * 60 * 60 * 1000;

function flag(name, fallback = "") {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
}

function opJson(commandArgs) {
  const output = execFileSync("op", [...commandArgs, "--format", "json"], {
    encoding: "utf8",
  });
  return JSON.parse(output);
}

function fieldLabel(field) {
  return String(field?.label ?? field?.id ?? "");
}

function fieldValue(field) {
  if (typeof field?.value === "string") return field.value.trim();
  return "";
}

function expirationFields(item) {
  const fields = Array.isArray(item.fields) ? item.fields : [];
  return fields.filter((field) =>
    /expir|renew|rotate by|valid until/i.test(fieldLabel(field)),
  );
}

const vault = flag("--vault", "milady-e2e");
const warnDays = Number.parseInt(flag("--warn-days", "7"), 10);
if (!Number.isFinite(warnDays) || warnDays < 0) {
  throw new Error("--warn-days must be a non-negative integer");
}

const items = opJson(["item", "list", "--vault", vault]);
const now = Date.now();
const expiring = [];
let metadataFields = 0;

for (const item of items) {
  const id = item.id ?? item.title;
  if (!id) continue;
  const detail = opJson(["item", "get", id, "--vault", vault]);
  for (const field of expirationFields(detail)) {
    metadataFields += 1;
    const rawValue = fieldValue(field);
    const timestamp = Date.parse(rawValue);
    if (!Number.isFinite(timestamp)) continue;
    const daysRemaining = Math.ceil((timestamp - now) / dayMs);
    if (daysRemaining <= warnDays) {
      expiring.push({
        title: detail.title ?? id,
        label: fieldLabel(field),
        value: rawValue,
        daysRemaining,
      });
    }
  }
}

console.log("## E2E secret expiration check");
console.log("");
console.log(`Vault: \`${vault}\``);
console.log(`Warning window: ${warnDays} day(s)`);
console.log("");

if (expiring.length === 0) {
  console.log(
    metadataFields === 0
      ? "No expiration metadata fields were found."
      : "No tracked E2E secrets expire inside the warning window.",
  );
  process.exit(0);
}

console.log("| Item | Field | Expires | Days remaining |");
console.log("|------|-------|---------|----------------|");
for (const entry of expiring) {
  console.log(
    `| ${entry.title} | ${entry.label} | ${entry.value} | ${entry.daysRemaining} |`,
  );
}

throw new Error(
  `${expiring.length} E2E secret(s) expire inside the warning window`,
);
