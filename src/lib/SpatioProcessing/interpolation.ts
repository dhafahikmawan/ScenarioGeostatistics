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
