# Resolve Fix 04: NoData Inputs, Bounding Box Selection, and Intuitive AHP Interface

This document specifies the exact, step-by-step implementation plan to resolve the requirements listed in [`Docs/Fix/Fix04.md`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/Docs/Fix/Fix04.md).

> **Target Audience**: Junior Developer or Autonomous AI Coding Agent. Follow each step sequentially, apply exact code changes, and verify with the provided test commands.

---

## 1. Requirements & Objectives Summary

1. **NoData Input Fields (Forecasting & Suitability)**:
   - For each raster upload row/card in both Forecasting (Raster Forecasting) and Suitability Modeling (MCE), add an optional numeric input field for `NoData`.
   - Default is unset (empty / `undefined`). When set by the user, this numeric value must be treated as `NoData` during processing alongside GeoTIFF metadata `noDataValue` / `NaN` values.
   - Adjust backend processing functions (`suitability.ts`, `forecasting.ts`) to support custom per-raster `noDataValue` override/specification.

2. **Bounding Box Selector Dropdown (Forecasting & Suitability)**:
   - In both Forecasting (Raster Forecasting) and Suitability Modeling (MCE), add a dropdown selector after the raster upload rows for choosing which raster defines the target bounding box / spatial grid extent.
   - Default choice is the raster uploaded in the first field (e.g. `Raster 1` / `Raster #1`).
   - The dropdown choices must dynamically reset/sync whenever the number of rasters or the uploaded raster files change.
   - Adjust backend processing (`suitability.ts`, `forecasting.ts`) to use the selected bounding box raster's dimensions, geotransform, and CRS as the reference grid.

3. **Intuitive AHP Matrix Interface (Suitability Modeling)**:
   - Improve the AHP matrix interface in Suitability Modeling to clearly distinguish editable vs. non-editable cells.
   - Use table structure matching [`Docs/Samples/MceRightPanel/right-panel.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/Docs/Samples/MceRightPanel/right-panel.ts) and Spazio styles (`table`, `tableRow`, `tableHeader`, `tableCell`, `ahpInput`, `ahpInputDisabled`, `button`, `ahpButton`).
   - Disabled cells (diagonal where `row === col` value `1.00` and lower triangle where `row > col` containing reciprocal values) must be `disabled`, styled with `ahpInputDisabled`, and typed as `text`, while upper triangle editable cells are `number` inputs with `min="0.01"`.

---

## 2. File Modification Plan

### File 1: `src/lib/SpatioProcessing/suitability.ts`
- Update `MceRasterInput`:
  ```typescript
  export interface MceRasterInput {
    file: File;
    weight: number;
    noData?: number;
  }
  ```
- Update `MceRasterProcessingOptions`:
  ```typescript
  export interface MceRasterProcessingOptions {
    bandMode?: MceBandMode;
    mode?: 'before' | 'after';
    boundingRasterIndex?: number;
  }
  ```
- In `buildMceRaster`:
  - When extracting pixel values from each raster, if `inputs[layerIndex].noData !== undefined`, treat pixels equal to `inputs[layerIndex].noData` as `NaN` (in addition to the file's native `noDataValue` and `!Number.isFinite(v)`).
  - Use `boundingRasterIndex` (default `0`) to determine the base raster reference (`base = rasters[options.boundingRasterIndex ?? 0] ?? rasters[0]`).
  - Validate dimensions against the chosen reference base raster.

### File 2: `src/lib/SpatioProcessing/forecasting.ts`
- Update `RasterInputFile`:
  ```typescript
  export interface RasterInputFile {
    file: File;
    band: number;
    datetime: string;
    noData?: number;
  }
  ```
- In `runRasterTemporalForecasting`:
  - Support `boundingRasterIndex?: number` parameter (or accept index in inputs/options).
  - When parsing and computing series for each pixel, if `input.noData !== undefined`, convert values matching `input.noData` or native `noDataValue` to `0` or appropriate masked handling.
  - Base grid/geotransform/output dimensions should come from the selected bounding raster (`parsedRasters[boundingRasterIndex] ?? parsedRasters[0]`).

### File 3: `src/lib/geolibre/right-panel.ts`
- **Suitability Modeling**:
  - In `renderRows`:
    - Add a `noDataInput` to each raster row:
      ```typescript
      const noDataInput = styleElement(document.createElement("input"), "input");
      noDataInput.type = "number";
      noDataInput.step = "any";
      noDataInput.placeholder = "NoData";
      noDataInput.setAttribute("aria-label", `NoData value for raster ${index + 1}`);
      ```
    - Maintain state for `noData` per raster.
    - Add Bounding Box selector `<select>` with label "Bounding Box Raster" styled with `methodSelect`.
    - Populate options dynamically ("Raster 1", "Raster 2", etc.) defaulting to the first uploaded raster.
    - Sync/reset options whenever raster count or file selections change.
  - In AHP Matrix rendering:
    - Replace the div-based grid with standard `<table>` elements and apply Spazio styles:
      - `table` for `<table>`
      - `tableRow` for `<tr>`
      - `tableHeader` for `<th>`
      - `tableCell` for `<td>`
      - `ahpInput` for `<input>`
      - `ahpInputDisabled` for disabled `<input>` (`disabled = true`, `type = "text"`, diagonal and lower triangle).
    - Style the "Generate weights" / "Calculate AHP weights" button with `button` and `ahpButton`.
- **Predicting Climate Change (Raster Forecasting)**:
  - In `renderRasterCards`:
    - Add a `noDataInput` to each raster card:
      ```typescript
      const noDataInput = styleElement(document.createElement("input"), "input");
      noDataInput.type = "number";
      noDataInput.step = "any";
      noDataInput.placeholder = "NoData";
      noDataInput.setAttribute("aria-label", `NoData value for raster #${index + 1}`);
      ```
    - Maintain state for `noData` in `rasterInputsState`.
    - Add Bounding Box selector `<select>` with label "Bounding Box Raster" styled with `methodSelect`.
    - Populate options dynamically ("Raster #1", "Raster #2", etc.) defaulting to the first uploaded raster.
    - Sync/reset options whenever raster count or files change.
    - Pass bounding raster selection and `noData` values to `runRasterTemporalForecasting`.

### File 4: `tests/right-panel.test.ts`
- Add unit tests verifying:
  - `NoData` inputs are rendered in both Suitability and Forecasting raster rows.
  - Bounding Box selector dropdowns are rendered with Spazio dropdown styles and default to the first raster.
  - AHP matrix renders disabled cells with `spazio-ahp-input-disabled` / `disabled` attribute and enabled upper triangle with `spazio-ahp-input`.
  - Processing functions correctly receive `noData` and bounding box options.

---

## 3. Verification Commands

Run Vitest:
```bash
npx vitest run tests/right-panel.test.ts
```
