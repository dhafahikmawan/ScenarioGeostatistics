import ARIMA from 'arima';
import {
  readRasterFromFile,
  writeFloat32TiledGeoTIFF,
} from '../utils/geotiff-processor';

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
  public static forecast(series: number[], params: ArimaParams, steps: number): ForecastResult {
    if (series.length < params.p + params.d + 2 || series.length < params.d+10) {
      return {
        status: 'Invalid ARIMA parameters, number of data must be >= max(p+d+2,d+10). Falling back to linear extrapolation',
        data: this.linearExtrapolation(series, steps).data,
      };
    }

    let arima: { predict: (count: number) => [number[]]; destroy?: () => void } | null = null;
    try {
      const model = new ARIMA({ ...params, auto: false }).train(series);
      arima = model as unknown as { predict: (count: number) => [number[]]; destroy?: () => void };
      const [predictions] = model.predict(steps);
      return { status: 'Success', data: predictions };
    } catch (error) {
      console.error('ARIMA fit failed, falling back to linear extrapolation', error);
      return {
        status: `ARIMA fit failed, falling back to linear extrapolation: ${String(error)}`,
        data: this.linearExtrapolation(series, steps).data,
      };
    } finally {
      arima?.destroy?.();
    }
  }

  public static linearExtrapolation(series: number[], steps: number): ForecastResult {
    const lastValue = series[series.length - 1] ?? 0;
    const firstValue = series[0] ?? 0;
    const slope = series.length > 1 ? (lastValue - firstValue) / (series.length - 1) : 0;

    return {
      status: 'Success',
      data: Array.from({ length: steps }, (_, index) => lastValue + slope * (index + 1)),
    };
  }
}

export function runTemporalForecasting(
  inputGeoJson: any,
  locationField: string,
  timestampField: string,
  predictionField: string,
  steps: number,
  method: string,
  arimaParams: ArimaParams,
): { geojson: any; warning: string } {
  const groups = new Map<string, Array<{ geometry: unknown; properties?: Record<string, unknown> }>>();
  for (const feature of inputGeoJson.features ?? []) {
    const location = feature.properties?.[locationField];
    if (location !== undefined && location !== null) {
      const key = String(location);
      const group = groups.get(key) ?? [];
      group.push(feature);
      groups.set(key, group);
    }
  }

  const outputFeatures: unknown[] = [];
  let warning = '';
  for (const [location, features] of groups) {
    const sortedFeatures = [...features].sort((left, right) => {
      return new Date(String(left.properties?.[timestampField])).getTime() -
        new Date(String(right.properties?.[timestampField])).getTime();
    });
    const values = sortedFeatures.map((feature) => {
      const value = Number(feature.properties?.[predictionField]);
      return Number.isFinite(value) ? value : 0;
    });
    const lastFeature = sortedFeatures[sortedFeatures.length - 1];
    if (!lastFeature) continue;

    const forecast = method === 'Linear Extrapolation'
      ? ArimaSolver.linearExtrapolation(values, steps)
      : ArimaSolver.forecast(values, arimaParams, steps);
    if (forecast.status !== 'Success') warning = forecast.status;

    const times = sortedFeatures.map((feature) => new Date(String(feature.properties?.[timestampField])).getTime());
    const interval = times.length > 1
      ? Math.round((times[times.length - 1] - times[0]) / (times.length - 1))
      : 24 * 60 * 60 * 1000;
    const lastTime = times[times.length - 1];
    for (let index = 0; index < steps; index += 1) {
      outputFeatures.push({
        type: 'Feature',
        geometry: lastFeature.geometry,
        properties: {
          ...lastFeature.properties,
          [locationField]: location,
          [timestampField]: new Date(lastTime + interval * (index + 1)).toISOString(),
          [predictionField]: forecast.data[index],
        },
      });
    }
  }

  return {
    geojson: { type: 'FeatureCollection', features: outputFeatures },
    warning,
  };
}

export interface RasterInputFile {
  file: File;
  band: number;
  datetime: string;
}

export async function runRasterTemporalForecasting(
  inputs: RasterInputFile[],
  steps: number,
  method: string,
  arimaParams: ArimaParams,
): Promise<Array<{ name: string; blob: Blob; date: string; warning: string }>> {
  if (inputs.length === 0) throw new Error('At least one raster is required.');

  const parsedRasters = await Promise.all([...inputs]
    .sort((left, right) => new Date(left.datetime).getTime() - new Date(right.datetime).getTime())
    .map(async (input) => ({
      ...(await readRasterFromFile(input.file)),
      bandIndex: input.band,
      time: new Date(input.datetime).getTime(),
    })));
  const base = parsedRasters[0];
  if (base.bandIndex < 0 || base.bandIndex >= base.bandCount) {
    throw new Error(`Invalid band ${base.bandIndex + 1} for raster #1.`);
  }
  for (let index = 1; index < parsedRasters.length; index += 1) {
    const raster = parsedRasters[index];
    if (raster.width !== base.width || raster.height !== base.height) {
      throw new Error(`Dimension mismatch: Raster #${index + 1} is ${raster.width}x${raster.height}, expected ${base.width}x${base.height}`);
    }
    if (raster.bandIndex < 0 || raster.bandIndex >= raster.bandCount) {
      throw new Error(`Invalid band ${raster.bandIndex + 1} for raster #${index + 1}.`);
    }
  }

  const pixelCount = base.width * base.height;
  const predictions = Array.from({ length: steps }, () => new Float32Array(pixelCount));
  let warning = '';
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const series = parsedRasters.map((raster) => raster.data[pixelIndex * raster.bandCount + raster.bandIndex] ?? 0);
    const forecast = method === 'Linear Extrapolation'
      ? ArimaSolver.linearExtrapolation(series, steps)
      : ArimaSolver.forecast(series, arimaParams, steps);
    if (forecast.status !== 'Success') warning = forecast.status;
    forecast.data.forEach((value, step) => { predictions[step][pixelIndex] = value; });
  }

  const lastRaster = parsedRasters[parsedRasters.length - 1];
  const interval = parsedRasters.length > 1
    ? Math.round((lastRaster.time - base.time) / (parsedRasters.length - 1))
    : 24 * 60 * 60 * 1000;
  const lastTime = lastRaster.time;
  return predictions.map((prediction, step) => {
    const date = new Date(lastTime + interval * (step + 1)).toISOString();
    const buffer = writeFloat32TiledGeoTIFF(base.width, base.height, prediction, base.geotransform, base.crsCode, 1);
    return {
      name: `Prediction-${date.replace(/:/g, '-')}.tif`,
      blob: new Blob([buffer], { type: 'image/tiff' }),
      date,
      warning,
    };
  });
}