# Resolve Fix 01: AHP Table Auto-Update and Weights Synchronization

This document outlines the implementation plan to fix the AHP table auto-update behavior and ensure that the sliders and text values are updated correctly in the suitability modeling right panel.

## Problem Description
1. The AHP weights table in suitability modeling MCE raster generation does not automatically calculate and update reciprocal values as in the reference plugin. Diagonal and lower-triangle cells are currently editable, allowing inconsistent inputs.
2. Clicking "Generate weights" programmatically updates the weight input sliders but does not trigger their `"input"` events, leaving the adjacent text value indicators out of sync.

## Proposed Changes

### Spatio-Modeling Plugin UI Component

#### File: [`/src/lib/geolibre/right-panel.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/src/lib/geolibre/right-panel.ts)

1. **AHP Matrix Auto-Update**:
   - Disable inputs on the diagonal (`rowIndex === columnIndex`) and the lower triangle (`rowIndex > columnIndex`).
   - Keep only the upper triangle inputs (`columnIndex > rowIndex`) editable.
   - Attach an `"input"` event listener to each editable upper triangle input to automatically update its corresponding reciprocal cell in the lower triangle with the formatted value `(1 / value).toFixed(2)`.

2. **Slider & Text Indicator Synchronization**:
   - Update the `generateWeights` event listener to dispatch a new `Event("input")` on each slider (`weightInputs[index]`) after updating its value, ensuring both the sliders and text indicators are kept in sync.

### Code Modification Details

#### 1. Update `renderMatrix` AHP Table Inputs and Event Listeners
Locate:
```typescript
      for (let rowIndex = 0; rowIndex < count; rowIndex += 1) {
        const row = styleElement(document.createElement("div"), "right-panel-row");
        row.classList.add("suitability-ahp-row");
        row.style.gridTemplateColumns = `58px repeat(${count}, minmax(48px, 1fr))`;
        const label = styleElement(document.createElement("span"), "right-panel-cell");
        label.textContent = `Raster ${rowIndex + 1}`;
        row.appendChild(label);
        for (let columnIndex = 0; columnIndex < count; columnIndex += 1) {
          const input = styleElement(numberInput(rowIndex === columnIndex ? 1 : 1, "0.01"), "right-panel-ahp-input");
          input.classList.add("suitability-ahp-input");
          input.min = "0.01";
          input.disabled = rowIndex === columnIndex;
          matrixInputs.push(input);
          row.appendChild(input);
        }
        ahpTable.appendChild(row);
      }
```

Replace with:
```typescript
      for (let rowIndex = 0; rowIndex < count; rowIndex += 1) {
        const row = styleElement(document.createElement("div"), "right-panel-row");
        row.classList.add("suitability-ahp-row");
        row.style.gridTemplateColumns = `58px repeat(${count}, minmax(48px, 1fr))`;
        const label = styleElement(document.createElement("span"), "right-panel-cell");
        label.textContent = `Raster ${rowIndex + 1}`;
        row.appendChild(label);
        for (let columnIndex = 0; columnIndex < count; columnIndex += 1) {
          const isDiagonal = rowIndex === columnIndex;
          const isLowerTriangle = rowIndex > columnIndex;
          const input = styleElement(numberInput(isDiagonal ? 1 : 1.00, "0.01"), "right-panel-ahp-input");
          input.classList.add("suitability-ahp-input");
          input.min = "0.01";
          input.disabled = isDiagonal || isLowerTriangle;
          matrixInputs.push(input);
          row.appendChild(input);
        }
        ahpTable.appendChild(row);
      }

      // Add input event listeners to the upper triangle cells to auto-update their lower-triangle reciprocals
      for (let rowIndex = 0; rowIndex < count; rowIndex += 1) {
        for (let columnIndex = 0; columnIndex < count; columnIndex += 1) {
          if (columnIndex > rowIndex) {
            const input = matrixInputs[rowIndex * count + columnIndex];
            const reciprocalInput = matrixInputs[columnIndex * count + rowIndex];
            input.addEventListener("input", () => {
              const parsedVal = parseFloat(input.value);
              const safeValue = isNaN(parsedVal) || parsedVal <= 0 ? 1 : parsedVal;
              reciprocalInput.value = (1 / safeValue).toFixed(2);
            });
          }
        }
      }
```

#### 2. Update `generateWeights` Click Listener to Dispatch Input Events
Locate:
```typescript
    generateWeights.addEventListener("click", () => {
      const count = Math.max(1, Math.min(MAX_RASTER_UPLOADS, Number(rasterCount.value) || 1));
      const priorities = Array.from({ length: count }, (_, rowIndex) => {
        let product = 1;
        for (let columnIndex = 0; columnIndex < count; columnIndex += 1) product *= Number(matrixInputs[rowIndex * count + columnIndex].value) || 1;
        return product ** (1 / count);
      });
      const total = priorities.reduce((sum, value) => sum + value, 0) || 1;
      priorities.forEach((value, index) => { if (weightInputs[index]) weightInputs[index].value = String(value / total); });
    });
```

Replace with:
```typescript
    generateWeights.addEventListener("click", () => {
      const count = Math.max(1, Math.min(MAX_RASTER_UPLOADS, Number(rasterCount.value) || 1));
      const priorities = Array.from({ length: count }, (_, rowIndex) => {
        let product = 1;
        for (let columnIndex = 0; columnIndex < count; columnIndex += 1) product *= Number(matrixInputs[rowIndex * count + columnIndex].value) || 1;
        return product ** (1 / count);
      });
      const total = priorities.reduce((sum, value) => sum + value, 0) || 1;
      priorities.forEach((value, index) => {
        if (weightInputs[index]) {
          weightInputs[index].value = String(value / total);
          weightInputs[index].dispatchEvent(new Event("input"));
        }
      });
    });
```

## Verification Plan

### Manual Verification
1. Open the plugin's suitability modeling right panel.
2. Set the raster count to 3.
3. Verify that the AHP weights table has diagonal and lower-triangle fields disabled.
4. Input a value (e.g. `2.00`) into the field at Row 1, Column 2.
5. Verify that the reciprocal field at Row 2, Column 1 automatically updates to `0.50`.
6. Click the "Generate weights" button.
7. Verify that both the sliders (range inputs) and the numerical text indicators adjacent to them update to reflect the newly calculated weights.
