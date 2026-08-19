# Implementation Plan: Suitability Modeling Functionality

This plan details the steps required to port the Suitability Modeling functionality from the sample plugin (`/Docs/Samples/SuitabilityModeling/`) to the active plugin project. 

This guide assumes implementation will be completed by a junior developer or a cheaper AI agent. Follow the instructions below step-by-step.

---

## 1. New Required Dependencies

To support polygon generation and area calculations from rasters, install the `@turf/turf` package.

### Installation Command
Run this in the project root:
```bash
npm install @turf/turf
```

---

## 2. Processing Logic: `/src/lib/SpatioProcessing/suitability.ts`

Port the core calculation algorithms from the sample's `raster-normalizer.ts` and `vector-generator.ts` to `suitability.ts`, adapting them to use `/src/lib/utils/geotiff-processor.ts`.

### Key Modifications
* Use `readRasterFromFile` to read TIFF metadata/pixels instead of raw `geotiff.js` calls.
* Use `writeFloat32TiledGeoTIFF` to save calculating outputs so they are generated as tiled GeoTIFFs.
* Wrap `Blob` inputs into a `File` constructor (e.g. `new File([blob], "temp.tif")`) when feeding them into `readRasterFromFile`.

### Target Code Skeleton to Implement

```typescript
import {
  readRasterFromFile,
  writeFloat32TiledGeoTIFF,
} from '../utils/geotiff-processor.ts';
import { area, multiPolygon, polygon } from '@turf/turf';
import type { FeatureCollection, Polygon, MultiPolygon, Feature } from 'geojson';

// --- Types ---

export type ComparisonMethod = '<' | '<=' | '=' | '>' | '>=' | '!=' | 'within';

export interface SuitabilityOptions {
  comparisonMethod: ComparisonMethod;
  comparisonValue: number;
  lowerInterval?: number;
  upperInterval?: number;
  normalizeResult: boolean;
}

export type MceBandMode = 'all' | 'average' | 'first';

export interface MceRasterProcessingOptions {
  bandMode?: MceBandMode;
  mode?: 'before' | 'after';
}

export interface MceRasterInput {
  file: File;
  weight: number;
}

export interface BuildSuitabilityVectorOptions {
  connectivity?: 4 | 8;
  filterByArea?: boolean;
  minArea?: number;
  maxArea?: number;
}

export interface SuitabilityVectorProperties {
  min: number;
  max: number;
  average: number;
  area: number;
  cells: number;
}

// --- Helper: Comparison Evaluator ---
function matchesComparison(value: number, options: SuitabilityOptions): boolean {
  const compVal = options.comparisonValue;
  switch (options.comparisonMethod) {
    case '<': return value < compVal;
    case '<=': return value <= compVal;
    case '=': return value === compVal;
    case '>': return value > compVal;
    case '>=': return value >= compVal;
    case '!=': return value !== compVal;
    case 'within': {
      const lower = options.lowerInterval ?? 0;
      const upper = options.upperInterval ?? 0;
      return value >= (compVal - lower) && value <= (compVal + upper);
    }
    default: return false;
  }
}

// --- MCE Processing ---
export async function buildMceRaster(
  inputs: MceRasterInput[],
  options: MceRasterProcessingOptions = {}
): Promise<Blob | null> {
  if (inputs.length === 0) return null;

  const bandMode = options.bandMode || 'first';
  const averageTiming = options.mode || 'before';

  const layers: Array<{
    data: Float32Array;
    width: number;
    height: number;
    geotransform: [number, number, number, number, number, number];
    crsCode: number;
    weight: number;
  }> = [];

  for (const input of inputs) {
    const raster = await readRasterFromFile(input.file);
    const totalPixels = raster.width * raster.height;
    
    // Normalize logic
    let processedData = new Float32Array(totalPixels);
    const noData = raster.noDataValue;

    if (bandMode === 'first') {
      for (let i = 0; i < totalPixels; i++) {
        const val = raster.data[i * raster.bandCount];
        processedData[i] = (val === noData || !isFinite(val)) ? 0 : val;
      }
      processedData = normalizeValues(processedData);
    } else if (bandMode === 'average' && averageTiming === 'before') {
      // Average bands before normalizing
      for (let i = 0; i < totalPixels; i++) {
        let sum = 0;
        let count = 0;
        for (let b = 0; b < raster.bandCount; b++) {
          const val = raster.data[i * raster.bandCount + b];
          if (val !== noData && isFinite(val)) {
            sum += val;
            count++;
          }
        }
        processedData[i] = count === 0 ? 0 : sum / count;
      }
      processedData = normalizeValues(processedData);
    } else if (bandMode === 'average' && averageTiming === 'after') {
      // Normalize bands individually first, then average
      const normalizedBands: Float32Array[] = [];
      for (let b = 0; b < raster.bandCount; b++) {
        const bandData = new Float32Array(totalPixels);
        for (let i = 0; i < totalPixels; i++) {
          const val = raster.data[i * raster.bandCount + b];
          bandData[i] = (val === noData || !isFinite(val)) ? 0 : val;
        }
        normalizedBands.push(normalizeValues(bandData));
      }
      for (let i = 0; i < totalPixels; i++) {
        let sum = 0;
        for (let b = 0; b < raster.bandCount; b++) {
          sum += normalizedBands[b][i];
        }
        processedData[i] = sum / raster.bandCount;
      }
    } else {
      // Process all bands (keep multiple bands)
      const totalSamples = totalPixels * raster.bandCount;
      processedData = new Float32Array(totalSamples);
      for (let i = 0; i < totalSamples; i++) {
        const val = raster.data[i];
        processedData[i] = (val === noData || !isFinite(val)) ? 0 : val;
      }
      processedData = normalizeValues(processedData);
    }

    layers.push({
      data: processedData,
      width: raster.width,
      height: raster.height,
      geotransform: raster.geotransform,
      crsCode: raster.crsCode,
      weight: input.weight
    });
  }

  // Combine layers using weights
  const base = layers[0];
  const outputData = new Float32Array(base.data.length);
  for (const layer of layers) {
    if (layer.width !== base.width || layer.height !== base.height) {
      throw new Error("Raster dimensions mismatch. All inputs must have the same size.");
    }
    for (let i = 0; i < outputData.length; i++) {
      outputData[i] += layer.data[i] * layer.weight;
    }
  }

  const bandCount = (bandMode === 'average' || bandMode === 'first') ? 1 : (await readRasterFromFile(inputs[0].file)).bandCount;

  const tiffBuffer = writeFloat32TiledGeoTIFF(
    base.width,
    base.height,
    outputData,
    base.geotransform,
    base.crsCode,
    bandCount
  );

  return new Blob([tiffBuffer], { type: 'image/tiff' });
}

function normalizeValues(values: Float32Array): Float32Array {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  const res = new Float32Array(values.length);
  if (range > 0) {
    for (let i = 0; i < values.length; i++) {
      res[i] = (values[i] - min) / range;
    }
  }
  return res;
}

// --- Suitability Raster Generation ---
export async function buildSuitabilityRaster(
  inputRaster: File | Blob,
  options: SuitabilityOptions
): Promise<Blob | null> {
  const file = inputRaster instanceof File ? inputRaster : new File([inputRaster], "temp.tif");
  const raster = await readRasterFromFile(file);
  const totalSamples = raster.width * raster.height * raster.bandCount;

  const filtered = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    const val = raster.data[i];
    filtered[i] = (val !== raster.noDataValue && isFinite(val) && matchesComparison(val, options)) ? val : NaN;
  }

  let finalData = filtered;
  if (options.normalizeResult) {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < totalSamples; i++) {
      if (isFinite(filtered[i])) {
        min = Math.min(min, filtered[i]);
        max = Math.max(max, filtered[i]);
      }
    }
    if (max > min) {
      finalData = new Float32Array(totalSamples);
      for (let i = 0; i < totalSamples; i++) {
        finalData[i] = isFinite(filtered[i]) ? (filtered[i] - min) / (max - min) : NaN;
      }
    }
  }

  const tiffBuffer = writeFloat32TiledGeoTIFF(
    raster.width,
    raster.height,
    finalData,
    raster.geotransform,
    raster.crsCode,
    raster.bandCount
  );

  return new Blob([tiffBuffer], { type: 'image/tiff' });
}

// --- Suitability Vector Extraction ---
export async function buildSuitabilityVectorFromRasterBlob(
  rasterBlob: Blob,
  options: BuildSuitabilityVectorOptions
): Promise<FeatureCollection<Polygon | MultiPolygon, SuitabilityVectorProperties>> {
  const file = new File([rasterBlob], "temp.tif");
  const raster = await readRasterFromFile(file);

  // Extract values for the first band (following sample's logic)
  const singleBandValues = new Float32Array(raster.width * raster.height);
  for (let i = 0; i < singleBandValues.length; i++) {
    singleBandValues[i] = raster.data[i * raster.bandCount];
  }

  // Reuse the flood-fill BFS grouping & boundary tracing from Docs/Samples/SuitabilityModeling/src/lib/utils/vector-generator.ts
  return traceVectorFeatures({
    values: singleBandValues,
    width: raster.width,
    height: raster.height,
    origin: [raster.geotransform[0], raster.geotransform[3], 0],
    resolution: [raster.geotransform[1], raster.geotransform[5]],
    connectivity: options.connectivity,
    filterByArea: options.filterByArea,
    minArea: options.minArea,
    maxArea: options.maxArea,
  });
}

// NOTE: Fully implement traceVectorFeatures and traceBoundaryLoops following 
// the logic in `/Docs/Samples/SuitabilityModeling/src/lib/utils/vector-generator.ts`.
```

---

## 3. UI Logic and Integration: `/src/lib/geolibre/right-panel.ts`

We will implement the right panel UI and state handling strictly within the specified code scope:
```typescript
    else if(method === "Suitability Modeling"){
        
    }
```

### Key UI Guidelines
* **Developer Override Variable:** Declare `const developer = true;` (or `false`) at the top of `right-panel.ts`. If `developer` is false, hide or disable the raster and vector download buttons.
* **Forms & Dropdowns:** Utilize the native DOM methods already standard in `/src/lib/geolibre/right-panel.ts` (e.g. `drawDropdownOptions` to create selections, standard styling rules matching the rest of the file).
* **COG API:** **Do NOT** port the COG API checkbox, configuration form, parameters, or api conversion function (as per Porting Restriction #1).
* **Map Loading:** Use the plugin API `app.addCogLayer`, `app.addGeoJsonLayer` (and map layers logic) to load the generated suitability results onto the map.

### Steps to Implement UI Form
1. Create form container, select/range inputs, and checkboxes for:
   * **Source selection:** Upload Raster File vs Generate MCE Raster.
   * **MCE Parameters:** Slider for number of rasters, file inputs + weight inputs per raster row, and AHP weight generator matrix.
   * **Suitability Parameters:** Method dropdown (`<`, `<=`, `=`, `>`, `>=`, `!=`, `within`), Comparison value inputs, Normalize toggle, Connectivity option (8-way vs 4-way), Area filter toggles with min/max area number fields.
2. Hook up event listeners to toggle visibility of sub-sections (e.g., show/hide MCE row inputs, show/hide lower/upper intervals when method is `within`, show/hide area range limits when area filtering is checked).
3. Bind the **Calculate Suitability** button click to trigger `buildMceRaster`, `buildSuitabilityRaster`, and `buildSuitabilityVectorFromRasterBlob` in `suitability.ts`.
4. Register output layers using `app.addCogLayer` (for the computed suitability raster) and `app.addGeoJsonLayer` (or native layer registration fallback) for the computed vectors.

---

## 4. Verification Plan

Verify the ported suitability modeling workflow behaves correctly:

### Automated Tests
Run build commands to ensure TypeScript compiles clean:
```bash
npm run build
```

### Manual Verification
1. Open the plugin workbench in the GeoLibre app.
2. Select **Suitability Modeling** from the processing function dropdown.
3. Test **Upload Raster File** mode: upload a sample `.tif` (e.g. `dem.tif` or any geotiff), configure comparison parameters, and click Calculate. Verify:
   - The map displays the calculated suitability layer correctly.
   - Vector polygons highlight suitable regions on the map.
4. Test **Generate MCE Raster** mode: add 2 rasters, assign weights, calculate, and verify the resulting combined suitability map layer is loaded.
5. Set `developer = false` and ensure download buttons disappear or get disabled. Set `developer = true` and verify download functionality triggers a file download in the browser.
