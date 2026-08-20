# Implementation Plan: Predicting Climate Change Impacts Forecasting

This document outlines the detailed step-by-step implementation plan for porting the Forecasting features from `/Docs/Samples/AttributeForecast/` to the main plugin as `Predicting Climate Change Impacts`, adhering to the plugin's architecture.

This guide is designed to be executed by a junior developer or an AI agent.

---

## 1. Prerequisites and Dependency Installation

Add the `arima` NPM package, which is a WebAssembly port of the native C `ctsa` library.

### Steps:
1. Open [`package.json`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/package.json).
2. Add `"arima": "^0.2.8"` to the `dependencies` object.
3. Run `npm install` in the terminal to install the package.

---

## 2. SpatioProcessing Implementation

Implement all computation and forecasting logic in [`/src/lib/SpatioProcessing/forecasting.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/src/lib/SpatioProcessing/forecasting.ts). Do not put complex computation or file read/write operations inside the UI component.

### Step 2.1: Implement the ARIMA and Linear Extrapolation Solver
Add the following code structure to [`/src/lib/SpatioProcessing/forecasting.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/src/lib/SpatioProcessing/forecasting.ts):

```typescript
import ARIMA from 'arima';
import { readRasterFromFile, writeFloat32TiledGeoTIFF } from '../utils/geotiff-processor';

export interface ArimaParams {
  p: number;
  d: number;
  q: number;
}

export interface ForecastResult {
  status: string;
  data: number[];
}

export class ArimaSolver {
  /**
   * Run a manual ARIMA(p,d,q) forecast on `series` and return `steps` predicted values.
   * Falls back to linear extrapolation when the series is too short or fit fails.
   */
  public static forecast(series: number[], params: ArimaParams, steps: number): ForecastResult {
    if (series.length < params.p + params.d + 2) {
      return {
        status: "Invalid ARIMA parameters, falling back to linear extrapolation",
        data: this.linearExtrapolation(series, steps).data
      };
    }

    let arima: any = null;
    try {
      arima = new ARIMA({
        p: params.p,
        d: params.d,
        q: params.q,
        auto: false,
      }).train(series);

      const [pred] = arima.predict(steps);
      return { status: "Success", data: pred };
    } catch (err) {
      console.error('ARIMA fit failed, falling back to linear extrapolation', err);
      return {
        status: 'ARIMA fit failed, falling back to linear extrapolation: ' + err,
        data: this.linearExtrapolation(series, steps).data
      };
    } finally {
      if (arima && typeof arima.destroy === 'function') {
        arima.destroy();
      }
    }
  }

  /**
   * Simple linear extrapolation: projects forward based on the first and last values.
   */
  public static linearExtrapolation(series: number[], steps: number): ForecastResult {
    const lastVal = series[series.length - 1] ?? 0;
    const firstVal = series[0] ?? 0;
    const slope = series.length > 1 ? (lastVal - firstVal) / (series.length - 1) : 0;

    return {
      status: "Success",
      data: Array.from({ length: steps }, (_, i) => lastVal + slope * (i + 1))
    };
  }
}
```

### Step 2.2: Implement Vector Temporal Forecasting
Add the vector processing function to [`/src/lib/SpatioProcessing/forecasting.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/src/lib/SpatioProcessing/forecasting.ts):

```typescript
/**
 * Groups the input GeoJSON features by location, builds a time-series for each
 * location, runs the selected forecast, and returns a new FeatureCollection
 * containing predicted features.
 */
export function runTemporalForecasting(
  inputGeoJson: any,
  locationField: string,
  timestampField: string,
  predictionField: string,
  steps: number,
  method: string,
  arimaParams: ArimaParams,
): { geojson: any; warning: string } {
  const groups: Record<string, any[]> = {};
  for (const feature of inputGeoJson.features) {
    const locId = feature.properties?.[locationField];
    if (locId !== undefined) {
      if (!groups[locId]) groups[locId] = [];
      groups[locId].push(feature);
    }
  }

  const outputFeatures: any[] = [];
  let forecastWarning = '';

  for (const [locId, features] of Object.entries(groups)) {
    features.sort((a, b) => {
      const tA = new Date(a.properties[timestampField]).getTime();
      const tB = new Date(b.properties[timestampField]).getTime();
      return tA - tB;
    });

    const values = features.map(
      (f) => parseFloat(f.properties[predictionField]) || 0
    );
    const lastFeature = features[features.length - 1];

    let forecastedValues: ForecastResult;
    if (method === "Linear Extrapolation") {
      forecastedValues = ArimaSolver.linearExtrapolation(values, steps);
    } else {
      forecastedValues = ArimaSolver.forecast(values, arimaParams, steps);
    }
    if (forecastedValues.status !== 'Success') {
      forecastWarning = forecastedValues.status;
    }

    let interval = 24 * 60 * 60 * 1000; // default 1 day
    if (features.length > 1) {
      const t1 = new Date(features[0].properties[timestampField]).getTime();
      const tn = new Date(features[features.length - 1].properties[timestampField]).getTime();
      interval = Math.round((tn - t1) / (features.length - 1));
    }

    const lastTime = new Date(lastFeature.properties[timestampField]).getTime();

    for (let step = 0; step < steps; step++) {
      const nextTime = new Date(lastTime + interval * (step + 1));
      const newFeature = {
        type: "Feature",
        geometry: lastFeature.geometry,
        properties: {
          ...lastFeature.properties,
          [locationField]: locId,
          [timestampField]: nextTime.toISOString(),
          [predictionField]: forecastedValues.data[step],
        },
      };
      outputFeatures.push(newFeature);
    }
  }

  return {
    geojson: {
      type: "FeatureCollection",
      features: outputFeatures,
    },
    warning: forecastWarning
  };
}
```

### Step 2.3: Implement Raster Temporal Forecasting
Add the raster forecasting logic that reads multiple raster files and runs pixel-level predictions, saving output rasters as Tiled Float32 GeoTIFFs using our helper:

```typescript
export interface RasterInputFile {
  file: File;
  band: number;
  datetime: string;
}

/**
 * Reads multiple GeoTIFF rasters, runs pixel-level forecasting, and returns tiled GeoTIFF outputs.
 */
export async function runRasterTemporalForecasting(
  inputs: RasterInputFile[],
  steps: number,
  method: string,
  arimaParams: ArimaParams,
): Promise<{ name: string; blob: Blob; date: string; warning: string }[]> {
  const sorted = [...inputs].sort(
    (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
  );

  const parsedRasters = await Promise.all(
    sorted.map(async (item) => {
      const raster = await readRasterFromFile(item.file);
      return {
        ...raster,
        bandIndex: item.band,
        time: new Date(item.datetime).getTime(),
      };
    })
  );

  const base = parsedRasters[0];
  for (let i = 1; i < parsedRasters.length; i++) {
    const cur = parsedRasters[i];
    if (cur.width !== base.width || cur.height !== base.height) {
      throw new Error(
        `Dimension mismatch: Raster #${i + 1} is ${cur.width}x${cur.height}, expected ${base.width}x${base.height}`
      );
    }
  }

  const numPixels = base.width * base.height;
  const numRasters = parsedRasters.length;

  const predictions: Float32Array[] = Array.from(
    { length: steps },
    () => new Float32Array(numPixels)
  );
  let forecastWarning = '';

  for (let pIdx = 0; pIdx < numPixels; pIdx++) {
    const timeSeries = new Array<number>(numRasters);
    for (let rIdx = 0; rIdx < numRasters; rIdx++) {
      const r = parsedRasters[rIdx];
      const srcIdx = pIdx * r.bandCount + r.bandIndex;
      timeSeries[rIdx] = r.data[srcIdx] ?? 0;
    }

    let forecasted: ForecastResult;
    if (method === "Linear Extrapolation") {
      forecasted = ArimaSolver.linearExtrapolation(timeSeries, steps);
    } else {
      forecasted = ArimaSolver.forecast(timeSeries, arimaParams, steps);
    }
    if (forecasted.status !== 'Success') {
      forecastWarning = forecasted.status;
    }

    for (let s = 0; s < steps; s++) {
      predictions[s][pIdx] = forecasted.data[s];
    }
  }

  let interval = 24 * 60 * 60 * 1000;
  if (numRasters > 1) {
    interval = Math.round(
      (parsedRasters[numRasters - 1].time - parsedRasters[0].time) / (numRasters - 1)
    );
  }
  const lastTime = parsedRasters[numRasters - 1].time;

  const outputFiles: { name: string; blob: Blob; date: string; warning: string }[] = [];
  for (let s = 0; s < steps; s++) {
    const predTime = new Date(lastTime + interval * (s + 1));
    const predDateStr = predTime.toISOString();
    const fileName = `Prediction-${predDateStr.replace(/:/g, "-")}.tif`;

    const buffer = writeFloat32TiledGeoTIFF(
      base.width,
      base.height,
      predictions[s],
      base.geotransform,
      base.crsCode,
      1
    );

    const blob = new Blob([buffer], { type: "image/tiff" });
    outputFiles.push({ name: fileName, blob, date: predDateStr, warning: forecastWarning });
  }

  return outputFiles;
}
```

---

## 3. UI Implementation in `right-panel.ts`

Modify the file [`/src/lib/geolibre/right-panel.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/src/lib/geolibre/right-panel.ts).

### Step 3.1: Add Imports
At the top of the file, import the new forecasting functions:
```typescript
import {
  runTemporalForecasting,
  runRasterTemporalForecasting,
  type ArimaParams,
  type RasterInputFile
} from "../SpatioProcessing/forecasting";
import { getGeoTIFFBandCount } from "../utils/geotiff-processor";
```

### Step 3.2: Insert the UI Rendering Block
Inside `loadMethodForm` function, replace:
```typescript
  }else if(method === "Predicting Climate Change"){
    
  }
```

With the following logic to render the panel:

```typescript
  } else if (method === "Predicting Climate Change") {
    const form = document.createElement("form");
    form.className = "suitability-form"; // Reuse existing form styles

    // Forecasting Type Selection
    const typeSelect = document.createElement("select");
    drawDropdownOptions(typeSelect, ["Vector Forecasting", "Raster Forecasting"]);
    form.appendChild(fieldLabel("Forecasting Type", typeSelect));

    // Vector Form Container
    const vectorSection = document.createElement("div");
    const vFileInput = document.createElement("input");
    vFileInput.type = "file";
    vFileInput.accept = ".geojson,.json";
    vectorSection.appendChild(fieldLabel("Upload Vector Data (GeoJSON)", vFileInput));

    const locationSelect = document.createElement("select");
    const timestampSelect = document.createElement("select");
    const predictionSelect = document.createElement("select");

    vectorSection.append(
      fieldLabel("Location ID Field", locationSelect),
      fieldLabel("Timestamp Field", timestampSelect),
      fieldLabel("Prediction Attribute", predictionSelect)
    );

    let geoJsonData: any = null;
    vFileInput.addEventListener("change", async () => {
      const file = vFileInput.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        geoJsonData = JSON.parse(text);
        const firstFeature = geoJsonData.features?.[0];
        if (firstFeature && firstFeature.properties) {
          const attributes = Object.keys(firstFeature.properties);
          drawDropdownOptions(locationSelect, attributes);
          drawDropdownOptions(timestampSelect, attributes);
          drawDropdownOptions(predictionSelect, attributes);
        }
      } catch (err) {
        alert("Failed to parse GeoJSON file: " + (err as Error).message);
      }
    });

    // Raster Form Container
    const rasterSection = document.createElement("div");
    rasterSection.hidden = true;

    const warningBanner = document.createElement("div");
    warningBanner.style.backgroundColor = "#fff2cc";
    warningBanner.style.border = "1px solid #d6b656";
    warningBanner.style.color = "#664d03";
    warningBanner.style.padding = "8px";
    warningBanner.style.borderRadius = "4px";
    warningBanner.style.fontSize = "11px";
    warningBanner.textContent = "Warning: Raster forecasting runs a model for every single pixel. This process may take a considerable amount of time.";
    rasterSection.appendChild(warningBanner);

    const numRastersInput = numberInput(2);
    numRastersInput.min = "2";
    numRastersInput.max = "20";
    rasterSection.appendChild(fieldLabel("Number of Rasters", numRastersInput));

    const rasterCardsContainer = document.createElement("div");
    rasterSection.appendChild(rasterCardsContainer);

    let rasterInputsState: { file: File | null; band: number; datetime: string }[] = [];

    const renderRasterCards = () => {
      rasterCardsContainer.replaceChildren();
      const count = Math.min(20, Math.max(2, Number(numRastersInput.value) || 2));
      
      rasterInputsState = Array.from({ length: count }, (_, idx) => {
        const existing = rasterInputsState[idx];
        if (existing) return existing;
        return {
          file: null,
          band: 0,
          datetime: new Date(Date.now() - (count - 1 - idx) * 24 * 60 * 60 * 1000).toISOString().slice(0, 16)
        };
      });

      rasterInputsState.forEach((stateItem, idx) => {
        const card = document.createElement("div");
        card.style.border = "1px solid var(--pc-border)";
        card.style.padding = "8px";
        card.style.borderRadius = "4px";
        card.style.display = "flex";
        card.style.flexDirection = "column";
        card.style.gap = "6px";
        card.style.marginTop = "6px";

        const title = document.createElement("div");
        title.textContent = `Raster #${idx + 1}`;
        title.style.fontWeight = "bold";
        card.appendChild(title);

        const fileIn = document.createElement("input");
        fileIn.type = "file";
        fileIn.accept = ".tif,.tiff";
        card.appendChild(fieldLabel("Choose File", fileIn));

        const bandSel = document.createElement("select");
        card.appendChild(fieldLabel("Select Band", bandSel));

        const dateIn = document.createElement("input");
        dateIn.type = "datetime-local";
        dateIn.value = stateItem.datetime;
        card.appendChild(fieldLabel("Timestamp", dateIn));

        fileIn.addEventListener("change", async () => {
          const file = fileIn.files?.[0];
          if (!file) return;
          stateItem.file = file;
          try {
            const bands = await getGeoTIFFBandCount(file);
            const options = Array.from({ length: bands }, (_, i) => `Band ${i + 1}`);
            bandSel.replaceChildren();
            drawDropdownOptions(bandSel, options);
            stateItem.band = 0;
          } catch (err) {
            console.error(err);
          }
        });

        bandSel.addEventListener("change", () => {
          stateItem.band = bandSel.selectedIndex;
        });

        dateIn.addEventListener("input", () => {
          stateItem.datetime = dateIn.value;
        });

        rasterCardsContainer.appendChild(card);
      });
    };

    numRastersInput.addEventListener("input", renderRasterCards);
    renderRasterCards();

    // Toggle forms
    typeSelect.addEventListener("change", () => {
      const isVector = typeSelect.value === "Vector Forecasting";
      vectorSection.hidden = !isVector;
      rasterSection.hidden = isVector;
    });

    // Shared Configuration
    const stepsInput = numberInput(1);
    stepsInput.min = "1";

    const methodSelect = document.createElement("select");
    drawDropdownOptions(methodSelect, ["ARIMA", "Linear Extrapolation"]);

    const arimaParamsDiv = document.createElement("div");
    arimaParamsDiv.style.display = "flex";
    arimaParamsDiv.style.gap = "8px";
    const pInput = numberInput(1); pInput.style.width = "50px";
    const dInput = numberInput(1); dInput.style.width = "50px";
    const qInput = numberInput(0); qInput.style.width = "50px";
    arimaParamsDiv.append(
      fieldLabel("p", pInput),
      fieldLabel("d", dInput),
      fieldLabel("q", qInput)
    );

    methodSelect.addEventListener("change", () => {
      arimaParamsDiv.style.display = methodSelect.value === "ARIMA" ? "flex" : "none";
    });

    const calculateBtn = document.createElement("button");
    calculateBtn.type = "submit";
    calculateBtn.textContent = "Run Forecast";

    const statusOutput = document.createElement("output");
    const downloadsContainer = document.createElement("div");

    form.append(
      vectorSection,
      rasterSection,
      fieldLabel("Steps to Predict", stepsInput),
      fieldLabel("Prediction Method", methodSelect),
      arimaParamsDiv,
      calculateBtn,
      statusOutput,
      downloadsContainer
    );
    wrapper.appendChild(form);

    // Form submission
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      statusOutput.textContent = "";
      downloadsContainer.replaceChildren();

      const steps = Number(stepsInput.value);
      const predictionMethod = methodSelect.value;
      const arimaParams: ArimaParams = {
        p: Number(pInput.value),
        d: Number(dInput.value),
        q: Number(qInput.value)
      };

      try {
        calculateBtn.disabled = true;
        calculateBtn.textContent = "Calculating...";

        if (typeSelect.value === "Vector Forecasting") {
          if (!geoJsonData) throw new Error("Please upload a GeoJSON file first.");
          if (steps > 10) throw new Error("Maximum steps for vector forecasting is 10.");

          const result = runTemporalForecasting(
            geoJsonData,
            locationSelect.value,
            timestampSelect.value,
            predictionSelect.value,
            steps,
            predictionMethod,
            arimaParams
          );

          if (_app.addGeoJsonLayer) {
            _app.addGeoJsonLayer(`${predictionMethod}_result`, result.geojson);
          }

          if (result.warning) {
            statusOutput.textContent = `Warning: ${result.warning}`;
          } else {
            statusOutput.textContent = "Forecasting completed successfully!";
          }

          // Handle downloads conditionally based on the global toggle
          if (DOWNLOAD_FUNCTIONS) {
            const vectorBlob = new Blob([JSON.stringify(result.geojson)], { type: "application/json" });
            const dlBtn = document.createElement("button");
            dlBtn.type = "button";
            dlBtn.textContent = "Download GeoJSON";
            dlBtn.addEventListener("click", () => downloadBlob(vectorBlob, "forecast.geojson"));
            downloadsContainer.appendChild(dlBtn);
          }

        } else {
          // Raster Forecasting
          const validInputs = rasterInputsState.filter((input) => input.file !== null) as RasterInputFile[];
          if (validInputs.length < 2) throw new Error("Please upload at least 2 raster files.");
          if (steps > 1) throw new Error("Maximum steps for raster forecasting is 1.");

          const outputs = await runRasterTemporalForecasting(
            validInputs,
            steps,
            predictionMethod,
            arimaParams
          );

          for (const output of outputs) {
            const objectUrl = URL.createObjectURL(output.blob);
            if (_app.addCogLayer) {
              await _app.addCogLayer(`Prediction-(${output.date})`, objectUrl);
            }

            if (DOWNLOAD_FUNCTIONS) {
              const dlBtn = document.createElement("button");
              dlBtn.type = "button";
              dlBtn.textContent = `Download ${output.name}`;
              dlBtn.addEventListener("click", () => downloadBlob(output.blob, output.name));
              downloadsContainer.appendChild(dlBtn);
            }
          }

          const hasWarnings = outputs.find(o => o.warning !== '');
          if (hasWarnings) {
            statusOutput.textContent = `Completed with warning: ${hasWarnings.warning}`;
          } else {
            statusOutput.textContent = "Raster forecasting completed successfully!";
          }
        }
      } catch (err) {
        statusOutput.textContent = "Error: " + (err as Error).message;
      } finally {
        calculateBtn.disabled = false;
        calculateBtn.textContent = "Run Forecast";
      }
    });
  }
```

---

## 4. Verification Plan

Verify the implementation using the following manual checks:

### 4.1 Vector Forecasting Verification
1. Activate the plugin and select the **Predicting Climate Change** processing function in the workbench panel.
2. Select **Vector Forecasting** as the Forecasting Type.
3. Upload a sample temporal GeoJSON file (e.g. from `/Docs/Samples/AttributeForecast/Docs/Sample/temporal.geojson` if available).
4. Select the location ID, timestamp, and attribute fields from the dynamically populated dropdowns.
5. Set prediction steps to `2` and select method **ARIMA**. Run the forecast.
6. Verify that:
   - Features are added to the map.
   - If `DOWNLOAD_FUNCTIONS` is `true`, a "Download GeoJSON" button appears and functions.
   - If `DOWNLOAD_FUNCTIONS` is changed to `false` in `right-panel.ts`, the download buttons are hidden.

### 4.2 Raster Forecasting Verification
1. Select **Raster Forecasting** as the Forecasting Type.
2. Set "Number of Rasters" to `2`.
3. Select two `.tif` files, select their bands, and set their timestamps.
4. Select **Linear Extrapolation** and set steps to `1`. Run the forecast.
5. Verify that:
   - A Cog layer is registered on the map.
   - If `DOWNLOAD_FUNCTIONS` is `true`, download buttons for the raster files appear.
