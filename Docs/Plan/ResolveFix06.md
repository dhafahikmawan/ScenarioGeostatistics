# Resolve Fix 06: NoData Handling & Raster Forecasting UI Refactor

This document specifies the exact, step-by-step implementation plan to resolve all requirements listed in [`Docs/Fix/Fix06.md`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/Docs/Fix/Fix06.md).

> **Target Audience**: Junior Developer or Autonomous AI Coding Agent. Follow each step sequentially, apply exact code changes, and verify with the provided test commands.

---

## 1. Requirements & Objectives Breakdown

### Problem 1: NoData & Bounding Box Clipping Handling
1. **Source Raster & User Input NoData**:
   - `NoData` that originates from the source raster (`raster.noDataValue` or invalid/non-finite numbers) and from user-specified `NoData` values must **always** be treated as `NaN` (in both Suitability Modeling's MCE and Raster Forecasting).
2. **Bounding Box Clipping NoData**:
   - Pixels that fall outside an input raster's spatial extent during bounding box alignment/clipping must be treated according to a user selection:
     - Treat as `0`
     - Treat as `NaN`
3. **UI Controls**:
   - Add a dropdown field in both **Suitability Modeling (MCE)** and **Predicting Climate Change (Raster Forecasting)** for "Bounding Box Clipping NoData" / "Bounding Box NoData Treatment".
   - Options:
     - `NaN` (Treat as NaN)
     - `0` (Treat as 0)
   - Default value: `NaN`.

### Problem 2: Raster Forecasting Input Fields UI Layout
- **Current Behavior**: In Raster Forecasting, input fields are grouped across two lines inside each raster card:
  - Line 1: `Choose File` and `Select Band`
  - Line 2: `Timestamp` and `NoData`
- **Required Behavior**:
  - Change the rendering inside each raster card so that `Choose File`, `Select Band`, `Timestamp`, and `NoData` are **each on their own line** (vertically stacked, 4 lines per card) instead of being grouped into 2 lines.

---

## 2. Technical Architecture & Data Flow

### Grid Alignment Strategy (`alignRasterToGrid`)
Update `alignRasterToGrid` in `src/lib/utils/geotiff-processor.ts` to differentiate between:
- **Source / User NoData** (pixels inside source bounds where value equals `source.noDataValue`, `customNoData`, or is not finite) -> **always `NaN`**.
- **Clipping / Out-of-Bounds NoData** (pixels outside the source extent when aligned to the target bounding box grid) -> filled with either `NaN` or `0` based on `clipNoDataTreatment: '0' | 'NaN'`.

```
Target Grid Pixel (tx, ty)
        |
        +--> Map to Source Coordinates (sx, sy)
        |
        +--> Outside Source Extent (sx < 0 || sx >= width || sy < 0 || sy >= height)?
        |         |-- YES --> Output (clipNoDataTreatment === '0' ? 0 : NaN)
        |         +-- NO  --> Check Pixel Value in Source Raster
        |                      |-- Is Native NoData / Custom NoData / Non-finite?
        |                      |    +--> Output NaN (Always!)
        |                      +-- Valid Number?
        |                           +--> Output raw value
```

---

## 3. Step-by-Step Implementation Plan

### Step 1: Update `alignRasterToGrid` in `src/lib/utils/geotiff-processor.ts`

**Location**: [`src/lib/utils/geotiff-processor.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/src/lib/utils/geotiff-processor.ts)

1. Define option type for clipping NoData treatment:
```typescript
export type ClipNoDataTreatment = '0' | 'NaN';
```
2. Update options for `alignRasterToGrid`:
```typescript
export function alignRasterToGrid(
  source: RasterSource,
  target: RasterSource,
  options: {
    bandIndex?: number;
    customNoData?: number;
    clipNoDataTreatment?: ClipNoDataTreatment;
  } = {},
): Float32Array
```
3. In `alignRasterToGrid`:
   - Out-of-bounds fill value:
     ```typescript
     const clipFillValue = options.clipNoDataTreatment === '0' ? 0 : NaN;
     ```
   - When coordinates `sourceX < 0 || sourceX >= source.width || sourceY < 0 || sourceY >= source.height`:
     ```typescript
     result[targetIndex] = clipFillValue;
     ```
   - When source pixel is a valid coordinate within bounds but matches `isNoData(value)`:
     ```typescript
     result[targetIndex] = NaN; // ALWAYS NaN for source / user input NoData
     ```

---

### Step 2: Update Suitability Modeling Backend (`src/lib/SpatioProcessing/suitability.ts`)

**Location**: [`src/lib/SpatioProcessing/suitability.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/src/lib/SpatioProcessing/suitability.ts)

1. Update `MceRasterProcessingOptions`:
```typescript
export interface MceRasterProcessingOptions {
  bandMode?: MceBandMode;
  mode?: 'before' | 'after';
  boundingRasterIndex?: number;
  clipNoDataTreatment?: '0' | 'NaN';
}
```
2. Pass `clipNoDataTreatment: options.clipNoDataTreatment ?? 'NaN'` into all `alignRasterToGrid(...)` calls inside `buildMceRaster`.
3. In layer weighted combination:
   - Ensure that `NaN` values are properly skipped when accumulating weighted values, and if all layers are `NaN` for a pixel, the result remains `NaN`.

---

### Step 3: Update Raster Forecasting Backend (`src/lib/SpatioProcessing/forecasting.ts`)

**Location**: [`src/lib/SpatioProcessing/forecasting.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/src/lib/SpatioProcessing/forecasting.ts)

1. Update `runRasterTemporalForecasting` parameters:
```typescript
export async function runRasterTemporalForecasting(
  inputs: RasterInputFile[],
  steps: number,
  method: string,
  arimaParams: ArimaParams,
  boundingRasterIndex = 0,
  clipNoDataTreatment: '0' | 'NaN' = 'NaN',
): Promise<Array<{ name: string; blob: Blob; date: string; warning: string }>>
```
2. Pass `clipNoDataTreatment` into `alignRasterToGrid`:
```typescript
const alignedRasters = parsedRasters.map((raster) => ({
  ...raster,
  alignedData: alignRasterToGrid(raster, base, {
    bandIndex: raster.bandIndex,
    customNoData: raster.noData,
    clipNoDataTreatment,
  }),
}));
```
3. For time series evaluation per pixel:
   - Make sure source / user NoData (`NaN`) is handled gracefully, preserving missing values or converting per model rules while respecting `clipNoDataTreatment` for out-of-bounds regions.

---

### Step 4: Update UI in `src/lib/geolibre/right-panel.ts`

**Location**: [`src/lib/geolibre/right-panel.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/src/lib/geolibre/right-panel.ts)

#### 1. Suitability Modeling (MCE UI):
1. Add Bounding Box Clipping NoData dropdown below Bounding Box Raster selector:
```typescript
const mceClipNoDataSelect = styleElement(document.createElement("select"), "methodSelect");
drawDropdownOptions(mceClipNoDataSelect, ["NaN", "0"], ["Treat as NaN", "Treat as 0"]);
```
2. Append `fieldLabel("Bounding Box Clipping NoData", mceClipNoDataSelect)` to `mceSection`.
3. In the form submit handler for MCE:
```typescript
input = await buildMceRaster(inputs, {
  boundingRasterIndex: Number(boundingRasterSelect.value) || 0,
  clipNoDataTreatment: mceClipNoDataSelect.value as "0" | "NaN",
});
```

#### 2. Predicting Climate Change (Raster Forecasting UI):
1. Add Bounding Box Clipping NoData dropdown below Bounding Box Raster selector:
```typescript
const forecastClipNoDataSelect = styleElement(document.createElement("select"), "methodSelect");
drawDropdownOptions(forecastClipNoDataSelect, ["NaN", "0"], ["Treat as NaN", "Treat as 0"]);
```
2. Append `fieldLabel("Bounding Box Clipping NoData", forecastClipNoDataSelect)` to `rasterSection`.
3. Modify `renderRasterCards`:
   - Render `Choose File`, `Select Band`, `Timestamp`, and `NoData` so each is on its own separate line:
```typescript
// Inside renderRasterCards for each card:
const card = styleElement(document.createElement("div"), "mceRow");
const cardTitle = styleElement(document.createElement("span"), "text");
cardTitle.textContent = `Raster #${index + 1}`;

const fileInput = styleElement(document.createElement("input"), "fileField");
fileInput.type = "file";
fileInput.accept = ".tif,.tiff,image/tiff";

const bandSelect = styleElement(document.createElement("select"), "methodSelect");

const dateInput = styleElement(document.createElement("input"), "input");
dateInput.type = "datetime-local";
dateInput.value = state.datetime;

const noDataInput = styleElement(document.createElement("input"), "input");
noDataInput.type = "number";
noDataInput.step = "any";
noDataInput.placeholder = "NoData";
noDataInput.setAttribute("aria-label", `NoData value for raster #${index + 1}`);
noDataInput.value = state.noData === undefined ? "" : String(state.noData);

// Append each field on its own line:
card.append(
  cardTitle,
  fieldLabel("Choose File", fileInput),
  fieldLabel("Select Band", bandSelect),
  fieldLabel("Timestamp", dateInput),
  fieldLabel("NoData", noDataInput),
);
```
4. In the form submit handler for Raster Forecasting:
```typescript
const outputs = await runRasterTemporalForecasting(
  normalizedInputs,
  steps,
  methodSelect.value,
  arimaParams,
  Number(boundingRasterSelect.value) || 0,
  forecastClipNoDataSelect.value as "0" | "NaN"
);
```

---

## 4. Test & Verification Plan

### Automated Tests
1. **Unit tests for `alignRasterToGrid`**:
   - Verify that out-of-bounds pixels receive `0` when `clipNoDataTreatment = '0'`.
   - Verify that out-of-bounds pixels receive `NaN` when `clipNoDataTreatment = 'NaN'`.
   - Verify that pixels matching `source.noDataValue` or `customNoData` always receive `NaN` regardless of `clipNoDataTreatment`.
2. **UI Tests in `tests/right-panel.test.ts`**:
   - Check that "Bounding Box Clipping NoData" dropdowns exist in both MCE and Raster Forecasting with options `"NaN"` and `"0"`.
   - Check that Raster Forecasting cards contain `Choose File`, `Select Band`, `Timestamp`, and `NoData` on individual lines (direct children of card / field labels without 2-field flex row grouping).

### Test Commands
```bash
npx vitest run tests/right-panel.test.ts
```

---

## 5. Summary of Files to Modify

| File | Changes |
|---|---|
| `src/lib/utils/geotiff-processor.ts` | Support `clipNoDataTreatment: '0' | 'NaN'` option in `alignRasterToGrid` while keeping source/user NoData strictly as `NaN` |
| `src/lib/SpatioProcessing/suitability.ts` | Accept and pass `clipNoDataTreatment` option in `buildMceRaster` |
| `src/lib/SpatioProcessing/forecasting.ts` | Accept and pass `clipNoDataTreatment` parameter in `runRasterTemporalForecasting` |
| `src/lib/geolibre/right-panel.ts` | Add clipping NoData dropdowns to MCE and Raster Forecasting; refactor Raster Forecasting cards to single-line fields per attribute |
| `tests/right-panel.test.ts` | Update and add unit tests covering the new dropdowns and single-line card rendering |
