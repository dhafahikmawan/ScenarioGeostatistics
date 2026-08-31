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

function normalizeCrsName(name: string): string | null {
  const trimmed = name.trim();
  const compact = trimmed.replace(/^urn:ogc:def:crs:/i, "");

  const epsgMatch = compact.match(/EPSG[:_]{0,2}(\d+)/i);
  if (epsgMatch) return `EPSG:${epsgMatch[1]}`;

  if (/CRS84|4326/i.test(compact)) return "EPSG:4326";
  return trimmed;
}

export function extractCrsFromGeoJson(geojson: any): string | null {
  if (!geojson) return null;

  const crs = geojson.crs;
  if (crs) {
    if (crs.type === "name" && crs.properties?.name) {
      const normalized = normalizeCrsName(crs.properties.name);
      if (normalized) return normalized;
      return crs.properties.name;
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
  return coords.map((coord: any) => reprojectCoordinates(coord, sourceCrs));
}

function reprojectGeometry(geometry: any, sourceCrs: string): any {
  if (!geometry) return geometry;
  if (geometry.type === "GeometryCollection" && Array.isArray(geometry.geometries)) {
    return {
      ...geometry,
      geometries: geometry.geometries.map((item: any) => reprojectGeometry(item, sourceCrs)),
    };
  }

  if (!geometry.coordinates) return geometry;
  return {
    ...geometry,
    coordinates: reprojectCoordinates(geometry.coordinates, sourceCrs),
  };
}

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
      geometry: feature.geometry ? reprojectGeometry(feature.geometry, detectedCrs) : feature.geometry,
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
