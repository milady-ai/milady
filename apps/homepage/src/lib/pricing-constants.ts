/**
 * Centralized pricing constants for Eliza Cloud hosting.
 * Update these values here; they propagate to all UI components.
 */

/** Cost per hour (numeric) while an agent is actively running (USD) */
export const PRICE_RUNNING_HR_VALUE = 0.01;

/** Cost per hour (numeric) while an agent is idle / suspended (USD) */
export const PRICE_IDLE_HR_VALUE = 0.0025;

/** Minimum deposit amount (numeric, USD) — fallback when API doesn't provide a value */
export const PRICE_MIN_DEPOSIT_VALUE = 5.0;

// --- Pre-formatted display strings used directly in JSX ---

/** "$0.01" — append "/hr" at call site as needed */
export const PRICE_RUNNING_PER_HR = `$${PRICE_RUNNING_HR_VALUE.toFixed(2)}`;

/** "$0.0025" — append "/hr" at call site as needed */
export const PRICE_IDLE_PER_HR = `$${PRICE_IDLE_HR_VALUE}`;

/** "$5.00" */
export const MIN_DEPOSIT_DISPLAY = `$${PRICE_MIN_DEPOSIT_VALUE.toFixed(2)}`;
