import type { GeoLibreAppAPI, GeoLibreControl } from "./host-api";
import {
  buildMceRaster,
  buildSuitabilityRaster,
  buildSuitabilityVectorFromRasterBlob,
  type ComparisonMethod,
  type MceRasterInput,
} from "../SpatioProcessing/suitability";

/**
 * Demonstration of the GeoLibre right-sidebar panel host API.
 *
 * A plugin can register a native right-sidebar panel that docks beside
 * GeoLibre's built-in Style panel and behaves like a first-class part of the
 * workspace, instead of emulating one with a fixed overlay. The host renders
 * the panel chrome (header, collapse/close buttons, a collapsible rail, and a
 * resize handle); the plugin owns only the body via `render(container)`, using
 * plain DOM so it never has to share the host's UI framework.
 *
 * This module is intentionally self-contained so it is easy to copy, adapt, or
 * delete. Wire it from the plugin's `activate`/`deactivate` hooks (see
 * `src/geolibre.ts`).
 */

/** Stable id for this plugin's right panel. Replace with your own. */
export const RIGHT_PANEL_ID = "geolibre-plugin-template-workbench";
export const BASE_METHODS=[
  "",
  "Suitability Modeling",
  "Predicting Climate Change",
]
export const BASE_METHODS_TC = [
  "Select Processing Function",
  "Suitability Modeling",
  "Predicting Climate Change",
]
let _app : GeoLibreAppAPI;
const developer = true;


function drawDropdownOptions(dropdown : HTMLElement, methods : string[], textContents? : string[]){
  methods.forEach((method, index) => {
    const methodOption = document.createElement("option");
    methodOption.className = "geoprocessing-method-option";
    methodOption.value = method;
    if(!textContents || index >= textContents.length){
      methodOption.textContent = method;
    }else{
      methodOption.textContent = textContents[index];
    }
    
    dropdown.appendChild(methodOption);
  });
}


function fieldLabel(text: string, control: HTMLElement): HTMLLabelElement {
  const label = document.createElement("label");
  label.textContent = text;
  label.appendChild(control);
  return label;
}

function numberInput(value: number, step = "any"): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  input.value = String(value);
  input.step = step;
  return input;
}

function rangeInput(value: number, min: number, max: number, step: number): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  return input;
}

function downloadBlob(blob: Blob, filename: string): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function loadMethodForm(wrapper: HTMLElement, method : string){
  removeAllChildElements(wrapper);
  if(method === "Suitability Modeling"){
    const form = document.createElement("form");
    form.className = "suitability-form";
    const source = document.createElement("select");
    drawDropdownOptions(source, ["Upload Raster File", "Generate MCE Raster"]);
    form.appendChild(fieldLabel("Source", source));

    const uploadSection = document.createElement("div");
    const rasterInput = document.createElement("input");
    rasterInput.type = "file";
    rasterInput.accept = ".tif,.tiff,image/tiff";
    uploadSection.appendChild(fieldLabel("Raster", rasterInput));

    const mceSection = document.createElement("div");
    mceSection.hidden = true;
    const rasterCount = rangeInput(2, 1, 12, 1);
    rasterCount.className = "suitability-range suitability-raster-count";
    const rasterCountValue = document.createElement("output");
    rasterCountValue.textContent = rasterCount.value;
    rasterCount.addEventListener("input", () => { rasterCountValue.textContent = rasterCount.value; });
    const rows = document.createElement("div");
    const weightInputs: HTMLInputElement[] = [];
    const fileInputs: HTMLInputElement[] = [];
    const renderRows = () => {
      rows.replaceChildren();
      weightInputs.length = 0;
      fileInputs.length = 0;
      for (let index = 0; index < Math.max(1, Math.min(12, Number(rasterCount.value) || 1)); index += 1) {
        const row = document.createElement("div");
        const file = document.createElement("input");
        file.type = "file";
        file.accept = ".tif,.tiff,image/tiff";
        const weight = rangeInput(1 / Math.max(1, Number(rasterCount.value) || 1), 0, 1, 0.01);
        weight.className = "suitability-range suitability-weight";
        const weightValue = document.createElement("output");
        weightValue.textContent = Number(weight.value).toFixed(2);
        weight.addEventListener("input", () => { weightValue.textContent = Number(weight.value).toFixed(2); });
        fileInputs.push(file);
        weightInputs.push(weight);
        row.className = "suitability-raster-row";
        row.append(fieldLabel(`Raster ${index + 1}`, file), fieldLabel("Weight", weight), weightValue);
        rows.appendChild(row);
      }
    };
    rasterCount.addEventListener("input", renderRows);
    mceSection.append(fieldLabel("Raster count", rasterCount), rasterCountValue, rows);

    const ahp = document.createElement("fieldset");
    const ahpLegend = document.createElement("legend");
    ahpLegend.textContent = "AHP weights";
    const ahpTable = document.createElement("div");
    ahpTable.className = "suitability-ahp-table";
    const generateWeights = document.createElement("button");
    generateWeights.type = "button";
    generateWeights.textContent = "Generate weights";
    const matrixInputs: HTMLInputElement[] = [];
    const renderMatrix = () => {
      ahpTable.replaceChildren();
      matrixInputs.length = 0;
      const count = Math.max(1, Math.min(12, Number(rasterCount.value) || 1));
      const header = document.createElement("div");
      header.className = "suitability-ahp-row suitability-ahp-header";
      header.style.gridTemplateColumns = `58px repeat(${count}, minmax(48px, 1fr))`;
      const corner = document.createElement("span");
      corner.className = "suitability-ahp-corner";
      header.appendChild(corner);
      for (let columnIndex = 0; columnIndex < count; columnIndex += 1) {
        const label = document.createElement("span");
        label.textContent = `Raster ${columnIndex + 1}`;
        header.appendChild(label);
      }
      ahpTable.appendChild(header);
      for (let rowIndex = 0; rowIndex < count; rowIndex += 1) {
        const row = document.createElement("div");
        row.className = "suitability-ahp-row";
        row.style.gridTemplateColumns = `58px repeat(${count}, minmax(48px, 1fr))`;
        const label = document.createElement("span");
        label.textContent = `Raster ${rowIndex + 1}`;
        row.appendChild(label);
        for (let columnIndex = 0; columnIndex < count; columnIndex += 1) {
          const input = numberInput(rowIndex === columnIndex ? 1 : 1, "0.01");
          input.className = "suitability-ahp-input";
          input.min = "0.01";
          input.disabled = rowIndex === columnIndex;
          matrixInputs.push(input);
          row.appendChild(input);
        }
        ahpTable.appendChild(row);
      }
    };
    generateWeights.addEventListener("click", () => {
      const count = Math.max(1, Math.min(12, Number(rasterCount.value) || 1));
      const priorities = Array.from({ length: count }, (_, rowIndex) => {
        let product = 1;
        for (let columnIndex = 0; columnIndex < count; columnIndex += 1) product *= Number(matrixInputs[rowIndex * count + columnIndex].value) || 1;
        return product ** (1 / count);
      });
      const total = priorities.reduce((sum, value) => sum + value, 0) || 1;
      priorities.forEach((value, index) => { if (weightInputs[index]) weightInputs[index].value = String(value / total); });
    });
    rasterCount.addEventListener("input", renderMatrix);
    ahp.append(ahpLegend, ahpTable, generateWeights);
    mceSection.appendChild(ahp);
    renderRows();
    renderMatrix();

    const suitability = document.createElement("fieldset");
    const suitabilityLegend = document.createElement("legend");
    suitabilityLegend.textContent = "Suitability criteria";
    const comparison = document.createElement("select");
    drawDropdownOptions(comparison, ["<", "<=", "=", ">", ">=", "!=", "within"]);
    const comparisonValue = numberInput(0);
    const lowerInterval = numberInput(0);
    const upperInterval = numberInput(0);
    const intervalFields = document.createElement("div");
    intervalFields.hidden = true;
    intervalFields.append(fieldLabel("Lower interval", lowerInterval), fieldLabel("Upper interval", upperInterval));
    comparison.addEventListener("change", () => { intervalFields.hidden = comparison.value !== "within"; });
    const normalize = document.createElement("input");
    normalize.type = "checkbox";
    normalize.checked = true;
    const connectivity = document.createElement("select");
    drawDropdownOptions(connectivity, ["4", "8"], ["4-way", "8-way"]);
    const filterArea = document.createElement("input");
    filterArea.type = "checkbox";
    const minArea = numberInput(0);
    const maxArea = numberInput(0);
    const areaFields = document.createElement("div");
    areaFields.hidden = true;
    areaFields.append(fieldLabel("Minimum area", minArea), fieldLabel("Maximum area", maxArea));
    filterArea.addEventListener("change", () => { areaFields.hidden = !filterArea.checked; });
    suitability.append(suitabilityLegend, fieldLabel("Method", comparison), fieldLabel("Comparison value", comparisonValue), intervalFields, fieldLabel("Normalize result", normalize), fieldLabel("Connectivity", connectivity), fieldLabel("Filter by area", filterArea), areaFields);

    const calculate = document.createElement("button");
    calculate.type = "submit";
    calculate.textContent = "Calculate Suitability";
    const status = document.createElement("output");
    const downloads = document.createElement("div");
    form.append(uploadSection, mceSection, suitability, calculate, status, downloads);
    wrapper.appendChild(form);
    source.addEventListener("change", () => { uploadSection.hidden = source.value !== "Upload Raster File"; mceSection.hidden = source.value !== "Generate MCE Raster"; });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        let input: Blob | null = rasterInput.files?.[0] ?? null;
        if (source.value === "Generate MCE Raster") {
          const inputs: MceRasterInput[] = fileInputs.flatMap((file, index) => file.files?.[0] ? [{ file: file.files[0], weight: Number(weightInputs[index].value) }] : []);
          if (!inputs.length) throw new Error("Select at least one raster for MCE.");
          input = await buildMceRaster(inputs);
        }
        if (!input) throw new Error("Select a raster file.");
        const output = await buildSuitabilityRaster(input, { comparisonMethod: comparison.value as ComparisonMethod, comparisonValue: Number(comparisonValue.value), lowerInterval: Number(lowerInterval.value), upperInterval: Number(upperInterval.value), normalizeResult: normalize.checked });
        if (!output) throw new Error("Suitability calculation returned no raster.");
        const url = URL.createObjectURL(output);
        await _app.addCogLayer?.("Suitability raster", url, { bands: "1", nodata: NaN, colormap: "viridis" });
        const vectors = await buildSuitabilityVectorFromRasterBlob(output, { connectivity: Number(connectivity.value) as 4 | 8, filterByArea: filterArea.checked, minArea: Number(minArea.value), maxArea: Number(maxArea.value) });
        _app.addGeoJsonLayer("Suitability regions", vectors);
        if (_app.registerExternalNativeLayer) _app.registerExternalNativeLayer({ id: "suitability-regions", name: "Suitability regions", geojson: vectors, nativeLayerIds: ["suitability-regions-fill"], sourceIds: ["suitability-regions-source"], opacity: 0.75, style: { fillColor: "#2f855a", strokeColor: "#14532d", strokeWidth: 1, fillOpacity: 0.45 } });
        downloads.replaceChildren();
        if (developer) {
          const rasterDownload = document.createElement("button");
          rasterDownload.type = "button";
          rasterDownload.textContent = "Download raster";
          rasterDownload.addEventListener("click", () => downloadBlob(output, "suitability.tif"));
          const vectorDownload = document.createElement("button");
          vectorDownload.type = "button";
          vectorDownload.textContent = "Download vectors";
          vectorDownload.addEventListener("click", () => downloadBlob(new Blob([JSON.stringify(vectors)], { type: "application/geo+json" }), "suitability.geojson"));
          downloads.append(rasterDownload, vectorDownload);
        }
        status.textContent = `Created ${vectors.features.length} suitable region(s).`;
      } catch (error) { status.textContent = (error as Error).message; }
    });
  }else if(method === "Predicting Climate Change"){
    
  }
}


function removeAllChildElements(parent:  HTMLElement){
  if(!parent) return;

  while(parent.firstChild){
    parent.removeChild(parent.firstChild);
  }
}

/**
 * Register and open the template's right-sidebar panel.
 *
 * @param app - The GeoLibre host API passed to the plugin's `activate` hook.
 * @returns A disposer that closes and unregisters the panel, or `null` when the
 *   host does not provide a right sidebar (so the caller can skip cleanup).
 */
export function registerTemplateRightPanel<TControl extends GeoLibreControl>(
  app: GeoLibreAppAPI<TControl>,
): (() => void) | null {
  // Right panels are an optional host capability; degrade gracefully when the
  // host (or standalone usage) does not provide them.
  _app = app as GeoLibreAppAPI;
  if (!app.registerRightPanel) return null;

  const unregister = app.registerRightPanel({
    id: RIGHT_PANEL_ID,
    title: "Workbench",
    defaultWidth: 320,
    render(container) {
      //Wrapper
      const wrap = document.createElement("div");
      wrap.className = "geolibre-plugin-right-panel";

      //Description
      const heading = document.createElement("h2");
      heading.textContent = "Plugin Workbench";

      //Method Select
      const method = document.createElement("select");
      method.className = "geoprocessing-method-select";
      drawDropdownOptions(method, BASE_METHODS, BASE_METHODS_TC);

      //Method Form Container
      const methodFormContainer = document.createElement("div");
      methodFormContainer.className = "geoprocessing-method-form-container";

      const body = document.createElement("p");
      body.textContent =
        "This panel is rendered by the plugin through app.registerRightPanel(). " +
        "Replace this content with your own workbench, query review, or " +
        "dashboard UI. Drive it with app.openRightPanel(), collapseRightPanel(), " +
        "and closeRightPanel().";

      wrap.append(heading, body, method, methodFormContainer);
      container.appendChild(wrap);

      //Event: Method selected
      method.addEventListener("change", () => {
        loadMethodForm(methodFormContainer, method.value);
      })

      // Optional cleanup, run when the panel closes or is unregistered.
      return () => {
        wrap.remove();
      };
    },
  });

  // Open it right away so the example is visible on activation. Remove this call
  // (or gate it behind a button in your control) if you would rather open the
  // panel on demand instead of every time the plugin activates.
  app.openRightPanel?.(RIGHT_PANEL_ID);

  return () => {
    app.closeRightPanel?.(RIGHT_PANEL_ID);
    unregister();
  };
}
