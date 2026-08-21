import type { GeoLibreAppAPI, GeoLibreControl } from "./host-api";
import {
  buildMceRaster,
  buildSuitabilityRaster,
  buildSuitabilityVectorFromRasterBlob,
  type ComparisonMethod,
  type MceRasterInput,
} from "../SpatioProcessing/suitability";
import {
  runRasterTemporalForecasting,
  runTemporalForecasting,
  type ArimaParams,
  type RasterInputFile,
} from "../SpatioProcessing/forecasting";
import {
  extractPoints,
  getNumericKeys,
  interpolateKriging,
} from "../SpatioProcessing/interpolation";
import { getGeoTIFFBandCount, writeFloat32TiledGeoTIFF } from "../utils/geotiff-processor";
import { applyRightPanelStyle } from "../styles/right-panel-styles";

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
export const RIGHT_PANEL_ID = "spatio-scenario-geostatistics-panel";
export const BASE_METHODS=[
  "",
  "Spatial Interpolation",
  "Suitability Modeling",
  "Predicting Climate Change",
]
export const BASE_METHODS_TC = [
  "Select Processing Function",
  "Spatial Interpolation",
  "Suitability Modeling",
  "Predicting Climate Change",
]
let _app : GeoLibreAppAPI;
const DOWNLOAD_FUNCTIONS = true;
const MAX_RASTER_UPLOADS = 4;
let _method : HTMLSelectElement;
let _methodForm : HTMLElement;
function styleElement<T extends HTMLElement>(element: T, styleName: string): T {
  applyRightPanelStyle(element, styleName);
  return element;
}

function styleControl(control: HTMLElement): void {
  if (control instanceof HTMLInputElement) {
    styleElement(control, control.type === "range" ? "right-panel-range" : control.type === "checkbox" ? "right-panel-checkbox" : control.type === "file" ? "right-panel-file" : "right-panel-control");
  } else if (control instanceof HTMLSelectElement) {
    styleElement(control, "right-panel-control");
  } else if (control instanceof HTMLButtonElement) {
    styleElement(control, "right-panel-button");
  }
}

export function setMethod(process : string){
  if(_method && _methodForm){
    _method.value = process;
    loadOptionForm(_methodForm, process);
  }
}


function drawDropdownOptions(dropdown : HTMLElement, methods : string[], textContents? : string[]){
  methods.forEach((method, index) => {
    const methodOption = styleElement(document.createElement("option"), "right-panel-option");
    applyRightPanelStyle(methodOption, "geoprocessing-method-option");
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
  const label = styleElement(document.createElement("label"), "right-panel-label");
  styleControl(control);
  label.textContent = text;
  label.appendChild(control);
  return label;
}

function numberInput(value: number, step = "any"): HTMLInputElement {
  const input = styleElement(document.createElement("input"), "right-panel-control");
  input.type = "number";
  input.value = String(value);
  input.step = step;
  return input;
}

function rangeInput(value: number, min: number, max: number, step: number): HTMLInputElement {
  const input = styleElement(document.createElement("input"), "right-panel-range");
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

function loadOptionForm(wrapper: HTMLElement, method : string){
  removeAllChildElements(wrapper);
  if(method === "Spatial Interpolation"){
    const form = styleElement(document.createElement("form"), "right-panel-form");
    form.classList.add("interpolation-form");

    // 1. GeoJSON File input field
    const fileInput = styleElement(document.createElement("input"), "right-panel-file");
    fileInput.type = "file";
    fileInput.accept = ".geojson,application/json";
    form.appendChild(fieldLabel("GeoJSON File", fileInput));

    // 2. Load Vector button (loads current GeoJSON onto map as vector layer)
    const loadBtn = styleElement(document.createElement("button"), "right-panel-button");
    loadBtn.type = "button";
    loadBtn.textContent = "Load Vector";
    loadBtn.disabled = true;
    form.appendChild(loadBtn);

    // 3. Numeric Attribute dropdown selection
    const attrSelect = styleElement(document.createElement("select"), "right-panel-control");
    const attrLabelContainer = fieldLabel("Numeric Attribute", attrSelect);
    attrLabelContainer.hidden = true;
    form.appendChild(attrLabelContainer);

    // 4. Method dropdown selection
    const methodSelect = styleElement(document.createElement("select"), "right-panel-control");
    drawDropdownOptions(methodSelect, ["kriging"], ["Kriging"]);
    const methodLabelContainer = fieldLabel("Interpolation Method", methodSelect);
    methodLabelContainer.hidden = true;
    form.appendChild(methodLabelContainer);

    // 5. Submit/Run button
    const calculate = styleElement(document.createElement("button"), "right-panel-button");
    calculate.type = "submit";
    calculate.textContent = "Interpolate";
    calculate.disabled = true;
    calculate.hidden = true;
    form.appendChild(calculate);

    // 6. Status Output
    const status = styleElement(document.createElement("output"), "right-panel-status");
    status.classList.add("interpolation-status");
    form.appendChild(status);

    // 7. Downloads Container
    const downloads = styleElement(document.createElement("div"), "right-panel-downloads");
    downloads.classList.add("interpolation-downloads");
    form.appendChild(downloads);

    wrapper.appendChild(form);

    // Stateful variables
    let geojson: any = null;
    let fileName = "";
    let resultUrl: string | null = null;

    // Helper: Update Status Text
    const setStatus = (msg: string, isError = false) => {
      status.textContent = msg;
      status.classList.remove("right-panel-status", "right-panel-status-error");
      applyRightPanelStyle(status, isError ? "right-panel-status-error" : "right-panel-status");
    };

    // Helper: Cleanup previous URL object
    const cleanupUrl = () => {
      if (resultUrl) {
        URL.revokeObjectURL(resultUrl);
        resultUrl = null;
      }
    };

    // File selection handler
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (!file) return;

      fileName = file.name.replace(/\.geojson$/i, "");
      setStatus("Reading file…");
      cleanupUrl();
      downloads.replaceChildren();

      const reader = new FileReader();
      reader.onload = () => {
        try {
          geojson = JSON.parse(reader.result as string);
        } catch {
          setStatus("Invalid GeoJSON file.", true);
          return;
        }

        const numericKeys = getNumericKeys(geojson);
        attrSelect.innerHTML = "";
        
        // Add default placeholder option
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Select Attribute";
        attrSelect.appendChild(placeholder);

        for (const key of numericKeys) {
          const opt = document.createElement("option");
          opt.value = key;
          opt.textContent = key;
          attrSelect.appendChild(opt);
        }

        attrSelect.disabled = numericKeys.length === 0;
        attrLabelContainer.hidden = false;
        methodLabelContainer.hidden = false;
        loadBtn.disabled = false;
        calculate.hidden = false;
        calculate.disabled = true;

        setStatus(
          numericKeys.length === 0
            ? "No numeric attributes found."
            : `Loaded. ${numericKeys.length} numeric attribute(s) available.`
        );
      };
      reader.onerror = () => setStatus("Failed to read file.", true);
      reader.readAsText(file);
    });

    // Attribute selection listener to enable submit button
    attrSelect.addEventListener("change", () => {
      calculate.disabled = !attrSelect.value;
    });

    // Load Vector button listener
    loadBtn.addEventListener("click", () => {
      if (!geojson) return;
      try {
        _app.addGeoJsonLayer?.(fileName, geojson);
        setStatus(`Vector layer "${fileName}" loaded on map.`);
      } catch (e) {
        setStatus(`Failed to load vector: ${String(e)}`, true);
      }
    });

    // Form Submit listener - runs kriging and outputs tiled geotiff
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!geojson || !attrSelect.value) return;

      const attribute = attrSelect.value;
      const method = methodSelect.value;
      
      setStatus("Extracting points…");
      calculate.disabled = true;
      downloads.replaceChildren();

      try {
        const points = extractPoints(geojson, attribute);
        if (points.length < 3) {
          setStatus("Need at least 3 sample points to interpolate.", true);
          calculate.disabled = false;
          return;
        }

        interpolateKriging(
          points,
          (progress) => {
            setStatus(progress.message, progress.isError);
          },
          async (result) => {
            setStatus("Writing Tiled GeoTIFF…");
            try {
              // Convert bounds and grid to standard geotransform
              const [minLng, minLat, maxLng, maxLat] = result.bounds;
              const scaleX = (maxLng - minLng) / result.width;
              const scaleY = -(maxLat - minLat) / result.height;
              
              // geotransform format: [originX, scaleX, 0, originY, 0, scaleY]
              const geotransform: [number, number, number, number, number, number] = [
                minLng,
                scaleX,
                0,
                maxLat,
                0,
                scaleY,
              ];

              // Call geotiff-processor helper to create tiled GeoTIFF
              const tiffBuffer = writeFloat32TiledGeoTIFF(
                result.width,
                result.height,
                result.gridData,
                geotransform,
                4326, // EPSG:4326 coordinate system
                1     // single-band
              );

              const outputBlob = new Blob([tiffBuffer], { type: "image/tiff" });
              cleanupUrl();
              resultUrl = URL.createObjectURL(outputBlob);

              const layerName = `${fileName}-${method}`;

              // Optional: Render download controls if enabled by configuration
              if (DOWNLOAD_FUNCTIONS) {
                const rasterDownload = styleElement(document.createElement("button"), "right-panel-button");
                rasterDownload.type = "button";
                rasterDownload.textContent = "Download raster";
                rasterDownload.addEventListener("click", () => downloadBlob(outputBlob, `${layerName}.tif`));
                downloads.appendChild(rasterDownload);
              }

              setStatus("Loading raster on map…");
              await _app.addCogLayer?.(layerName, resultUrl);
              setStatus(`Done! Raster "${layerName}" added to map.`);
            } catch (err) {
              setStatus(`TIFF processing error: ${String(err)}`, true);
            } finally {
              calculate.disabled = false;
            }
          },
          (err) => {
            setStatus(`Interpolation error: ${String(err)}`, true);
            calculate.disabled = false;
          }
        );
      } catch (err) {
        setStatus(`Initialization error: ${String(err)}`, true);
        calculate.disabled = false;
      }
    });
  }
  else if(method === "Suitability Modeling"){
    const form = styleElement(document.createElement("form"), "right-panel-form");
    form.classList.add("suitability-form");
    const source = styleElement(document.createElement("select"), "right-panel-control");
    drawDropdownOptions(source, ["Upload Raster File", "Generate MCE Raster"]);
    form.appendChild(fieldLabel("Source", source));

    const uploadSection = styleElement(document.createElement("div"), "right-panel-section");
    const rasterInput = styleElement(document.createElement("input"), "right-panel-file");
    rasterInput.type = "file";
    rasterInput.accept = ".tif,.tiff,image/tiff";
    uploadSection.appendChild(fieldLabel("Raster", rasterInput));

    const mceSection = styleElement(document.createElement("div"), "right-panel-section");
    mceSection.hidden = true;
    const rasterCount = rangeInput(2, 1, MAX_RASTER_UPLOADS, 1);
    rasterCount.classList.add("suitability-range", "suitability-raster-count");
    const rasterCountValue = styleElement(document.createElement("output"), "right-panel-status");
    rasterCountValue.textContent = rasterCount.value;
    rasterCount.addEventListener("input", () => { rasterCountValue.textContent = rasterCount.value; });
    const rows = styleElement(document.createElement("div"), "right-panel-section");
    const weightInputs: HTMLInputElement[] = [];
    const fileInputs: HTMLInputElement[] = [];
    const renderRows = () => {
      rows.replaceChildren();
      weightInputs.length = 0;
      fileInputs.length = 0;
      for (let index = 0; index < Math.max(1, Math.min(MAX_RASTER_UPLOADS, Number(rasterCount.value) || 1)); index += 1) {
        const row = styleElement(document.createElement("div"), "right-panel-row");
        const file = styleElement(document.createElement("input"), "right-panel-file");
        file.type = "file";
        file.accept = ".tif,.tiff,image/tiff";
        const weight = rangeInput(1 / Math.max(1, Number(rasterCount.value) || 1), 0, 1, 0.01);
        weight.classList.add("suitability-range", "suitability-weight");
        const weightValue = styleElement(document.createElement("output"), "right-panel-status");
        weightValue.textContent = Number(weight.value).toFixed(2);
        weight.addEventListener("input", () => { weightValue.textContent = Number(weight.value).toFixed(2); });
        fileInputs.push(file);
        weightInputs.push(weight);
        row.classList.add("suitability-raster-row");
        row.append(fieldLabel(`Raster ${index + 1}`, file), fieldLabel("Weight", weight), weightValue);
        rows.appendChild(row);
      }
    };
    rasterCount.addEventListener("input", renderRows);
    mceSection.append(fieldLabel("Raster count", rasterCount), rasterCountValue, rows);

    const ahp = styleElement(document.createElement("fieldset"), "right-panel-fieldset");
    const ahpLegend = styleElement(document.createElement("legend"), "right-panel-legend");
    ahpLegend.textContent = "AHP weights";
    const ahpTable = styleElement(document.createElement("div"), "right-panel-section");
    ahpTable.classList.add("suitability-ahp-table");
    const generateWeights = styleElement(document.createElement("button"), "right-panel-button");
    generateWeights.type = "button";
    generateWeights.textContent = "Generate weights";
    const matrixInputs: HTMLInputElement[] = [];
    const renderMatrix = () => {
      ahpTable.replaceChildren();
      matrixInputs.length = 0;
      const count = Math.max(1, Math.min(MAX_RASTER_UPLOADS, Number(rasterCount.value) || 1));
      const header = styleElement(document.createElement("div"), "right-panel-row");
      header.classList.add("suitability-ahp-row", "suitability-ahp-header");
      header.style.gridTemplateColumns = `58px repeat(${count}, minmax(48px, 1fr))`;
      const corner = styleElement(document.createElement("span"), "right-panel-cell");
      corner.classList.add("suitability-ahp-corner");
      header.appendChild(corner);
      for (let columnIndex = 0; columnIndex < count; columnIndex += 1) {
        const label = styleElement(document.createElement("span"), "right-panel-cell");
        label.textContent = `Raster ${columnIndex + 1}`;
        header.appendChild(label);
      }
      ahpTable.appendChild(header);
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
    rasterCount.addEventListener("input", renderMatrix);
    ahp.append(ahpLegend, ahpTable, generateWeights);
    mceSection.appendChild(ahp);
    renderRows();
    renderMatrix();

    const suitability = styleElement(document.createElement("fieldset"), "right-panel-fieldset");
    const suitabilityLegend = styleElement(document.createElement("legend"), "right-panel-legend");
    suitabilityLegend.textContent = "Suitability criteria";
    const comparison = styleElement(document.createElement("select"), "right-panel-control");
    drawDropdownOptions(comparison, ["<", "<=", "=", ">", ">=", "!=", "within"]);
    const comparisonValue = numberInput(0);
    const lowerInterval = numberInput(0);
    const upperInterval = numberInput(0);
    const intervalFields = styleElement(document.createElement("div"), "right-panel-section");
    intervalFields.hidden = true;
    intervalFields.append(fieldLabel("Lower interval", lowerInterval), fieldLabel("Upper interval", upperInterval));
    comparison.addEventListener("change", () => { intervalFields.hidden = comparison.value !== "within"; });
    const normalize = styleElement(document.createElement("input"), "right-panel-checkbox");
    normalize.type = "checkbox";
    normalize.checked = true;
    const connectivity = styleElement(document.createElement("select"), "right-panel-control");
    drawDropdownOptions(connectivity, ["4", "8"], ["4-way", "8-way"]);
    const filterArea = styleElement(document.createElement("input"), "right-panel-checkbox");
    filterArea.type = "checkbox";
    const minArea = numberInput(0);
    const maxArea = numberInput(0);
    const areaFields = styleElement(document.createElement("div"), "right-panel-section");
    areaFields.hidden = true;
    areaFields.append(fieldLabel("Minimum area", minArea), fieldLabel("Maximum area", maxArea));
    filterArea.addEventListener("change", () => { areaFields.hidden = !filterArea.checked; });
    suitability.append(suitabilityLegend, fieldLabel("Method", comparison), fieldLabel("Comparison value", comparisonValue), intervalFields, fieldLabel("Normalize result", normalize), fieldLabel("Connectivity", connectivity), fieldLabel("Filter by area", filterArea), areaFields);

    const calculate = styleElement(document.createElement("button"), "right-panel-button");
    calculate.type = "submit";
    calculate.textContent = "Calculate Suitability";
    const status = styleElement(document.createElement("output"), "right-panel-status");
    const downloads = styleElement(document.createElement("div"), "right-panel-downloads");
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
        if (DOWNLOAD_FUNCTIONS) {
          const rasterDownload = styleElement(document.createElement("button"), "right-panel-button");
          rasterDownload.type = "button";
          rasterDownload.textContent = "Download raster";
          rasterDownload.addEventListener("click", () => downloadBlob(output, "suitability.tif"));
          const vectorDownload = styleElement(document.createElement("button"), "right-panel-button");
          vectorDownload.type = "button";
          vectorDownload.textContent = "Download vectors";
          vectorDownload.addEventListener("click", () => downloadBlob(new Blob([JSON.stringify(vectors)], { type: "application/geo+json" }), "suitability.geojson"));
          downloads.append(rasterDownload, vectorDownload);
        }
        status.textContent = `Created ${vectors.features.length} suitable region(s).`;
      } catch (error) { status.textContent = (error as Error).message; }
    });
  }else if(method === "Predicting Climate Change"){
    const form = styleElement(document.createElement("form"), "right-panel-form");
    form.classList.add("suitability-form");

    const typeSelect = styleElement(document.createElement("select"), "right-panel-control");
    drawDropdownOptions(typeSelect, ["Vector Forecasting", "Raster Forecasting"]);
    const vectorSection = styleElement(document.createElement("div"), "right-panel-section");
    const vectorFile = styleElement(document.createElement("input"), "right-panel-file");
    vectorFile.type = "file";
    vectorFile.accept = ".geojson,.json,application/geo+json,application/json";
    const locationSelect = styleElement(document.createElement("select"), "right-panel-control");
    const timestampSelect = styleElement(document.createElement("select"), "right-panel-control");
    const predictionSelect = styleElement(document.createElement("select"), "right-panel-control");
    vectorSection.append(
      fieldLabel("Upload Vector Data (GeoJSON)", vectorFile),
      fieldLabel("Location ID Field", locationSelect),
      fieldLabel("Timestamp Field", timestampSelect),
      fieldLabel("Prediction Attribute", predictionSelect),
    );
    let geoJsonData: any = null;
    vectorFile.addEventListener("change", async () => {
      const file = vectorFile.files?.[0];
      if (!file) return;
      try {
        geoJsonData = JSON.parse(await file.text());
        const attributes = Object.keys(geoJsonData?.features?.[0]?.properties ?? {});
        [locationSelect, timestampSelect, predictionSelect].forEach((select) => {
          select.replaceChildren();
          drawDropdownOptions(select, attributes);
        });
      } catch (error) {
        geoJsonData = null;
        status.textContent = `Error: ${(error as Error).message}`;
      }
    });

    const rasterSection = styleElement(document.createElement("div"), "right-panel-section");
    rasterSection.hidden = true;
    const rasterWarning = styleElement(document.createElement("p"), "right-panel-text");
    rasterWarning.textContent = "Raster forecasting runs a model for every pixel and may take considerable time.";
    const rasterCount = numberInput(2, "1");
    rasterCount.min = "2";
    rasterCount.max = "20";
    const rasterCards = styleElement(document.createElement("div"), "right-panel-section");
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
        const card = styleElement(document.createElement("div"), "right-panel-row");
        const fileInput = styleElement(document.createElement("input"), "right-panel-file");
        fileInput.type = "file";
        fileInput.accept = ".tif,.tiff,image/tiff";
        const bandSelect = styleElement(document.createElement("select"), "right-panel-control");
        const dateInput = styleElement(document.createElement("input"), "right-panel-control");
        dateInput.type = "datetime-local";
        dateInput.value = state.datetime;
        card.append(styleElement(document.createElement("strong"), "right-panel-text"), fieldLabel("Choose File", fileInput), fieldLabel("Select Band", bandSelect), fieldLabel("Timestamp", dateInput));
        (card.firstChild as HTMLElement).textContent = `Raster #${index + 1}`;
        fileInput.addEventListener("change", async () => {
          const file = fileInput.files?.[0];
          if (!file) return;
          state.file = file;
          const bandCount = await getGeoTIFFBandCount(file);
          bandSelect.replaceChildren();
          drawDropdownOptions(bandSelect, Array.from({ length: bandCount }, (_, band) => `Band ${band + 1}`));
          state.band = 0;
        });
        bandSelect.addEventListener("change", () => { state.band = bandSelect.selectedIndex; });
        dateInput.addEventListener("input", () => { state.datetime = dateInput.value; });
        rasterCards.appendChild(card);
      }
    };
    rasterCount.addEventListener("input", renderRasterCards);
    renderRasterCards();
    rasterSection.append(rasterWarning, fieldLabel("Number of Rasters", rasterCount), rasterCards);

    const stepsInput = numberInput(1, "1");
    stepsInput.min = "1";
    const methodSelect = styleElement(document.createElement("select"), "right-panel-control");
    drawDropdownOptions(methodSelect, ["ARIMA", "Linear Extrapolation"]);
    const arimaContainer = styleElement(document.createElement("div"), "right-panel-section");
    const pInput = numberInput(1, "1");
    const dInput = numberInput(1, "1");
    const qInput = numberInput(0, "1");
    arimaContainer.append(fieldLabel("p", pInput), fieldLabel("d", dInput), fieldLabel("q", qInput));
    methodSelect.addEventListener("change", () => { arimaContainer.hidden = methodSelect.value !== "ARIMA"; });
    const calculate = styleElement(document.createElement("button"), "right-panel-button");
    calculate.type = "submit";
    calculate.textContent = "Run Forecast";
    const status = styleElement(document.createElement("output"), "right-panel-status");
    const downloads = styleElement(document.createElement("div"), "right-panel-downloads");
    form.append(fieldLabel("Forecasting Type", typeSelect), vectorSection, rasterSection, fieldLabel("Steps to Predict", stepsInput), fieldLabel("Prediction Method", methodSelect), arimaContainer, calculate, status, downloads);
    wrapper.appendChild(form);
    typeSelect.addEventListener("change", () => {
      const vector = typeSelect.value === "Vector Forecasting";
      vectorSection.hidden = !vector;
      rasterSection.hidden = vector;
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.textContent = "";
      downloads.replaceChildren();
      const steps = Number(stepsInput.value);
      const arimaParams: ArimaParams = { p: Number(pInput.value), d: Number(dInput.value), q: Number(qInput.value) };
      try {
        calculate.disabled = true;
        calculate.textContent = "Calculating...";
        if (typeSelect.value === "Vector Forecasting") {
          if (!geoJsonData) throw new Error("Please upload a GeoJSON file first.");
          if (steps > 10) throw new Error("Maximum steps for vector forecasting is 10.");
          const result = runTemporalForecasting(geoJsonData, locationSelect.value, timestampSelect.value, predictionSelect.value, steps, methodSelect.value, arimaParams);
          _app.addGeoJsonLayer(`${methodSelect.value} result`, result.geojson);
          status.textContent = result.warning ? `Warning: ${result.warning}` : "Forecasting completed successfully!";
          if (DOWNLOAD_FUNCTIONS) {
            const button = styleElement(document.createElement("button"), "right-panel-button");
            button.type = "button";
            button.textContent = "Download GeoJSON";
            button.addEventListener("click", () => downloadBlob(new Blob([JSON.stringify(result.geojson)], { type: "application/geo+json" }), "forecast.geojson"));
            downloads.appendChild(button);
          }
        } else {
          if (steps > 1) throw new Error("Maximum steps for raster forecasting is 1.");
          const inputs = rasterInputsState.filter((input): input is RasterInputFile => input.file !== null);
          if (inputs.length < 2) throw new Error("Please upload at least 2 raster files.");
          const outputs = await runRasterTemporalForecasting(inputs, steps, methodSelect.value, arimaParams);
          for (const output of outputs) {
            const url = URL.createObjectURL(output.blob);
            await _app.addCogLayer?.(`Prediction-(${output.date})`, url);
            if (DOWNLOAD_FUNCTIONS) {
              const button = styleElement(document.createElement("button"), "right-panel-button");
              button.type = "button";
              button.textContent = `Download ${output.name}`;
              button.addEventListener("click", () => downloadBlob(output.blob, output.name));
              downloads.appendChild(button);
            }
          }
          status.textContent = outputs.some((output) => output.warning) ? `Completed with warning: ${outputs.find((output) => output.warning)?.warning}` : "Raster forecasting completed successfully!";
        }
      } catch (error) {
        status.textContent = `Error: ${(error as Error).message}`;
      } finally {
        calculate.disabled = false;
        calculate.textContent = "Run Forecast";
      }
    });
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
      const wrap = styleElement(document.createElement("div"), "geolibre-plugin-right-panel");

      //Description
      const heading = styleElement(document.createElement("h2"), "right-panel-heading");
      heading.textContent = "Plugin Workbench";

      //Method Select
      const method = styleElement(document.createElement("select"), "geoprocessing-method-select");
      drawDropdownOptions(method, BASE_METHODS, BASE_METHODS_TC);
      _method = method;

      //Method Form Container
      const methodFormContainer = styleElement(document.createElement("div"), "geoprocessing-method-form-container");
      _methodForm = methodFormContainer;

      const body = styleElement(document.createElement("p"), "right-panel-description");
      body.textContent =
        "This panel is rendered by the plugin through app.registerRightPanel(). " +
        "Replace this content with your own workbench, query review, or " +
        "dashboard UI. Drive it with app.openRightPanel(), collapseRightPanel(), " +
        "and closeRightPanel().";

      wrap.append(heading, body, method, methodFormContainer);
      container.appendChild(wrap);

      //Event: Method selected
      method.addEventListener("change", () => {
        loadOptionForm(methodFormContainer, method.value);
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
