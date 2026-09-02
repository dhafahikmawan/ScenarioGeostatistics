# Resolve Fix 05: Dimension Alignment Clipping and Raster Input Fields UI

This document specifies the exact, step-by-step implementation plan to resolve all requirements listed in [`Docs/Fix/Fix05.md`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/Docs/Fix/Fix05.md).

> **Target Audience**: Junior Developer or Autonomous AI Coding Agent. Follow each step sequentially, apply exact code changes, and verify with the provided test commands.

---

## 1. Requirements & Problem Breakdown

### Problem 1: Dimension Mismatch in Suitability Modeling & Raster Forecasting
- **Current Behavior**: Both `buildMceRaster` in `src/lib/SpatioProcessing/suitability.ts` and `runRasterTemporalForecasting` in `src/lib/SpatioProcessing/forecasting.ts` throw a hard error when input raster dimensions do not match the base/reference raster.
- **Required Behavior**:
  - Do **not** fail if raster dimensions mismatch.
  - Use the selected bounding box raster as the reference grid (its `width`, `height`, `geotransform`, and `crsCode`).
  - Clip/sample every input raster to the bounding box raster's grid.
  - If a pixel in the bounding box grid falls outside a given input raster's spatial extent or has missing/NoData values, treat that value as `NaN` (or `0` / handled per model in forecasting).
  - Both processes require all user input rasters to share the same CRS (check `raster.crsCode === base.crsCode`; throw error if CRS mismatch).

### Problem 2: MCE Raster Input Fields UI
- **Current Behavior**: In Suitability Modeling -> Generate MCE Raster, the raster input fields are rendered as a simple single line per raster: `row.append(fieldLabel('Raster ...', file), fieldLabel('Weight', weight), weightValue, fieldLabel('NoData', noDataInput))`.
- **Required Behavior**:
  - Render each raster input field matching the MCE reference layout in [`Docs/Samples/MceRightPanel/right-panel.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/Docs/Samples/MceRightPanel/right-panel.ts).
  - Use the `mceRow` container style (`applyRightPanelStyle(row, "mceRow")`), label span with `applyRightPanelStyle(label, "text")`, file input (`applyRightPanelStyle(file, "input")`), NoData input (`applyRightPanelStyle(noDataInput, "mceWeightInput")`), numeric weight input (`applyRightPanelStyle(number, "mceWeightInput")`), and range slider (`applyRightPanelStyle(slider, "range")`).
  - Wire synchronization between the number input and slider for weights, matching the reference structure.

### Problem 3: Raster Forecasting Input Fields UI
- **Current Behavior**: In Predicting Climate Change -> Raster Forecasting, raster input fields are rendered in one horizontal line inside a `formRow`.
- **Required Behavior**:
  - Make raster input fields card-based, styled similarly to MCE in [`Docs/Samples/MceRightPanel/right-panel.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/Docs/Samples/MceRightPanel/right-panel.ts).
  - Specifications:
    1. Each input raster field is its own card (`mceRow` / card container).
    2. The title `Raster #<number>` is rendered at the top of each card using the same label style as MCE (`strong` or `span` styled with `"text"`).
    3. `Choose File` and `Select Band` are in the same line (a horizontal flex row).
    4. Underneath them is the `Timestamp Field` and `NoData Field`.

---

## 2. Technical Design & Spatial Alignment Algorithm

### Resampling / Clipping to Reference Bounding Box
Given a reference/bounding raster $B$ and an input raster $R$ (both in the same CRS):
- Geotransform: $[X_0, \Delta X, 0, Y_0, 0, \Delta Y]$ where $(X_0, Y_0)$ is the origin, $\Delta X$ is pixel width (positive), and $\Delta Y$ is pixel height (negative).
- For each target pixel $(x_B, y_B)$ in grid $B$ ($0 \le x_B < \text{width}_B$, $0 \le y_B < \text{height}_B$):
  - Target world coordinates:
    $$\text{worldX} = X_{0,B} + (x_B + 0.5) \times \Delta X_B$$
    $$\text{worldY} = Y_{0,B} + (y_B + 0.5) \times \Delta Y_B$$
  - Source raster $R$ continuous pixel coordinates:
    $$x_R = \frac{\text{worldX} - X_{0,R}}{\Delta X_R}$$
    $$y_R = \frac{\text{worldY} - Y_{0,R}}{\Delta Y_R}$$
  - Nearest-neighbor source pixel indices:
    $$\text{srcX} = \lfloor x_R \rfloor, \quad \text{srcY} = \lfloor y_R \rfloor$$
  - If $\text{srcX} < 0$ or $\text{srcX} \ge \text{width}_R$ or $\text{srcY} < 0$ or $\text{srcY} \ge \text{height}_R$:
    - The pixel is outside raster $R$'s extent $\rightarrow$ value is `NaN`.
  - Otherwise, extract the band value at index $(\text{srcY} \times \text{width}_R + \text{srcX}) \times \text{bandCount}_R + \text{bandIdx}$. If value equals $R$'s `noDataValue` or custom `noData`, value is `NaN`.

---

## 3. Step-by-Step Implementation Plan

### Step 1: Add Raster Resampling / Grid Alignment Helper
**File**: `src/lib/utils/geotiff-processor.ts`
1. Export a helper function:
```typescript
/**
 * Resamples / clips a source raster to the spatial grid of a target reference raster.
 * Missing data or pixels outside the source extent are filled with NaN.
 */
export function alignRasterToGrid(
  source: RasterSource,
  target: RasterSource,
  options: {
    bandIndex?: number;
    customNoData?: number;
  } = {}
): Float32Array {
  if (source.crsCode !== target.crsCode) {
    throw new Error(`CRS mismatch: Source CRS (${source.crsCode}) does not match target CRS (${target.crsCode}).`);
  }

  // Fast path: identical dimensions and geotransform
  const isSameGrid =
    source.width === target.width &&
    source.height === target.height &&
    source.geotransform.every((val, idx) => Math.abs(val - target.geotransform[idx]) < 1e-6);

  const targetPixels = target.width * target.height;
  const result = new Float32Array(targetPixels);
  const bandIndex = options.bandIndex ?? 0;
  const customNoData = options.customNoData;

  const isNoData = (val: number) =>
    !Number.isFinite(val) ||
    (customNoData !== undefined && val === customNoData) ||
    (source.noDataValue !== undefined && val === source.noDataValue);

  if (isSameGrid) {
    for (let i = 0; i < targetPixels; i++) {
      const val = source.data[i * source.bandCount + bandIndex];
      result[i] = isNoData(val) ? NaN : val;
    }
    return result;
  }

  const [tX0, tScaleX, , tY0, , tScaleY] = target.geotransform;
  const [sX0, sScaleX, , sY0, , sScaleY] = source.geotransform;

  for (let ty = 0; ty < target.height; ty++) {
    const worldY = tY0 + (ty + 0.5) * tScaleY;
    const sy = Math.floor((worldY - sY0) / sScaleY);

    for (let tx = 0; tx < target.width; tx++) {
      const targetIdx = ty * target.width + tx;
      if (sy < 0 || sy >= source.height) {
        result[targetIdx] = NaN;
        continue;
      }
      const worldX = tX0 + (tx + 0.5) * tScaleX;
      const sx = Math.floor((worldX - sX0) / sScaleX);

      if (sx < 0 || sx >= source.width) {
        result[targetIdx] = NaN;
        continue;
      }

      const val = source.data[(sy * source.width + sx) * source.bandCount + bandIndex];
      result[targetIdx] = isNoData(val) ? NaN : val;
    }
  }

  return result;
}
```

---

### Step 2: Update Suitability Modeling (`src/lib/SpatioProcessing/suitability.ts`)
1. Remove dimension equality assertion `raster.width !== base.width || raster.height !== base.height`.
2. Check that `raster.crsCode === base.crsCode`; throw informative error if not: `CRS mismatch between raster #${layerIndex + 1} and bounding raster.`.
3. For each input raster, align it to `base` grid using `alignRasterToGrid`:
   - If `bandMode === 'first'`: align band 0.
   - If `bandMode === 'all'`: loop through all bands up to `base.bandCount`, align each, stack or process.
   - If `bandMode === 'average'`: align each band, average them pixel-wise (ignoring `NaN`), outputting aligned `Float32Array`.
4. Apply normalization `normalizeValues` on the aligned raster layers.
5. Combine layers with weights and produce output GeoTIFF using `base.width`, `base.height`, `base.geotransform`, and `base.crsCode`.

---

### Step 3: Update Raster Forecasting (`src/lib/SpatioProcessing/forecasting.ts`)
1. In `runRasterTemporalForecasting`:
2. Remove dimension equality check `raster.width !== base.width || raster.height !== base.height`.
3. Verify CRS matching: `if (raster.crsCode !== base.crsCode) throw new Error(...)`.
4. Use `alignRasterToGrid` for each raster using its selected `raster.bandIndex` and `raster.noData`.
5. For each pixel in `base.width * base.height`:
   - Form time series from the aligned raster values.
   - Any `NaN` is converted to `0` (or handled gracefully by ARIMA/Linear extrapolation).
   - Run forecast model per pixel and write output GeoTIFF with `base.geotransform` and `base.crsCode`.

---

### Step 4: Update UI Layouts in `src/lib/geolibre/right-panel.ts`

#### 1. Suitability Modeling -> Generate MCE Raster Inputs:
- Refactor `renderRows` in MCE section to match `Docs/Samples/MceRightPanel/right-panel.ts`:
  - Outer container: `rows` with `applyRightPanelStyle(rows, "mceRows")`.
  - For each raster index:
    - Container: `const row = styleElement(document.createElement("div"), "mceRow");`
    - Label: `const label = styleElement(document.createElement("span"), "text"); label.textContent = \`Raster \${index + 1}\`;`
    - File input: `const file = styleElement(document.createElement("input"), "input"); file.type = "file"; file.accept = ".tif,.tiff,image/tiff";`
    - NoData input: `const noDataInput = styleElement(document.createElement("input"), "mceWeightInput"); noDataInput.type = "number"; noDataInput.step = "any"; noDataInput.placeholder = "NoData"; noDataInput.setAttribute("aria-label", \`NoData value for raster \${index + 1}\`);`
    - Number weight input: `const number = styleElement(document.createElement("input"), "mceWeightInput"); number.type = "number"; number.min = "0"; number.max = "1"; number.step = "0.01";`
    - Range slider: `const slider = styleElement(document.createElement("input"), "range"); slider.type = "range"; slider.min = "0"; slider.max = "1"; slider.step = "0.01";`
    - Sync number and slider bidirectional `input` events.
    - Append: `row.append(label, file, noDataInput, number, slider);`
    - Append `row` to `rows`.

#### 2. Predicting Climate Change -> Raster Forecasting Cards:
- Refactor `renderRasterCards` in Raster Forecasting section:
  - Outer container: `rasterCards` with `applyRightPanelStyle(rasterCards, "mceRows")`.
  - For each raster index:
    - Card container: `const card = styleElement(document.createElement("div"), "mceRow");`
    - Header: `const cardTitle = styleElement(document.createElement("span"), "text"); cardTitle.textContent = \`Raster #\${index + 1}\`;`
    - First line (File + Band):
      - `const fileRow = styleElement(document.createElement("div"), "formRow");`
      - File field: `fieldLabel("Choose File", fileInput)`
      - Band select: `fieldLabel("Select Band", bandSelect)`
      - `fileRow.append(fieldLabel("Choose File", fileInput), fieldLabel("Select Band", bandSelect));`
    - Second line (Timestamp + NoData):
      - `const timeRow = styleElement(document.createElement("div"), "formRow");`
      - Timestamp input: `fieldLabel("Timestamp", dateInput)`
      - NoData input: `fieldLabel("NoData", noDataInput)`
      - `timeRow.append(fieldLabel("Timestamp", dateInput), fieldLabel("NoData", noDataInput));`
    - Card append: `card.append(cardTitle, fileRow, timeRow);`
    - Append `card` to `rasterCards`.

---

### Step 5: Unit Testing & Verification

1. **New / Updated Unit Tests** in `tests/right-panel.test.ts` and `tests/suitability.test.ts` / `tests/forecasting.test.ts`:
   - **Dimension Mismatch Resampling**:
     - Test `buildMceRaster` with 2 rasters having different dimensions (e.g. 10x10 and 20x20) and geotransforms; assert calculation succeeds and output dimension matches selected bounding box raster.
     - Test `runRasterTemporalForecasting` with differing raster dimensions; assert output dimension and geotransform match the chosen bounding box raster.
     - Test CRS mismatch throws error.
   - **MCE UI Layout**:
     - Test that MCE raster inputs render with `spazio-mce-row` (or `mceRow` style) containing label, file, NoData input, number input, and range slider.
   - **Raster Forecasting UI Layout**:
     - Test that each forecasting raster item is rendered inside its own card container with title `Raster #<number>`.
     - Test that Choose File and Select Band share the same line container (`formRow`).
     - Test that Timestamp and NoData are in the line below.

2. **Execute Vitest**:
   ```bash
   npx vitest run
   ```

---

## 4. Summary of Files to Modify

| File | Change Description |
|---|---|
| `src/lib/utils/geotiff-processor.ts` | Add `alignRasterToGrid` helper for clipping/resampling rasters to target reference grid with NaN padding |
| `src/lib/SpatioProcessing/suitability.ts` | Support mismatched raster dimensions by aligning all input rasters to bounding raster extent |
| `src/lib/SpatioProcessing/forecasting.ts` | Support mismatched raster dimensions in raster forecasting by aligning rasters to bounding raster extent |
| `src/lib/geolibre/right-panel.ts` | Update MCE input fields and Raster Forecasting cards UI to match specifications and reference styling |
| `tests/right-panel.test.ts` | Add UI and processing tests for dimension alignment and updated card layout |
