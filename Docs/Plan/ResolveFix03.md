# Resolve Fix 03: Spazio Right Panel Style Registry Migration

This document details the step-by-step implementation plan to resolve the requirements in [`Docs/Fix/Fix03.md`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/Docs/Fix/Fix03.md).

> **Target Audience**: Junior Developer or Autonomous AI Coding Agent. Follow each step sequentially, apply exact code changes, and verify with the provided test commands.

---

## 1. Problem Description & Objectives

The plugin UI currently uses an older style registry in `src/lib/styles/right-panel-styles.ts` with legacy class names (e.g. `geolibre-plugin-right-panel`, `right-panel-control`, `right-panel-button`, etc.) and raw class name string declarations in `src/lib/geolibre/right-panel.ts`.

We need to:
1. Migrate the styling system to use the master style registry in [`src/lib/styles/spazio-right-panel-styles.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/src/lib/styles/spazio-right-panel-styles.ts).
2. Standardize all element classes with the `spazio-*` prefix according to the specification.
3. Remove all raw class name strings in `src/lib/geolibre/right-panel.ts`—all styling and class additions must be handled strictly through `applyRightPanelStyle` or `applyRightPanelStyles` from the registry.
4. Preserve all existing styles and aliases in `spazio-right-panel-styles.ts` (as it serves as a master workspace registry) while adding any missing keys.
5. Eliminate all dependencies on `src/lib/styles/right-panel-styles.ts` and update unit tests accordingly.

---

## 2. Style Mapping Specification

The following mapping table defines how UI components in `right-panel.ts` map to `RightPanelStyleName` keys and resulting `spazio-*` class names:

| UI Component | Registry Key (`RightPanelStyleName`) | CSS Class Name(s) | Description |
| :--- | :--- | :--- | :--- |
| **Main Panel Container** | `panel` | `geolibre-plugin-right-panel`, `spazio-container` | Main sidebar container wrapper |
| **Plugin Title / Heading** | `heading` | `spazio-title` | Title `<h2>` element |
| **Plugin Description** | `description` | `spazio-description` | Description `<p>` element |
| **Form Container** | `formContainer` | `spazio-form-container` | Form and option containers |
| **Form Row / Raster Row** | `formRow` / `rasterRow` | `spazio-form-row` / `spazio-raster-row` | Grid or flex rows |
| **Input Label** | `label` | `spazio-input-label` | `<label>` wrapping input controls |
| **Input Description** | `inputDescription` | `spazio-input-description` | Helper text below inputs |
| **Dropdown Select** | `methodSelect` | `spazio-dropdown` | `<select>` elements |
| **Dropdown Option** | `selectOption` | `spazio-dropdown-options` | `<option>` elements (white bg, black text) |
| **Text / Number Input** | `input` | `spazio-text-field` | Text and numeric input elements |
| **File Input** | `fileField` | `spazio-file-field` | `<input type="file">` elements |
| **Range Slider** | `range` | `spazio-slider` | `<input type="range">` elements |
| **Checkbox** | `checkbox` | `spazio-checkbox` | `<input type="checkbox">` elements |
| **Radio Button** | `radio` | `spazio-radio` | `<input type="radio">` elements |
| **Calculator Expression** | `expression` | `spazio-expression-field` | Formula / expression textarea |
| **Calculator Button** | `calculatorButton` | `spazio-calculator-button` | Special calculator key buttons |
| **Submit / Process Button** | `operationButton` | `spazio-submit-button` | Primary action buttons (Interpolate, Calculate, Run) |
| **General / Secondary Button** | `button` | `spazio-button` | Secondary buttons (Load Vector, Generate weights) |
| **Download Button** | `downloadButton` | `spazio-submit-button` (or `spazio-button`) | Export & download action buttons |
| **Status / Output** | `status` | `spazio-status` | Status output messages |
| **Status Error** | `statusError` | `spazio-status-error` | Error status output messages |
| **AHP Table** | `table` | `spazio-ahp-table` | AHP matrix comparison table/container |
| **AHP Table Headers** | `tableHeader` | `spazio-ahp-headers` | AHP row and column header labels |
| **AHP Table Cell** | `tableCell` | `spazio-ahp-cell` | AHP matrix cell wrapper |
| **AHP Input Field** | `ahpInput` / `ahpField` | `spazio-ahp-field`, `spazio-ahp-input` | AHP numerical weight comparison inputs |
| **Fieldset & Legend** | `fieldset`, `legend` | `spazio-fieldset`, `spazio-legend` | Grouped criteria sections |
| **General Section** | `section` | `spazio-section` | Sub-sections within forms |
| **Downloads Group** | `downloads` | `spazio-downloads` | Flex container for download buttons |

---

## 3. Step-by-Step Implementation Instructions

### Step 1: Augment `src/lib/styles/spazio-right-panel-styles.ts`

Ensure that `spazio-right-panel-styles.ts` includes the necessary styles and class aliases for all requirements without deleting or modifying any existing entries.

#### File: [`src/lib/styles/spazio-right-panel-styles.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/src/lib/styles/spazio-right-panel-styles.ts)

Add the missing style definitions and aliases:
1. `fileField`: File input styling with `spazio-file-field` class alias.
2. `calculatorButton`: Calculator button styling with `spazio-calculator-button` alias.
3. `statusError`: Error status styling (red color `#b91c1c`) with `spazio-status-error` alias.
4. `downloads`: Download container flex wrap styling with `spazio-downloads` alias.
5. `ahpField`: Alias to `["spazio-ahp-field", "spazio-ahp-input"]`.

```typescript
// Add into RIGHT_PANEL_STYLES:
  fileField: {
    boxSizing: "border-box",
    width: "100%",
    minHeight: "36px",
    padding: "6px 10px",
    border: "1px solid #b8c1cc",
    borderRadius: "4px",
    outline: "none",
    backgroundColor: "#ffffff",
    color: "#111827",
    fontSize: "13px",
    fontFamily: "inherit",
  },
  calculatorButton: {
    boxSizing: "border-box",
    minHeight: "32px",
    padding: "6px 10px",
    border: "1px solid #6b7280",
    borderRadius: "4px",
    backgroundColor: "#f3f4f6",
    color: "#111827",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "500",
  },
  statusError: {
    color: "#b91c1c",
    fontSize: "12px",
    overflowWrap: "break-word",
  },
  downloads: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },

// Add into STYLE_CLASS_ALIASES:
  fileField: "spazio-file-field",
  calculatorButton: "spazio-calculator-button",
  statusError: "spazio-status-error",
  downloads: "spazio-downloads",
  ahpField: ["spazio-ahp-field", "spazio-ahp-input"],
```

---

### Step 2: Refactor `src/lib/geolibre/right-panel.ts`

Replace the import of `right-panel-styles` with `spazio-right-panel-styles` and update element styling to use strongly typed `RightPanelStyleName` values without raw string class assignments.

#### File: [`src/lib/geolibre/right-panel.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/src/lib/geolibre/right-panel.ts)

#### 2.1 Update Imports and `styleElement` Helper
Change line 23:
```typescript
// Replace:
// import { applyRightPanelStyle } from "../styles/right-panel-styles";
// With:
import {
  applyRightPanelStyle,
  type RightPanelStyleName,
} from "../styles/spazio-right-panel-styles";
```

Update `styleElement` and `styleControl` helpers:
```typescript
function styleElement<T extends HTMLElement>(element: T, styleName: RightPanelStyleName): T {
  applyRightPanelStyle(element, styleName);
  return element;
}

function styleControl(control: HTMLElement): void {
  if (control instanceof HTMLInputElement) {
    if (control.type === "range") {
      styleElement(control, "range");
    } else if (control.type === "checkbox") {
      styleElement(control, "checkbox");
    } else if (control.type === "file") {
      styleElement(control, "fileField");
    } else {
      styleElement(control, "input");
    }
  } else if (control instanceof HTMLSelectElement) {
    styleElement(control, "methodSelect");
  } else if (control instanceof HTMLButtonElement) {
    styleElement(control, "button");
  }
}
```

#### 2.2 Update `drawDropdownOptions`
```typescript
function drawDropdownOptions(dropdown: HTMLElement, methods: string[], textContents?: string[]) {
  methods.forEach((method, index) => {
    const methodOption = styleElement(document.createElement("option"), "selectOption");
    methodOption.value = method;
    if (!textContents || index >= textContents.length) {
      methodOption.textContent = method;
    } else {
      methodOption.textContent = textContents[index];
    }
    dropdown.appendChild(methodOption);
  });
}
```

#### 2.3 Update Helper Functions (`fieldLabel`, `numberInput`, `rangeInput`)
```typescript
function fieldLabel(text: string, control: HTMLElement): HTMLLabelElement {
  const label = styleElement(document.createElement("label"), "label");
  styleControl(control);
  label.textContent = text;
  label.appendChild(control);
  return label;
}

function numberInput(value: number, step = "any"): HTMLInputElement {
  const input = styleElement(document.createElement("input"), "input");
  input.type = "number";
  input.value = String(value);
  input.step = step;
  return input;
}

function rangeInput(value: number, min: number, max: number, step: number): HTMLInputElement {
  const input = styleElement(document.createElement("input"), "range");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  return input;
}
```

#### 2.4 Update Spatial Interpolation Form
Eliminate raw `classList.add` and use `styleElement` with registry keys:
```typescript
  if (method === "Spatial Interpolation") {
    const form = styleElement(document.createElement("form"), "formContainer");

    // 1. GeoJSON File input field
    const fileInput = styleElement(document.createElement("input"), "fileField");
    fileInput.type = "file";
    fileInput.accept = ".geojson,application/json";
    form.appendChild(fieldLabel("GeoJSON File", fileInput));

    // 2. Load Vector button
    const loadBtn = styleElement(document.createElement("button"), "button");
    loadBtn.type = "button";
    loadBtn.textContent = "Load Vector";
    loadBtn.disabled = true;
    form.appendChild(loadBtn);

    // 3. Numeric Attribute dropdown selection
    const attrSelect = styleElement(document.createElement("select"), "methodSelect");
    const attrLabelContainer = fieldLabel("Numeric Attribute", attrSelect);
    attrLabelContainer.hidden = true;
    form.appendChild(attrLabelContainer);

    // 4. Method dropdown selection
    const methodSelect = styleElement(document.createElement("select"), "methodSelect");
    drawDropdownOptions(methodSelect, ["kriging"], ["Kriging"]);
    const methodLabelContainer = fieldLabel("Interpolation Method", methodSelect);
    methodLabelContainer.hidden = true;
    form.appendChild(methodLabelContainer);

    const methodOptionsContainer = styleElement(document.createElement("div"), "formContainer");
    form.appendChild(methodOptionsContainer);

    let selectedKrigingModel: KrigingModel = "exponential";
    const renderMethodOptions = () => {
      methodOptionsContainer.replaceChildren();
      if (methodSelect.value === "kriging") {
        const modelSelect = styleElement(document.createElement("select"), "methodSelect");
        drawDropdownOptions(modelSelect, ["exponential", "gaussian", "spherical"], ["Exponential", "Gaussian", "Spherical"]);
        modelSelect.value = selectedKrigingModel;
        modelSelect.addEventListener("change", () => {
          selectedKrigingModel = modelSelect.value as KrigingModel;
        });
        methodOptionsContainer.appendChild(fieldLabel("Kriging Model", modelSelect));
      }
    };
    methodSelect.addEventListener("change", renderMethodOptions);

    // 5. Submit/Run button
    const calculate = styleElement(document.createElement("button"), "operationButton");
    calculate.type = "submit";
    calculate.textContent = "Interpolate";
    calculate.disabled = true;
    calculate.hidden = true;
    form.appendChild(calculate);

    // 6. Status Output
    const status = styleElement(document.createElement("output"), "status");
    form.appendChild(status);

    // 7. Downloads Container
    const downloads = styleElement(document.createElement("div"), "downloads");
    form.appendChild(downloads);

    wrapper.appendChild(form);

    // Helper: Update Status Text
    const setStatus = (msg: string, isError = false) => {
      status.textContent = msg;
      applyRightPanelStyle(status, isError ? "statusError" : "status");
    };
```
Inside interpolation result download handler:
```typescript
    if (DOWNLOAD_FUNCTIONS) {
      const rasterDownload = styleElement(document.createElement("button"), "button");
      rasterDownload.type = "button";
      rasterDownload.textContent = "Download raster";
      rasterDownload.addEventListener("click", () => downloadBlob(outputBlob, `${layerName}.tif`));
      downloads.appendChild(rasterDownload);
    }
```

#### 2.5 Update Suitability Modeling Form
Refactor all elements in the Suitability Modeling branch:
```typescript
  else if (method === "Suitability Modeling") {
    const form = styleElement(document.createElement("form"), "formContainer");
    const source = styleElement(document.createElement("select"), "methodSelect");
    drawDropdownOptions(source, ["Upload Raster File", "Generate MCE Raster"]);
    form.appendChild(fieldLabel("Source", source));

    const uploadSection = styleElement(document.createElement("div"), "section");
    const rasterInput = styleElement(document.createElement("input"), "fileField");
    rasterInput.type = "file";
    rasterInput.accept = ".tif,.tiff,image/tiff";
    uploadSection.appendChild(fieldLabel("Raster", rasterInput));

    const mceSection = styleElement(document.createElement("div"), "section");
    mceSection.hidden = true;
    const rasterCount = rangeInput(2, 1, MAX_RASTER_UPLOADS, 1);
    const rasterCountValue = styleElement(document.createElement("output"), "status");
    rasterCountValue.textContent = rasterCount.value;
    rasterCount.addEventListener("input", () => { rasterCountValue.textContent = rasterCount.value; });
    const rows = styleElement(document.createElement("div"), "section");
    const weightInputs: HTMLInputElement[] = [];
    const fileInputs: HTMLInputElement[] = [];
    const renderRows = () => {
      rows.replaceChildren();
      weightInputs.length = 0;
      fileInputs.length = 0;
      for (let index = 0; index < Math.max(1, Math.min(MAX_RASTER_UPLOADS, Number(rasterCount.value) || 1)); index += 1) {
        const row = styleElement(document.createElement("div"), "formRow");
        const file = styleElement(document.createElement("input"), "fileField");
        file.type = "file";
        file.accept = ".tif,.tiff,image/tiff";
        const weight = rangeInput(1 / Math.max(1, Number(rasterCount.value) || 1), 0, 1, 0.01);
        const weightValue = styleElement(document.createElement("output"), "status");
        weightValue.textContent = Number(weight.value).toFixed(2);
        weight.addEventListener("input", () => { weightValue.textContent = Number(weight.value).toFixed(2); });
        fileInputs.push(file);
        weightInputs.push(weight);
        row.append(fieldLabel(`Raster ${index + 1}`, file), fieldLabel("Weight", weight), weightValue);
        rows.appendChild(row);
      }
    };
    rasterCount.addEventListener("input", renderRows);
    mceSection.append(fieldLabel("Raster count", rasterCount), rasterCountValue, rows);

    const ahp = styleElement(document.createElement("fieldset"), "fieldset");
    const ahpLegend = styleElement(document.createElement("legend"), "legend");
    ahpLegend.textContent = "AHP weights";

    const ahpTable = styleElement(document.createElement("div"), "table");
    const generateWeights = styleElement(document.createElement("button"), "button");
    generateWeights.type = "button";
    generateWeights.textContent = "Generate weights";

    const matrixInputs: HTMLInputElement[] = [];
    const renderMatrix = () => {
      ahpTable.replaceChildren();
      matrixInputs.length = 0;
      const count = Math.max(1, Math.min(MAX_RASTER_UPLOADS, Number(rasterCount.value) || 1));
      const header = styleElement(document.createElement("div"), "formRow");
      header.style.gridTemplateColumns = `58px repeat(${count}, minmax(48px, 1fr))`;
      const corner = styleElement(document.createElement("span"), "tableHeader");
      header.appendChild(corner);
      for (let columnIndex = 0; columnIndex < count; columnIndex += 1) {
        const label = styleElement(document.createElement("span"), "tableHeader");
        label.textContent = `Raster ${columnIndex + 1}`;
        header.appendChild(label);
      }
      ahpTable.appendChild(header);
      for (let rowIndex = 0; rowIndex < count; rowIndex += 1) {
        const row = styleElement(document.createElement("div"), "formRow");
        row.style.gridTemplateColumns = `58px repeat(${count}, minmax(48px, 1fr))`;
        const label = styleElement(document.createElement("span"), "tableHeader");
        label.textContent = `Raster ${rowIndex + 1}`;
        row.appendChild(label);
        for (let columnIndex = 0; columnIndex < count; columnIndex += 1) {
          const isDiagonal = rowIndex === columnIndex;
          const isLowerTriangle = rowIndex > columnIndex;
          const input = styleElement(numberInput(isDiagonal ? 1 : 1.00, "0.01"), "ahpInput");
          input.min = "0.01";
          input.disabled = isDiagonal || isLowerTriangle;
          matrixInputs.push(input);
          row.appendChild(input);
        }
        ahpTable.appendChild(row);
      }
      for (let rowIndex = 0; rowIndex < count; rowIndex += 1) {
        for (let columnIndex = rowIndex + 1; columnIndex < count; columnIndex += 1) {
          const input = matrixInputs[rowIndex * count + columnIndex];
          const reciprocalInput = matrixInputs[columnIndex * count + rowIndex];
          input.addEventListener("input", () => {
            const parsedValue = parseFloat(input.value);
            const safeValue = Number.isNaN(parsedValue) || parsedValue <= 0 ? 1 : parsedValue;
            reciprocalInput.value = (1 / safeValue).toFixed(2);
          });
        }
      }
    };
    rasterCount.addEventListener("input", renderMatrix);
    ahp.append(ahpLegend, ahpTable, generateWeights);
    mceSection.appendChild(ahp);
    renderRows();
    renderMatrix();

    const suitability = styleElement(document.createElement("fieldset"), "fieldset");
    const suitabilityLegend = styleElement(document.createElement("legend"), "legend");
    suitabilityLegend.textContent = "Suitability criteria";

    const comparison = styleElement(document.createElement("select"), "methodSelect");
    drawDropdownOptions(comparison, ["<", "<=", "=", ">", ">=", "!=", "within"]);
    const comparisonValue = numberInput(0);
    const lowerInterval = numberInput(0);
    const upperInterval = numberInput(0);
    const intervalFields = styleElement(document.createElement("div"), "section");
    intervalFields.hidden = true;
    intervalFields.append(fieldLabel("Lower interval", lowerInterval), fieldLabel("Upper interval", upperInterval));
    comparison.addEventListener("change", () => { intervalFields.hidden = comparison.value !== "within"; });
    const normalize = styleElement(document.createElement("input"), "checkbox");
    normalize.type = "checkbox";
    normalize.checked = true;
    const connectivity = styleElement(document.createElement("select"), "methodSelect");
    drawDropdownOptions(connectivity, ["4", "8"], ["4-way", "8-way"]);
    const filterArea = styleElement(document.createElement("input"), "checkbox");
    filterArea.type = "checkbox";
    const minArea = numberInput(0);
    const maxArea = numberInput(0);
    const areaFields = styleElement(document.createElement("div"), "section");
    areaFields.hidden = true;
    areaFields.append(fieldLabel("Minimum area", minArea), fieldLabel("Maximum area", maxArea));
    filterArea.addEventListener("change", () => { areaFields.hidden = !filterArea.checked; });
    suitability.append(suitabilityLegend, fieldLabel("Method", comparison), fieldLabel("Comparison value", comparisonValue), intervalFields, fieldLabel("Normalize result", normalize), fieldLabel("Connectivity", connectivity), fieldLabel("Filter by area", filterArea), areaFields);

    const calculate = styleElement(document.createElement("button"), "operationButton");
    calculate.type = "submit";
    calculate.textContent = "Calculate Suitability";

    const status = styleElement(document.createElement("output"), "status");
    const downloads = styleElement(document.createElement("div"), "downloads");
    form.append(uploadSection, mceSection, suitability, calculate, status, downloads);
    wrapper.appendChild(form);

    // In submit handler:
    // When creating download buttons:
    const rasterDownload = styleElement(document.createElement("button"), "button");
    const vectorDownload = styleElement(document.createElement("button"), "button");
```

#### 2.6 Update Predicting Climate Change Form
```typescript
  else if (method === "Predicting Climate Change") {
    const form = styleElement(document.createElement("form"), "formContainer");

    const typeSelect = styleElement(document.createElement("select"), "methodSelect");
    drawDropdownOptions(typeSelect, ["Vector Forecasting", "Raster Forecasting"]);
    const vectorSection = styleElement(document.createElement("div"), "section");
    const vectorFile = styleElement(document.createElement("input"), "fileField");
    vectorFile.type = "file";
    vectorFile.accept = ".geojson,.json,application/geo+json,application/json";
    const locationSelect = styleElement(document.createElement("select"), "methodSelect");
    const timestampSelect = styleElement(document.createElement("select"), "methodSelect");
    const predictionSelect = styleElement(document.createElement("select"), "methodSelect");
    vectorSection.append(
      fieldLabel("Upload Vector Data (GeoJSON)", vectorFile),
      fieldLabel("Location ID Field", locationSelect),
      fieldLabel("Timestamp Field", timestampSelect),
      fieldLabel("Prediction Attribute", predictionSelect),
    );

    const rasterSection = styleElement(document.createElement("div"), "section");
    rasterSection.hidden = true;
    const rasterWarning = styleElement(document.createElement("p"), "text");
    rasterWarning.textContent = "Raster forecasting runs a model for every pixel and may take considerable time.";
    const rasterCount = numberInput(2, "1");
    rasterCount.min = "2";
    rasterCount.max = "20";
    const rasterCards = styleElement(document.createElement("div"), "section");
    const rasterInputsState: Array<{ file: File | null; band: number; datetime: string }> = [];
    const renderRasterCards = () => {
      rasterCards.replaceChildren();
      const count = Math.min(20, Math.max(2, Number(rasterCount.value) || 2));
      rasterInputsState.length = count;
      for (let index = 0; index < count; index += 1) {
        const state = rasterInputsState[index] ?? {
          file: null,
          band: 0,
          datetime: new Date(Date.now() - (count - index - 1) * 86400000).toISOString().slice(0, 16),
        };
        rasterInputsState[index] = state;
        const card = styleElement(document.createElement("div"), "formRow");
        const fileInput = styleElement(document.createElement("input"), "fileField");
        fileInput.type = "file";
        fileInput.accept = ".tif,.tiff,image/tiff";
        const bandSelect = styleElement(document.createElement("select"), "methodSelect");
        const dateInput = styleElement(document.createElement("input"), "input");
        dateInput.type = "datetime-local";
        dateInput.value = state.datetime;
        const cardTitle = styleElement(document.createElement("strong"), "text");
        cardTitle.textContent = `Raster #${index + 1}`;
        card.append(cardTitle, fieldLabel("Choose File", fileInput), fieldLabel("Select Band", bandSelect), fieldLabel("Timestamp", dateInput));
        // ... file listeners ...
        rasterCards.appendChild(card);
      }
    };
    rasterCount.addEventListener("input", renderRasterCards);
    renderRasterCards();
    rasterSection.append(rasterWarning, fieldLabel("Number of Rasters", rasterCount), rasterCards);

    const stepsInput = numberInput(1, "1");
    stepsInput.min = "1";
    const methodSelect = styleElement(document.createElement("select"), "methodSelect");
    drawDropdownOptions(methodSelect, ["ARIMA", "Linear Extrapolation"]);
    const arimaContainer = styleElement(document.createElement("div"), "section");
    const pInput = numberInput(1, "1");
    const dInput = numberInput(1, "1");
    const qInput = numberInput(0, "1");
    arimaContainer.append(fieldLabel("p", pInput), fieldLabel("d", dInput), fieldLabel("q", qInput));
    methodSelect.addEventListener("change", () => { arimaContainer.hidden = methodSelect.value !== "ARIMA"; });
    const calculate = styleElement(document.createElement("button"), "operationButton");
    calculate.type = "submit";
    calculate.textContent = "Run Forecast";
    const status = styleElement(document.createElement("output"), "status");
    const downloads = styleElement(document.createElement("div"), "downloads");
    form.append(fieldLabel("Forecasting Type", typeSelect), vectorSection, rasterSection, fieldLabel("Steps to Predict", stepsInput), fieldLabel("Prediction Method", methodSelect), arimaContainer, calculate, status, downloads);
    wrapper.appendChild(form);
```

#### 2.7 Update `registerTemplateRightPanel`
```typescript
    render(container) {
      // Wrapper
      const wrap = styleElement(document.createElement("div"), "panel");

      // Heading
      const heading = styleElement(document.createElement("h2"), "heading");
      heading.textContent = "Suitability Modeling & Geostatistics Workbench";

      // Description
      const body = styleElement(document.createElement("p"), "description");

      // Method Select
      const method = styleElement(document.createElement("select"), "methodSelect");
      drawDropdownOptions(method, BASE_METHODS, BASE_METHODS_TC);
      _method = method;

      // Method Form Container
      const methodFormContainer = styleElement(document.createElement("div"), "formContainer");
      _methodForm = methodFormContainer;

      wrap.append(heading, body, method, methodFormContainer);
      container.appendChild(wrap);
```

---

### Step 3: Update Test Suite

Update [`tests/right-panel.test.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/tests/right-panel.test.ts) to test the new Spazio style registry, checking that elements receive the `spazio-*` class names and styles:

```typescript
import { describe, it, expect, vi } from "vitest";
import type {
  GeoLibreAppAPI,
  GeoLibreControl,
  GeoLibreRightPanelRegistration,
} from "../src/lib/geolibre/host-api";
import {
  RIGHT_PANEL_ID,
  registerTemplateRightPanel,
  setMethod,
} from "../src/lib/geolibre/right-panel";
import {
  RIGHT_PANEL_STYLES,
  applyRightPanelStyle,
} from "../src/lib/styles/spazio-right-panel-styles";

function createApp(withRightPanel = true) {
  let registered: GeoLibreRightPanelRegistration | null = null;
  const unregister = vi.fn();
  const app: GeoLibreAppAPI<GeoLibreControl> = {
    addMapControl: () => true,
    removeMapControl: () => undefined,
  };

  if (withRightPanel) {
    app.registerRightPanel = (panel) => {
      registered = panel;
      return unregister;
    };
    app.openRightPanel = vi.fn(() => true);
    app.closeRightPanel = vi.fn();
  }

  return {
    app,
    unregister,
    getRegistered: () => registered,
  };
}

describe("registerTemplateRightPanel (Spazio Styles)", () => {
  it("exposes and applies required Spazio registry styles", () => {
    expect(RIGHT_PANEL_STYLES.input.border).toBe("1px solid #b8c1cc");
    expect(RIGHT_PANEL_STYLES.selectOption.backgroundColor).toBe("#ffffff");
    expect(RIGHT_PANEL_STYLES.selectOption.color).toBe("#000000");
    expect(RIGHT_PANEL_STYLES.operationButton.border).toBe("1px solid #1d4ed8");

    const element = document.createElement("div");
    applyRightPanelStyle(element, "input");
    expect(element.classList).toContain("spazio-text-field");
    expect(element.style.border).toContain("1px solid");
  });

  it("applies spazio-* classes across all processing forms", () => {
    const { app, getRegistered } = createApp();
    registerTemplateRightPanel(app);
    const panel = getRegistered();
    const container = document.createElement("div");
    panel?.render(container);

    expect(container.querySelector(".spazio-container")).not.toBeNull();
    expect(container.querySelector(".spazio-title")).not.toBeNull();
    expect(container.querySelector(".spazio-description")).not.toBeNull();

    // Spatial Interpolation
    setMethod("Spatial Interpolation");
    expect(container.querySelector("select")?.classList).toContain("spazio-dropdown");
    expect(container.querySelector('input[type="file"]')?.classList).toContain("spazio-file-field");
    expect(container.querySelector('button[type="submit"]')?.classList).toContain("spazio-submit-button");

    const options = Array.from(container.querySelectorAll("option"));
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((opt) => opt.classList.contains("spazio-dropdown-options"))).toBe(true);

    // Suitability Modeling
    setMethod("Suitability Modeling");
    expect(container.querySelector('input[type="range"]')?.classList).toContain("spazio-slider");
    expect(container.querySelector('input[type="checkbox"]')?.classList).toContain("spazio-checkbox");
    expect(container.querySelector(".spazio-ahp-table")).not.toBeNull();

    // Predicting Climate Change
    setMethod("Predicting Climate Change");
    expect(container.querySelector("output")?.classList).toContain("spazio-status");
  });

  it("registers, renders, and cleans up the right panel", () => {
    const { app, getRegistered } = createApp();
    const dispose = registerTemplateRightPanel(app);
    expect(dispose).toBeTypeOf("function");

    const panel = getRegistered();
    expect(panel?.id).toBe(RIGHT_PANEL_ID);
    expect(app.openRightPanel).toHaveBeenCalledWith(RIGHT_PANEL_ID);

    const container = document.createElement("div");
    const cleanup = panel?.render(container);
    expect(container.querySelector("h2")?.textContent).toBe("Suitability Modeling & Geostatistics Workbench");

    expect(cleanup).toBeTypeOf("function");
    (cleanup as () => void)();
    expect(container.querySelector("h2")).toBeNull();
  });

  it("closes and unregisters the panel when disposed", () => {
    const { app, unregister } = createApp();
    const dispose = registerTemplateRightPanel(app);
    dispose?.();
    expect(app.closeRightPanel).toHaveBeenCalledWith(RIGHT_PANEL_ID);
    expect(unregister).toHaveBeenCalledOnce();
  });

  it("returns null when the host has no right sidebar", () => {
    const { app } = createApp(false);
    expect(registerTemplateRightPanel(app)).toBeNull();
  });
});
```

---

### Step 4: Remove Legacy Style File

Delete [`src/lib/styles/right-panel-styles.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/src/lib/styles/right-panel-styles.ts) once no other module imports or references it.

---

## 4. Verification & Validation Plan

### Automated Checks
Execute the following commands in the workspace root:

```bash
# 1. Run unit test suite
npx vitest run tests/right-panel.test.ts

# 2. Run all tests
npm test

# 3. Verify TypeScript build
npm run build
```

### Manual Verification Checklist
1. **Dropdowns & Options**:
   - Open right panel in GeoLibre.
   - Verify all dropdown selects have visible `1px solid #b8c1cc` borders.
   - Verify dropdown options have black text on white background (`#000000` / `#ffffff`).
2. **Inputs & File Fields**:
   - Verify text, number, and file input controls have clean borders and padding.
3. **Buttons**:
   - Verify submit buttons (Interpolate, Calculate Suitability, Run Forecast) have primary blue styling (`#2563eb`).
   - Verify secondary action buttons have neutral gray styling (`#4b5563`).
4. **DOM Inspection**:
   - Inspect elements with browser DevTools and verify classes follow the `spazio-*` convention (`spazio-container`, `spazio-title`, `spazio-dropdown`, `spazio-text-field`, `spazio-file-field`, `spazio-slider`, `spazio-checkbox`, `spazio-ahp-table`, `spazio-ahp-headers`, `spazio-ahp-field`, `spazio-status`, `spazio-submit-button`, `spazio-button`).
   - Confirm no legacy classes or raw styling errors appear in the console.
