# Implementation Plan: Spatial Interpolation Feature

This document outlines the detailed steps required to implement the Spatial Interpolation function in the Spatio Geostatistics plugin by porting it from the sample implementation.

---

## 1. Dependencies

### Step 1.1: Install Kriging Library
Add the `@sakitam-gis/kriging` package to the project dependencies.

Run the following command in the project root:
```bash
npm install @sakitam-gis/kriging
```
Or manually edit [`package.json`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/package.json) to add it to the `dependencies` section:
```json
"dependencies": {
  ...
  "@sakitam-gis/kriging": "^0.1.0",
  ...
}
```

---

## 2. Spatio Processing Layer

Create the file [`/src/lib/SpatioProcessing/interpolation.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/src/lib/SpatioProcessing/interpolation.ts) to handle the data processing and kriging logic.

### Step 2.1: Implement Point Extraction & Kriging Logic
Copy and clean up the centroid extraction and kriging calculations from the sample code into this module.

```typescript
import kriging from "@sakitam-gis/kriging";

export interface SamplePoint {
  lng: number;
  lat: number;
  value: number;
}

export interface InterpolationProgressUpdate {
  message: string;
  isError?: boolean;
}

export interface InterpolationResult {
  gridData: Float32Array;
  width: number;
  height: number;
  bounds: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
}

/**
 * Extract only properties with numeric values from the first feature of a GeoJSON FeatureCollection.
 */
export function getNumericKeys(geojson: any): string[] {
  if (!geojson || !geojson.features || !geojson.features.length) return [];
  const props = geojson.features[0].properties ?? {};
  return Object.keys(props).filter((k) => typeof props[k] === "number");
}

/**
 * Extract SamplePoints from GeoJSON, supporting Point, Polygon (centroid), and MultiPolygon (centroid) geometries.
 */
export function extractPoints(geojson: any, attribute: string): SamplePoint[] {
  const pts: SamplePoint[] = [];
  if (!geojson || !geojson.features) return pts;

  for (const feature of geojson.features) {
    const value = feature.properties?.[attribute];
    if (typeof value !== "number") continue;
    const { type, coordinates } = feature.geometry;

    if (type === "Point") {
      const [lng, lat] = coordinates as number[];
      pts.push({ lng, lat, value });
    } else if (type === "Polygon") {
      const outerRing = (coordinates as [number, number][][])[0];
      if (outerRing && outerRing.length > 0) {
        const lng = outerRing.reduce((s, c) => s + c[0], 0) / outerRing.length;
        const lat = outerRing.reduce((s, c) => s + c[1], 0) / outerRing.length;
        pts.push({ lng, lat, value });
      }
    } else if (type === "MultiPolygon") {
      const polygons = coordinates as [number, number][][][];
      for (const poly of polygons) {
        const outerRing = poly[0];
        if (outerRing && outerRing.length > 0) {
          const lng = outerRing.reduce((s, c) => s + c[0], 0) / outerRing.length;
          const lat = outerRing.reduce((s, c) => s + c[1], 0) / outerRing.length;
          pts.push({ lng, lat, value });
        }
      }
    }
  }
  return pts;
}

/**
 * Performs Kriging spatial interpolation on the provided points asynchronously in chunks to prevent freezing the main UI thread.
 */
export function interpolateKriging(
  points: SamplePoint[],
  onProgress: (status: InterpolationProgressUpdate) => void,
  onComplete: (result: InterpolationResult) => void,
  onError: (err: any) => void
): void {
  try {
    const minLng = Math.min(...points.map((p) => p.lng));
    const maxLng = Math.max(...points.map((p) => p.lng));
    const minLat = Math.min(...points.map((p) => p.lat));
    const maxLat = Math.max(...points.map((p) => p.lat));

    const width = 100;
    const height = 100;
    const dx = (maxLng - minLng) / width;
    const dy = (maxLat - minLat) / height;

    onProgress({ message: `Fitting kriging variogram (${points.length} points)…` });

    const lngs = points.map((p) => p.lng);
    const lats = points.map((p) => p.lat);
    const values = points.map((p) => p.value);

    // Yield to let the progress message render
    setTimeout(() => {
      try {
        const variogram = kriging.train(values, lngs, lats, "exponential", 0, 100);
        onProgress({ message: "Predicting grid values (0%)…" });

        const gridData = new Float32Array(width * height);
        let y = 0;

        function predictChunk() {
          try {
            const chunkEnd = Math.min(y + 10, height);
            for (; y < chunkEnd; y++) {
              const lat = maxLat - y * dy; // top-left origin
              for (let x = 0; x < width; x++) {
                const lng = minLng + x * dx;
                gridData[y * width + x] = kriging.predict(lng, lat, variogram);
              }
            }

            if (y < height) {
              onProgress({ message: `Predicting grid values (${Math.round((y / height) * 100)}%)…` });
              setTimeout(predictChunk, 0);
            } else {
              onComplete({
                gridData,
                width,
                height,
                bounds: [minLng, minLat, maxLng, maxLat],
              });
            }
          } catch (err) {
            onError(err);
          }
        }

        setTimeout(predictChunk, 0);
      } catch (err) {
        onError(err);
      }
    }, 50);
  } catch (err) {
    onError(err);
  }
}
```

---

## 3. UI and Integration Layer

Modify [`/src/lib/geolibre/right-panel.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/src/lib/geolibre/right-panel.ts) to mount the Spatial Interpolation UI and integrate the geotiff writing process.

### Step 3.1: Add Imports
Import the core interpolation routines and the geotiff utility function at the top of the file:
```typescript
import {
  extractPoints,
  getNumericKeys,
  interpolateKriging,
  type SamplePoint,
} from "../SpatioProcessing/interpolation";
import { writeFloat32TiledGeoTIFF } from "../utils/geotiff-processor";
```

### Step 3.2: Implement the Form UI in `loadMethodForm`
Fill in the form construction inside `if (method === "Spatial Interpolation")` at line 102:

```typescript
  if(method === "Spatial Interpolation"){
    const form = document.createElement("form");
    form.className = "interpolation-form";

    // 1. GeoJSON File input field
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".geojson,application/json";
    form.appendChild(fieldLabel("GeoJSON File", fileInput));

    // 2. Load Vector button (loads current GeoJSON onto map as vector layer)
    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.textContent = "Load Vector";
    loadBtn.disabled = true;
    form.appendChild(loadBtn);

    // 3. Numeric Attribute dropdown selection
    const attrSelect = document.createElement("select");
    const attrLabelContainer = fieldLabel("Numeric Attribute", attrSelect);
    attrLabelContainer.style.display = "none";
    form.appendChild(attrLabelContainer);

    // 4. Method dropdown selection
    const methodSelect = document.createElement("select");
    drawDropdownOptions(methodSelect, ["kriging"], ["Kriging"]);
    const methodLabelContainer = fieldLabel("Interpolation Method", methodSelect);
    methodLabelContainer.style.display = "none";
    form.appendChild(methodLabelContainer);

    // 5. Submit/Run button
    const calculate = document.createElement("button");
    calculate.type = "submit";
    calculate.textContent = "Interpolate";
    calculate.disabled = true;
    calculate.style.display = "none";
    form.appendChild(calculate);

    // 6. Status Output
    const status = document.createElement("output");
    status.className = "interpolation-status";
    form.appendChild(status);

    // 7. Downloads Container
    const downloads = document.createElement("div");
    downloads.className = "interpolation-downloads";
    form.appendChild(downloads);

    wrapper.appendChild(form);

    // Stateful variables
    let geojson: any = null;
    let fileName = "";
    let resultUrl: string | null = null;

    // Helper: Update Status Text
    const setStatus = (msg: string, isError = false) => {
      status.textContent = msg;
      status.style.color = isError ? "#e53e3e" : "";
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
        attrLabelContainer.style.display = "";
        methodLabelContainer.style.display = "";
        loadBtn.disabled = false;
        calculate.style.display = "block";
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
                const rasterDownload = document.createElement("button");
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
```

---

## 4. Verification Plan

Verify the solution compiles correctly and runs without errors.

### 4.1 Automated Build Verification
Verify there are no TypeScript compilation or packaging errors by running:
```bash
npm run build
```

### 4.2 Manual Verification Steps
1. Start the plugin development server.
2. Select "Spatial Interpolation" from the sidebar menu dropdown.
3. Upload a sample GeoJSON file (e.g., coordinates with numeric values).
4. Select the numeric attribute you want to interpolate.
5. Click **Interpolate** and check that the status messages update dynamically.
6. Verify the interpolated raster layer is successfully created and shown on the map.
7. If `DOWNLOAD_FUNCTIONS` is enabled, verify clicking **Download raster** yields a correct `.tif` file.
