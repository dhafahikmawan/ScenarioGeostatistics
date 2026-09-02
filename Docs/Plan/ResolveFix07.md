# Resolve Fix 07: Dynamic Decimal Places & Configurable Rounding for MCE & AHP

This document provides a comprehensive, step-by-step implementation plan for resolving all issues described in [`Docs/Fix/Fix07.md`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/Docs/Fix/Fix07.md).

> **Target Audience**: Junior Developer or Autonomous AI Coding Agent. Follow each step sequentially, apply the exact code changes specified, and verify using the provided test commands.

---

## 1. Requirements Breakdown & Objectives

### Problem Statement (from `Docs/Fix/Fix07.md`)
1. In the **MCE (Multi-Criteria Evaluation) section of Suitability Modeling**, the UI currently restricts weights and AHP (Analytic Hierarchy Process) inputs to at most 2 decimal places (`step = "0.01"` and `.toFixed(2)`).
2. The system should accept inputs with **any number of decimal places** in:
   - MCE raster weight inputs.
   - AHP pairwise comparison table inputs & reciprocal values.
3. Automatically round weights to the nearest **N** decimal places (default: `5`) when using them in calculations.
4. The target rounding decimal places must be configurable via a new developer constant/variable:
   ```typescript
   export const DECIMAL_PLACES_ROUNDING = 5;
   ```
   in [`src/lib/geolibre/right-panel.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/src/lib/geolibre/right-panel.ts).

---

## 2. Technical Analysis & Solution Architecture

### 2.1 Current Limitations in Codebase
In [`src/lib/geolibre/right-panel.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/src/lib/geolibre/right-panel.ts):
1. **Weight Input Field**:
   ```typescript
   number.step = "0.01";
   slider.step = "0.01";
   ```
   This prevents users from inputting finer decimal values (e.g. `0.33333` or `0.123456`) in HTML5 number inputs without triggering browser validation errors or stepping by `0.01`.
2. **AHP Matrix Inputs**:
   ```typescript
   input.step = "0.01";
   ```
   Restricts pairwise comparison values to 2 decimal places.
3. **AHP Reciprocal Calculation**:
   ```typescript
   reciprocalInput.value = (1 / safeValue).toFixed(2);
   ```
   Hardcodes reciprocal calculation to 2 decimal places instead of preserving precision or displaying arbitrary decimal places.
4. **MCE Calculation**:
   ```typescript
   weight: Number(weightInputs[index].value)
   ```
   Directly parses the raw input without rounding to the configured decimal places.

### 2.2 Helper Function: Rounding to N Decimal Places
To reliably round floating point numbers to `N` decimal places without standard binary float precision artifacts:
```typescript
export function roundToDecimals(value: number, decimals: number = DECIMAL_PLACES_ROUNDING): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
```

---

## 3. Step-by-Step Implementation Plan

### Step 1: Add `DECIMAL_PLACES_ROUNDING` and `roundToDecimals` in `src/lib/geolibre/right-panel.ts`

**Location**: [`src/lib/geolibre/right-panel.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/src/lib/geolibre/right-panel.ts)

1. Near top-level constants (around lines 50–65), export the new variable and helper:
```typescript
/** Developer variable configuring target decimal places for MCE weight calculations. Default is 5. */
export const DECIMAL_PLACES_ROUNDING = 5;

/** Utility function to round a number to the configured number of decimal places. */
export function roundToDecimals(value: number, decimals: number = DECIMAL_PLACES_ROUNDING): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
```

---

### Step 2: Update MCE Weight Inputs in `renderRows`

**Location**: [`src/lib/geolibre/right-panel.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/src/lib/geolibre/right-panel.ts) (inside `renderRows` function)

1. Change `number.step = "0.01";` on the weight input to `number.step = "any";`.
2. Change `slider.step = "0.01";` on the range input to `slider.step = "any";`.

```typescript
// Inside renderRows:
const number = styleElement(document.createElement("input"), "mceWeightInput");
number.type = "number";
number.min = "0";
number.max = "1";
number.step = "any";

const slider = styleElement(document.createElement("input"), "range");
slider.type = "range";
slider.min = "0";
slider.max = "1";
slider.step = "any";
```

---

### Step 3: Update AHP Matrix Inputs and Reciprocal Calculation in `renderMatrix`

**Location**: [`src/lib/geolibre/right-panel.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/src/lib/geolibre/right-panel.ts) (inside `renderMatrix` and `generateWeights` event listener)

1. Change `input.step = "0.01";` on the AHP matrix input to `input.step = "any";`.
2. Change `input.min = "0.01";` to `input.min = "0";` (allowing arbitrary positive decimal values).
3. In the reciprocal calculation listener:
   - Calculate reciprocal value rounded to `DECIMAL_PLACES_ROUNDING` (or clean arbitrary representation).
4. In `generateWeights` click handler:
   - Format normalized priority weights into `weightInputs[index].value` using `roundToDecimals(value / total, DECIMAL_PLACES_ROUNDING)`.

```typescript
// Inside renderMatrix:
input.type = isDiagonal || isLowerTriangle ? "text" : "number";
input.min = "0";
input.step = "any";
input.value = "1";

// Reciprocal calculation:
input.addEventListener("input", () => {
  const parsedValue = parseFloat(input.value);
  const safeValue = Number.isNaN(parsedValue) || parsedValue <= 0 ? 1 : parsedValue;
  reciprocalInput.value = String(roundToDecimals(1 / safeValue, DECIMAL_PLACES_ROUNDING));
});
```

---

### Step 4: Apply Rounding When Using Weights for Calculation

**Location**: [`src/lib/geolibre/right-panel.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/src/lib/geolibre/right-panel.ts) (inside `form.addEventListener("submit", ...)` for Suitability Modeling)

1. When building `inputs: MceRasterInput[]`, round the parsed weight to `DECIMAL_PLACES_ROUNDING`:
```typescript
// Before:
weight: Number(weightInputs[index].value),

// After:
weight: roundToDecimals(Number(weightInputs[index].value) || 0, DECIMAL_PLACES_ROUNDING),
```

---

### Step 5: Unit Tests & Verification

**Location**: [`tests/right-panel.test.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/tests/right-panel.test.ts)

1. Add tests in `tests/right-panel.test.ts` to verify:
   - `DECIMAL_PLACES_ROUNDING` is exported and defaults to `5`.
   - `roundToDecimals` correctly rounds numbers to `DECIMAL_PLACES_ROUNDING` decimal places.
   - MCE weight inputs and AHP table inputs have `step="any"` (accepting arbitrary decimals).
   - AHP reciprocal calculation produces values beyond 2 decimal places (e.g. `1/3` -> `0.33333`).
   - MCE weight calculation accurately applies `roundToDecimals`.

---

## 4. Summary of Files to Modify

| File | Changes |
|---|---|
| [`src/lib/geolibre/right-panel.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/src/lib/geolibre/right-panel.ts) | Export `DECIMAL_PLACES_ROUNDING = 5` and `roundToDecimals()`. Change `step` to `"any"` on MCE weights and AHP inputs. Update reciprocal logic and MCE submit handler to round weights to `DECIMAL_PLACES_ROUNDING`. |
| [`tests/right-panel.test.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/tests/right-panel.test.ts) | Add unit tests validating `DECIMAL_PLACES_ROUNDING`, `roundToDecimals`, arbitrary decimal input support, and automatic rounding during calculation. |

---

## 5. Verification Commands

Run unit tests to ensure all tests pass and no regression occurs:
```bash
npx vitest run tests/right-panel.test.ts
```
