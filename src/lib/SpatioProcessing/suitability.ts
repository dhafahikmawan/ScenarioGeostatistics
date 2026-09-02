import { area, multiPolygon, polygon } from '@turf/turf';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import {
  alignRasterToGrid,
  readRasterFromFile,
  writeFloat32TiledGeoTIFF,
} from '../utils/geotiff-processor';
import { ensureWgs84GeoJson } from '../utils/crs-converter';

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
  boundingRasterIndex?: number;
  clipNoDataTreatment?: '0' | 'NaN';
}

export interface MceRasterInput {
  file: File;
  weight: number;
  noData?: number;
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

function normalizeValues(values: Float32Array): Float32Array {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (Number.isFinite(value)) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  const result = new Float32Array(values.length);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) return result;
  for (let index = 0; index < values.length; index += 1) {
    result[index] = Number.isFinite(values[index]) ? (values[index] - min) / (max - min) : NaN;
  }
  return result;
}

function matchesComparison(value: number, options: SuitabilityOptions): boolean {
  const comparisonValue = Number(options.comparisonValue);
  if (!Number.isFinite(comparisonValue)) throw new Error('Comparison value must be finite.');
  switch (options.comparisonMethod) {
    case '<': return value < comparisonValue;
    case '<=': return value <= comparisonValue;
    case '=': return value === comparisonValue;
    case '>': return value > comparisonValue;
    case '>=': return value >= comparisonValue;
    case '!=': return value !== comparisonValue;
    case 'within': {
      const lower = Number(options.lowerInterval ?? 0);
      const upper = Number(options.upperInterval ?? 0);
      if (!Number.isFinite(lower) || !Number.isFinite(upper)) throw new Error('Interval values must be finite.');
      return value >= comparisonValue - lower && value <= comparisonValue + upper;
    }
    default: return false;
  }
}

export async function buildMceRaster(
  inputs: MceRasterInput[],
  options: MceRasterProcessingOptions = {},
): Promise<Blob | null> {
  if (inputs.length === 0) return null;

  const bandMode = options.bandMode ?? 'first';
  const averageTiming = options.mode ?? 'before';
  const clipNoDataTreatment = options.clipNoDataTreatment ?? 'NaN';
  const rasters = await Promise.all(inputs.map(({ file }) => readRasterFromFile(file)));
  const base = rasters[options.boundingRasterIndex ?? 0] ?? rasters[0];
  const layers: Float32Array[] = [];
  let outputBandCount = bandMode === 'all' ? base.bandCount : 1;

  for (let layerIndex = 0; layerIndex < rasters.length; layerIndex += 1) {
    const raster = rasters[layerIndex];
    const input = inputs[layerIndex];
    if (raster.crsCode !== base.crsCode) {
      throw new Error(`CRS mismatch between raster #${layerIndex + 1} and bounding raster.`);
    }

    if (bandMode === 'all') {
      const values = new Float32Array(base.width * base.height * base.bandCount);
      for (let bandIndex = 0; bandIndex < base.bandCount; bandIndex += 1) {
        const aligned = alignRasterToGrid(raster, base, {
          bandIndex,
          customNoData: input?.noData,
          clipNoDataTreatment,
        });
        for (let pixelIndex = 0; pixelIndex < aligned.length; pixelIndex += 1) {
          values[pixelIndex * base.bandCount + bandIndex] = aligned[pixelIndex];
        }
      }
      layers.push(normalizeValues(values));
    } else if (bandMode === 'first') {
      const values = alignRasterToGrid(raster, base, {
        bandIndex: 0,
        customNoData: input?.noData,
        clipNoDataTreatment,
      });
      layers.push(normalizeValues(values));
    } else if (averageTiming === 'before') {
      const values = new Float32Array(base.width * base.height);
      for (let pixelIndex = 0; pixelIndex < base.width * base.height; pixelIndex += 1) {
        let sum = 0;
        let count = 0;
        for (let band = 0; band < raster.bandCount; band += 1) {
          const aligned = alignRasterToGrid(raster, base, {
            bandIndex: band,
            customNoData: input?.noData,
            clipNoDataTreatment,
          });
          const value = aligned[pixelIndex];
          if (Number.isFinite(value)) {
            sum += value;
            count += 1;
          }
        }
        values[pixelIndex] = count ? sum / count : NaN;
      }
      layers.push(normalizeValues(values));
    } else {
      const normalizedBands = Array.from({ length: raster.bandCount }, (_, band) => {
        const aligned = alignRasterToGrid(raster, base, {
          bandIndex: band,
          customNoData: input?.noData,
          clipNoDataTreatment,
        });
        return normalizeValues(aligned);
      });
      const values = new Float32Array(base.width * base.height);
      for (let pixelIndex = 0; pixelIndex < values.length; pixelIndex += 1) {
        const valid = normalizedBands.map((band) => band[pixelIndex]).filter(Number.isFinite);
        values[pixelIndex] = valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : NaN;
      }
      layers.push(values);
    }
  }

  const output = new Float32Array(layers[0].length);
  for (let index = 0; index < output.length; index += 1) {
    const validLayers = layers.filter((layer) => Number.isFinite(layer[index]));
    if (validLayers.length === 0) {
      output[index] = NaN;
      continue;
    }

    let total = 0;
    for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
      const weight = Number(inputs[layerIndex].weight);
      if (!Number.isFinite(weight)) throw new Error('MCE weights must be finite.');
      const value = layers[layerIndex][index];
      total += (Number.isFinite(value) ? value : 0) * weight;
    }
    output[index] = total;
  }

  const buffer = writeFloat32TiledGeoTIFF(base.width, base.height, output, base.geotransform, base.crsCode, outputBandCount);
  return new Blob([buffer], { type: 'image/tiff' });
}

export async function buildSuitabilityRaster(
  inputRaster: File | Blob,
  options: SuitabilityOptions,
): Promise<Blob | null> {
  const file = inputRaster instanceof File ? inputRaster : new File([inputRaster], 'suitability-input.tif');
  const raster = await readRasterFromFile(file);
  const filtered = new Float32Array(raster.data.length);
  for (let index = 0; index < raster.data.length; index += 1) {
    const value = raster.data[index];
    filtered[index] = value !== raster.noDataValue && Number.isFinite(value) && matchesComparison(value, options) ? value : NaN;
  }
  const output = options.normalizeResult ? normalizeValues(filtered) : filtered;
  const buffer = writeFloat32TiledGeoTIFF(raster.width, raster.height, output, raster.geotransform, raster.crsCode, raster.bandCount);
  return new Blob([buffer], { type: 'image/tiff' });
}

type Point = [number, number];
type EdgeMap = Map<string, Map<string, number>>;

function indexFor(width: number, row: number, column: number): number { return row * width + column; }
function pointKey(point: Point): string { return `${point[0]},${point[1]}`; }
function parsePointKey(key: string): Point { return key.split(',').map(Number) as Point; }
function addEdge(edges: EdgeMap, from: Point, to: Point): void {
  const fromKey = pointKey(from);
  const toKey = pointKey(to);
  const targets = edges.get(fromKey) ?? new Map<string, number>();
  targets.set(toKey, (targets.get(toKey) ?? 0) + 1);
  edges.set(fromKey, targets);
}

function traceBoundaryLoops(edges: EdgeMap): Point[][] {
  const remaining = new Map(Array.from(edges, ([key, targets]) => [key, new Map(targets)]));
  const loops: Point[][] = [];
  while (remaining.size) {
    const startKey = remaining.keys().next().value as string;
    let currentKey = startKey;
    const loop: Point[] = [parsePointKey(startKey)];
    while (true) {
      const targets = remaining.get(currentKey);
      if (!targets?.size) break;
      const nextKey = targets.keys().next().value as string;
      const count = targets.get(nextKey)!;
      count === 1 ? targets.delete(nextKey) : targets.set(nextKey, count - 1);
      if (!targets.size) remaining.delete(currentKey);
      loop.push(parsePointKey(nextKey));
      if (nextKey === startKey) break;
      currentKey = nextKey;
    }
    if (loop.length > 3 && pointKey(loop[0]) === pointKey(loop[loop.length - 1])) loops.push(loop);
  }
  return loops;
}

function signedArea(ring: Point[]): number {
  let result = 0;
  for (let index = 0; index < ring.length - 1; index += 1) result += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  return result / 2;
}

function componentPolygon(component: Array<[number, number]>, width: number, height: number, origin: [number, number], resolution: [number, number]): Polygon {
  const members = new Set(component.map(([row, column]) => indexFor(width, row, column)));
  const edges: EdgeMap = new Map();
  for (const [row, column] of component) {
    const xMin = origin[0] + column * resolution[0];
    const xMax = origin[0] + (column + 1) * resolution[0];
    const yMax = origin[1] + row * resolution[1];
    const yMin = origin[1] + (row + 1) * resolution[1];
    const sides: Array<{ neighbor: [number, number]; from: Point; to: Point }> = [
      { neighbor: [row - 1, column], from: [xMin, yMax], to: [xMax, yMax] },
      { neighbor: [row, column + 1], from: [xMax, yMax], to: [xMax, yMin] },
      { neighbor: [row + 1, column], from: [xMax, yMin], to: [xMin, yMin] },
      { neighbor: [row, column - 1], from: [xMin, yMin], to: [xMin, yMax] },
    ];
    for (const side of sides) {
      const [neighborRow, neighborColumn] = side.neighbor;
      if (neighborRow < 0 || neighborRow >= height || neighborColumn < 0 || neighborColumn >= width || !members.has(indexFor(width, neighborRow, neighborColumn))) addEdge(edges, side.from, side.to);
    }
  }
  const rings = traceBoundaryLoops(edges).sort((first, second) => Math.abs(signedArea(second)) - Math.abs(signedArea(first)));
  if (!rings.length) return polygon([[]]).geometry as Polygon;
  const outer = rings[0].slice();
  if (signedArea(outer) < 0) outer.reverse();
  const holes = rings.slice(1).map((ring) => signedArea(ring) > 0 ? ring.reverse() : ring);
  return polygon([outer, ...holes]).geometry as Polygon;
}

function componentGroups(component: Array<[number, number]>, width: number, height: number): Array<Array<[number, number]>> {
  const members = new Set(component.map(([row, column]) => indexFor(width, row, column)));
  const visited = new Set<number>();
  const groups: Array<Array<[number, number]>> = [];
  for (const pixel of component) {
    const start = indexFor(width, pixel[0], pixel[1]);
    if (visited.has(start)) continue;
    const queue = [pixel];
    const group: Array<[number, number]> = [];
    visited.add(start);
    while (queue.length) {
      const [row, column] = queue.shift()!;
      group.push([row, column]);
      for (const [deltaRow, deltaColumn] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nextRow = row + deltaRow;
        const nextColumn = column + deltaColumn;
        const next = indexFor(width, nextRow, nextColumn);
        if (nextRow >= 0 && nextRow < height && nextColumn >= 0 && nextColumn < width && members.has(next) && !visited.has(next)) {
          visited.add(next);
          queue.push([nextRow, nextColumn]);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

export async function buildSuitabilityVectorFromRasterBlob(
  rasterBlob: Blob,
  options: BuildSuitabilityVectorOptions = {},
): Promise<FeatureCollection<Polygon | MultiPolygon, SuitabilityVectorProperties>> {
  const raster = await readRasterFromFile(new File([rasterBlob], 'suitability-output.tif'));
  const values = new Float32Array(raster.width * raster.height);
  for (let index = 0; index < values.length; index += 1) values[index] = raster.data[index * raster.bandCount];
  const connectivity = options.connectivity ?? 4;
  const visited = new Uint8Array(values.length);
  const features: Array<Feature<Polygon | MultiPolygon, SuitabilityVectorProperties>> = [];
  const offsets = connectivity === 8 ? [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]] : [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (let row = 0; row < raster.height; row += 1) {
    for (let column = 0; column < raster.width; column += 1) {
      const start = indexFor(raster.width, row, column);
      if (visited[start] || !Number.isFinite(values[start])) continue;
      const queue: Array<[number, number]> = [[row, column]];
      const component: Array<[number, number]> = [];
      visited[start] = 1;
      while (queue.length) {
        const [currentRow, currentColumn] = queue.shift()!;
        component.push([currentRow, currentColumn]);
        for (const [deltaRow, deltaColumn] of offsets) {
          const nextRow = currentRow + deltaRow;
          const nextColumn = currentColumn + deltaColumn;
          if (nextRow < 0 || nextRow >= raster.height || nextColumn < 0 || nextColumn >= raster.width) continue;
          const next = indexFor(raster.width, nextRow, nextColumn);
          if (!visited[next] && Number.isFinite(values[next])) { visited[next] = 1; queue.push([nextRow, nextColumn]); }
        }
      }
      const groups = componentGroups(component, raster.width, raster.height);
      const geometries = groups.map((group) => componentPolygon(group, raster.width, raster.height, [raster.geotransform[0], raster.geotransform[3]], [raster.geotransform[1], raster.geotransform[5]]));
      const geometry = geometries.length === 1 ? geometries[0] : multiPolygon(geometries.map((item) => item.coordinates)).geometry as MultiPolygon;
      const componentValues = component.map(([itemRow, itemColumn]) => values[indexFor(raster.width, itemRow, itemColumn)]);
      const properties = { min: Math.min(...componentValues), max: Math.max(...componentValues), average: componentValues.reduce((sum, value) => sum + value, 0) / componentValues.length, area: area({ type: 'Feature', geometry, properties: {} }), cells: component.length };
      if (!options.filterByArea || ((options.minArea === undefined || properties.area >= options.minArea) && (options.maxArea === undefined || properties.area <= options.maxArea))) features.push({ type: 'Feature', geometry, properties });
    }
  }
  const rawCollection: FeatureCollection<Polygon | MultiPolygon, SuitabilityVectorProperties> = { type: 'FeatureCollection', features };
  const sourceCrs = raster.crsCode ? `EPSG:${raster.crsCode}` : undefined;
  return ensureWgs84GeoJson(rawCollection, sourceCrs);
}