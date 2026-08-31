# Resolve Fix 02: WGS 84 Reprojection for Vector GeoJSON and Dynamic Kriging Model Form Selection

This document outlines the step-by-step implementation plan to resolve the two items described in [`Docs/Fix/Fix02.md`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/Docs/Fix/Fix02.md), including extracting the source CRS from raster files when polygonizing/vectorizing raster results (e.g. in Suitability Modeling).

---

## Problem Description

1. **WGS 84 (EPSG:4326) CRS Reprojection**:
   - GeoLibre requires vector GeoJSON layers to be strictly in WGS 84 (`EPSG:4326` with `[lng, lat]` coordinates in degrees).
   - When vector layers are generated from rasters (such as suitability polygonization via `buildSuitabilityVectorFromRasterBlob`), the raster coordinates generated using `raster.geotransform` are in the raster's native CRS (`raster.crsCode`, e.g., `EPSG:3857`, UTM `EPSG:32633`, etc.).
   - If the raster is not already in EPSG:4326, the generated polygons will have coordinates in that projected CRS (e.g. meters), which causes them to be misplaced or invisible on the map.
   - Any vector GeoJSON (uploaded or generated from raster/forecasting operations) must determine its source CRS—including extracting `raster.crsCode` from the raster source—and automatically transform coordinates to WGS 84 (`EPSG:4326`) before being loaded to GeoLibre via `_app.addGeoJsonLayer`.

2. **Dynamic Kriging Model Sub-Form Selection**:
   - In the Spatial Interpolation panel, `kriging.train()` currently hardcodes `"exponential"` as the variogram model.
   - The UI should display a dedicated sub-form container directly below the "Interpolation Method" dropdown.
   - When "Kriging" is selected, this container must show a form field for Kriging Model selection (**Gaussian**, **Exponential**, **Spherical**; with **Exponential** as the default).
   - If other interpolation methods are selected in the future, this sub-form container should dynamically adapt or clear.

---

## Proposed Architecture & Changes

### 1. New Dependency

- Add [`proj4`](https://www.npmjs.com/package/proj4) and [`@types/proj4`](https://www.npmjs.com/package/@types/proj4) to handle coordinate transformation from any source EPSG code or proj4 string to standard WGS 84 (`EPSG:4326`).

---

### 2. New CRS Reprojection Utility

#### [NEW] [`/src/lib/utils/crs-converter.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/src/lib/utils/crs-converter.ts)

Create a dedicated helper module that:
1. Detects CRS metadata from `geojson.crs` (e.g. `urn:ogc:def:crs:EPSG::3857`, `EPSG:3857`, `EPSG:4326`, etc.).
2. Accepts an optional explicit `sourceCrs` (e.g. `EPSG:3857` or `EPSG:${raster.crsCode}` acquired from the source raster).
3. Fallback: inspects coordinate bounds heuristics if CRS metadata is omitted (e.g., coordinate values exceeding `[-180, 180]` / `[-90, 90]` indicating projected meters such as `EPSG:3857`).
4. Recursively reprojects coordinates across all GeoJSON geometry types (`Point`, `MultiPoint`, `LineString`, `MultiLineString`, `Polygon`, `MultiPolygon`, `GeometryCollection`).
5. Returns clean WGS 84 `FeatureCollection` or `Feature` objects with standard `urn:ogc:def:crs:OGC:1.3:CRS84` metadata.

---

### 3. Acquiring Source CRS from Raster in Suitability Modeling

#### File: [`/src/lib/SpatioProcessing/suitability.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/src/lib/SpatioProcessing/suitability.ts)

When `buildSuitabilityVectorFromRasterBlob` reads the raster via `readRasterFromFile`, it obtains `raster.crsCode` (e.g. `3857`, `4326`, `32633`).
1. Attach `crs` property or `crsCode` to the generated GeoJSON `FeatureCollection` or reproject immediately within `buildSuitabilityVectorFromRasterBlob` using `ensureWgs84GeoJson(featureCollection, `EPSG:${raster.crsCode}`)`.
2. Tag the output with `crs: { type: "name", properties: { name: `EPSG:${raster.crsCode}` } }` before conversion so the source CRS is preserved and converted accurately to WGS 84.

---

### 4. Spatial Interpolation Processing Updates

#### File: [`/src/lib/SpatioProcessing/interpolation.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/src/lib/SpatioProcessing/interpolation.ts)

1. Define and export `KrigingModel` type:
   ```typescript
   export type KrigingModel = "gaussian" | "exponential" | "spherical";
   ```
2. Update `interpolateKriging` parameter list to accept `model: KrigingModel = "exponential"`:
   ```typescript
   export function interpolateKriging(
     points: SamplePoint[],
     model: KrigingModel = "exponential",
     onProgress: (status: InterpolationProgressUpdate) => void,
     onComplete: (result: InterpolationResult) => void,
     onError: (err: any) => void
   ): void
   ```
3. Use the `model` argument in `kriging.train()`:
   ```typescript
   const variogram = kriging.train(values, lngs, lats, model, 0, 100);
   ```

---

### 5. Right Panel UI Updates

#### File: [`/src/lib/geolibre/right-panel.ts`](file:///c:/Users/erwin/OneDrive/Documents/Learning/Plugin%20Spatio/ScenarioModelingandGeostatistics/src/lib/geolibre/right-panel.ts)

1. **Reproject Loaded Vector Data**:
   - In `Spatial Interpolation`, when reading the uploaded file in `fileInput.addEventListener("change")` and when pressing `loadBtn`, wrap the GeoJSON object with `ensureWgs84GeoJson(geojson)`.
   - In `Suitability Modeling`, `buildSuitabilityVectorFromRasterBlob(output)` produces WGS 84 GeoJSON (reprojected via the source raster's `crsCode`), which is passed safely to `_app.addGeoJsonLayer()`.
   - In `Climate Change Forecasting`, pass output vectors through `ensureWgs84GeoJson()` prior to `_app.addGeoJsonLayer()`.

2. **Add Dynamic Sub-Form Container under Interpolation Method**:
   - Insert a container element `methodOptionsContainer` (styled with `"geoprocessing-method-form-container"`) right below `methodLabelContainer`.
   - Implement `renderMethodOptions()`:
     - Clear `methodOptionsContainer`.
     - When `methodSelect.value === "kriging"`, create a dropdown for Kriging Model with options `["exponential", "gaussian", "spherical"]` and labels `["Exponential", "Gaussian", "Spherical"]` (defaulting to `"exponential"`).
     - Listen to `modelSelect.change` to track `selectedKrigingModel`.
   - Listen to `methodSelect.addEventListener("change", renderMethodOptions)`.
   - Call `renderMethodOptions()` on initial file load.

3. **Pass Model to Kriging Execution**:
   - Pass `selectedKrigingModel` into `interpolateKriging(points, selectedKrigingModel, ...)` inside form submission.

---

## Detailed Code Instructions for Junior Developer / AI Agent

### Step 1: Install `proj4`
Run in terminal:
```bash
npm install proj4
npm install --save-dev @types/proj4
```

### Step 2: Create `src/lib/utils/crs-converter.ts`
Create the file with the following content:
```typescript
import proj4 from "proj4";

if (!proj4.defs("EPSG:4326")) {
  proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs +type=crs");
}
if (!proj4.defs("EPSG:3857")) {
  proj4.defs(
    "EPSG:3857",
    "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs"
  );
}

export function extractCrsFromGeoJson(geojson: any): string | null {
  if (!geojson) return null;

  const crs = geojson.crs;
  if (crs) {
    if (crs.type === "name" && crs.properties?.name) {
      const name: string = crs.properties.name;
      const match = name.match(/EPSG:{1,2}(\d+)/i);
      if (match) return `EPSG:${match[1]}`;
      if (name.includes("CRS84") || name.includes("4326")) return "EPSG:4326";
      return name;
    }
    if (crs.type === "EPSG" && crs.properties?.code) {
      return `EPSG:${crs.properties.code}`;
    }
  }

  const sampleCoord = getFirstCoordinate(geojson);
  if (sampleCoord) {
    const [x, y] = sampleCoord;
    if (Math.abs(x) > 180 || Math.abs(y) > 90) {
      return "EPSG:3857";
    }
  }

  return null;
}

function getFirstCoordinate(geojson: any): [number, number] | null {
  const feature = geojson?.features?.[0] ?? (geojson?.type === "Feature" ? geojson : null);
  if (!feature?.geometry?.coordinates) return null;
  const geom = feature.geometry;

  function findCoord(coords: any): [number, number] | null {
    if (!Array.isArray(coords)) return null;
    if (coords.length >= 2 && typeof coords[0] === "number" && typeof coords[1] === "number") {
      return [coords[0], coords[1]];
    }
    for (const item of coords) {
      const found = findCoord(item);
      if (found) return found;
    }
    return null;
  }

  return findCoord(geom.coordinates);
}

function reprojectCoordinates(coords: any, sourceCrs: string): any {
  if (!Array.isArray(coords)) return coords;
  if (coords.length >= 2 && typeof coords[0] === "number" && typeof coords[1] === "number") {
    const [x, y, ...rest] = coords;
    try {
      const [lng, lat] = proj4(sourceCrs, "EPSG:4326", [x, y]);
      return [lng, lat, ...rest];
    } catch {
      return [x, y, ...rest];
    }
  }
  return coords.map((c) => reprojectCoordinates(c, sourceCrs));
}

function reprojectGeometry(geometry: any, sourceCrs: string): any {
  if (!geometry) return geometry;
  if (geometry.type === "GeometryCollection" && Array.isArray(geometry.geometries)) {
    return {
      ...geometry,
      geometries: geometry.geometries.map((g: any) => reprojectGeometry(g, sourceCrs)),
    };
  }
  return {
    ...geometry,
    coordinates: reprojectCoordinates(geometry.coordinates, sourceCrs),
  };
}

/**
 * Converts GeoJSON to WGS 84 (EPSG:4326).
 * @param geojson - Input GeoJSON object.
 * @param explicitSourceCrs - Optional explicit source CRS (e.g. acquired from raster source metadata: "EPSG:3857" or "EPSG:32633").
 */
export function ensureWgs84GeoJson<T = any>(geojson: T, explicitSourceCrs?: string): T {
  if (!geojson || typeof geojson !== "object") return geojson;
  const detectedCrs = explicitSourceCrs ?? extractCrsFromGeoJson(geojson);

  if (!detectedCrs || detectedCrs === "EPSG:4326" || detectedCrs === "CRS84") {
    return geojson;
  }

  const cloned: any = JSON.parse(JSON.stringify(geojson));

  if (cloned.type === "FeatureCollection" && Array.isArray(cloned.features)) {
    cloned.features = cloned.features.map((feature: any) => ({
      ...feature,
      geometry: reprojectGeometry(feature.geometry, detectedCrs),
    }));
  } else if (cloned.type === "Feature") {
    cloned.geometry = reprojectGeometry(cloned.geometry, detectedCrs);
  } else if (cloned.type && cloned.coordinates) {
    return reprojectGeometry(cloned, detectedCrs);
  }

  cloned.crs = {
    type: "name",
    properties: {
      name: "urn:ogc:def:crs:OGC:1.3:CRS84",
    },
  };

  return cloned;
}
```

### Step 3: Update `src/lib/SpatioProcessing/suitability.ts`
Import `ensureWgs84GeoJson` and convert vectors using `raster.crsCode`:
```typescript
import { ensureWgs84GeoJson } from "../utils/crs-converter";
```
Inside `buildSuitabilityVectorFromRasterBlob`:
```typescript
export async function buildSuitabilityVectorFromRasterBlob(
  rasterBlob: Blob,
  options: BuildSuitabilityVectorOptions = {},
): Promise<FeatureCollection<Polygon | MultiPolygon, SuitabilityVectorProperties>> {
  const raster = await readRasterFromFile(new File([rasterBlob], 'suitability-output.tif'));
  // ... existing polygonization logic building raw features ...
  const rawCollection: FeatureCollection<Polygon | MultiPolygon, SuitabilityVectorProperties> = {
    type: 'FeatureCollection',
    features,
  };

  // Acquire source CRS from the raster source and reproject to WGS 84
  const sourceCrs = raster.crsCode ? `EPSG:${raster.crsCode}` : undefined;
  return ensureWgs84GeoJson(rawCollection, sourceCrs);
}
```

### Step 4: Update `src/lib/SpatioProcessing/interpolation.ts`
1. Add `export type KrigingModel = "gaussian" | "exponential" | "spherical";`
2. Update signature:
```typescript
export function interpolateKriging(
  points: SamplePoint[],
  model: KrigingModel = "exponential",
  onProgress: (status: InterpolationProgressUpdate) => void,
  onComplete: (result: InterpolationResult) => void,
  onError: (err: any) => void
): void {
```
3. Update `kriging.train`:
```typescript
const variogram = kriging.train(values, lngs, lats, model, 0, 100);
```

### Step 5: Update `src/lib/geolibre/right-panel.ts`
1. Import `ensureWgs84GeoJson` and `KrigingModel`.
2. Under `methodLabelContainer`, add `methodOptionsContainer`:
```typescript
    // 4. Method dropdown selection
    const methodSelect = styleElement(document.createElement("select"), "right-panel-control");
    drawDropdownOptions(methodSelect, ["kriging"], ["Kriging"]);
    const methodLabelContainer = fieldLabel("Interpolation Method", methodSelect);
    methodLabelContainer.hidden = true;
    form.appendChild(methodLabelContainer);

    // 4b. Method options sub-form container
    const methodOptionsContainer = styleElement(document.createElement("div"), "geoprocessing-method-form-container");
    form.appendChild(methodOptionsContainer);
```
3. Add state and dynamic rendering logic:
```typescript
    let selectedKrigingModel: KrigingModel = "exponential";

    const renderMethodOptions = () => {
      methodOptionsContainer.replaceChildren();
      if (methodSelect.value === "kriging") {
        const modelSelect = styleElement(document.createElement("select"), "right-panel-control");
        drawDropdownOptions(
          modelSelect,
          ["exponential", "gaussian", "spherical"],
          ["Exponential", "Gaussian", "Spherical"]
        );
        modelSelect.value = selectedKrigingModel;
        modelSelect.addEventListener("change", () => {
          selectedKrigingModel = modelSelect.value as KrigingModel;
        });
        const modelLabel = fieldLabel("Kriging Model", modelSelect);
        methodOptionsContainer.appendChild(modelLabel);
      }
    };

    methodSelect.addEventListener("change", renderMethodOptions);
```
4. Call `renderMethodOptions()` when GeoJSON numeric attributes are parsed.
5. In `fileInput` reader and `loadBtn`, wrap `geojson` in `ensureWgs84GeoJson(geojson)`.
6. Pass `selectedKrigingModel` to `interpolateKriging(points, selectedKrigingModel, ...)`.
7. Wrap output vectors in suitability modeling and forecasting with `ensureWgs84GeoJson()`.

---

## Verification Plan

### Automated Verification
1. Run `npm test` to verify test suites pass.
2. Run `npm run build` to ensure clean TypeScript compilation and bundle generation.

### Manual Verification
1. Open the plugin inside GeoLibre.
2. Test WGS 84 Reprojection from Raster Sources:
   - Run Suitability Modeling on a raster whose native CRS is `EPSG:3857`.
   - Verify that the resulting "Suitability regions" vector layer is accurately converted to WGS 84 degrees and aligns with map layers without offset.
3. Test Kriging Model Dynamic Form:
   - Select "Spatial Interpolation".
   - Upload a GeoJSON point file.
   - Verify the sub-form container appears below "Interpolation Method" showing the "Kriging Model" dropdown with "Exponential" selected by default.
   - Select "Gaussian" or "Spherical", run interpolation, and verify that the resulting raster is generated and rendered correctly.
