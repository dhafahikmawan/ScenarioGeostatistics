import { describe, it, expect, vi } from "vitest";
import type {
  GeoLibreAppAPI,
  GeoLibreControl,
  GeoLibreRightPanelRegistration,
} from "../src/lib/geolibre/host-api";
import {
  DECIMAL_PLACES_ROUNDING,
  RIGHT_PANEL_ID,
  registerTemplateRightPanel,
  roundToDecimals,
  setMethod,
} from "../src/lib/geolibre/right-panel";
import {
  RIGHT_PANEL_STYLES,
  applyRightPanelStyle,
} from "../src/lib/styles/spazio-right-panel-styles";
import { alignRasterToGrid } from "../src/lib/utils/geotiff-processor";

function createApp(withRightPanel = true) {
  let registered: GeoLibreRightPanelRegistration | null = null;
  const unregister = vi.fn();
  const app: GeoLibreAppAPI<GeoLibreControl> = {
    addMapControl: () => true,
    removeMapControl: () => undefined,
  };

  if (withRightPanel) {
    app.registerRightPanel = (panel) => {
      registered = panel;
      return unregister;
    };
    app.openRightPanel = vi.fn(() => true);
    app.closeRightPanel = vi.fn();
  }

  return {
    app,
    unregister,
    getRegistered: () => registered,
  };
}

describe("registerTemplateRightPanel (Spazio Styles)", () => {
  it("exposes and applies required Spazio registry styles", () => {
    expect(RIGHT_PANEL_STYLES.input.border).toBe("1px solid #b8c1cc");
    expect(RIGHT_PANEL_STYLES.selectOption.backgroundColor).toBe("#ffffff");
    expect(RIGHT_PANEL_STYLES.selectOption.color).toBe("#000000");
    expect(RIGHT_PANEL_STYLES.operationButton.border).toBe("1px solid #1d4ed8");

    const element = document.createElement("div");
    applyRightPanelStyle(element, "input");
    expect(element.classList).toContain("spazio-text-field");
    expect(element.style.border).toContain("1px solid");
  });

  it("applies spazio-* classes across all processing forms", () => {
    const { app, getRegistered } = createApp();
    registerTemplateRightPanel(app);
    const panel = getRegistered();
    const container = document.createElement("div");
    panel?.render(container);

    expect(container.querySelector(".spazio-container")).not.toBeNull();
    expect(container.querySelector(".spazio-title")).not.toBeNull();
    expect(container.querySelector(".spazio-description")).not.toBeNull();

    // Spatial Interpolation
    setMethod("Spatial Interpolation");
    expect(container.querySelector("select")?.classList).toContain("spazio-dropdown");
    expect(container.querySelector('input[type="file"]')?.classList).toContain("spazio-file-field");
    expect(container.querySelector('button[type="submit"]')?.classList).toContain("spazio-submit-button");

    const options = Array.from(container.querySelectorAll("option"));
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((opt) => opt.classList.contains("spazio-dropdown-options"))).toBe(true);

    // Suitability Modeling
    setMethod("Suitability Modeling");
    expect(container.querySelector('input[type="range"]')?.classList).toContain("spazio-slider");
    expect(container.querySelector('input[type="checkbox"]')?.classList).toContain("spazio-checkbox");
    expect(container.querySelector(".spazio-ahp-table")).not.toBeNull();

    // Predicting Climate Change
    setMethod("Predicting Climate Change");
    expect(container.querySelector("output")?.classList).toContain("spazio-status");
  });

  it("registers, renders, and cleans up the right panel", () => {
    const { app, getRegistered } = createApp();
    const dispose = registerTemplateRightPanel(app);
    expect(dispose).toBeTypeOf("function");

    const panel = getRegistered();
    expect(panel?.id).toBe(RIGHT_PANEL_ID);
    expect(app.openRightPanel).toHaveBeenCalledWith(RIGHT_PANEL_ID);

    const container = document.createElement("div");
    const cleanup = panel?.render(container);
    expect(container.querySelector("h2")?.textContent).toBe("Suitability Modeling & Geostatistics Workbench");

    expect(cleanup).toBeTypeOf("function");
    (cleanup as () => void)();
    expect(container.querySelector("h2")).toBeNull();
  });

  it("closes and unregisters the panel when disposed", () => {
    const { app, unregister } = createApp();
    const dispose = registerTemplateRightPanel(app);
    dispose?.();
    expect(app.closeRightPanel).toHaveBeenCalledWith(RIGHT_PANEL_ID);
    expect(unregister).toHaveBeenCalledOnce();
  });

  it("renders NoData inputs and bounding box selectors for suitability and forecasting", () => {
    const { app, getRegistered } = createApp();
    registerTemplateRightPanel(app);
    const panel = getRegistered();
    const container = document.createElement("div");
    panel?.render(container);

    setMethod("Suitability Modeling");
    const suitabilityNoData = container.querySelectorAll('input[aria-label^="NoData value for raster"]');
    expect(suitabilityNoData.length).toBeGreaterThan(0);
    const suitabilityBBox = Array.from(container.querySelectorAll("label")).find((label) => label.textContent?.includes("Bounding Box Raster"));
    expect(suitabilityBBox).not.toBeNull();
    const suitabilitySelect = suitabilityBBox?.querySelector("select") as HTMLSelectElement | null;
    expect(suitabilitySelect?.value).toBe("0");

    setMethod("Predicting Climate Change");
    const forecastingNoData = container.querySelectorAll('input[aria-label^="NoData value for raster #"]');
    expect(forecastingNoData.length).toBeGreaterThan(0);
    const forecastingBBox = Array.from(container.querySelectorAll("label")).find((label) => label.textContent?.includes("Bounding Box Raster"));
    expect(forecastingBBox).not.toBeNull();
    const forecastingSelect = forecastingBBox?.querySelector("select") as HTMLSelectElement | null;
    expect(forecastingSelect?.value).toBe("0");
  });

  it("renders the AHP matrix with enabled and disabled cells using table markup", () => {
    const { app, getRegistered } = createApp();
    registerTemplateRightPanel(app);
    const panel = getRegistered();
    const container = document.createElement("div");
    panel?.render(container);

    setMethod("Suitability Modeling");
    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    expect(table?.classList).toContain("spazio-ahp-table");

    const disabled = Array.from(table?.querySelectorAll("input") ?? []).filter((input) => (input as HTMLInputElement).disabled);
    expect(disabled.length).toBeGreaterThan(0);
    expect(disabled.every((input) => input.classList.contains("spazio-ahp-input-disabled"))).toBe(true);

    const enabled = Array.from(table?.querySelectorAll("input[type='number']") ?? []);
    expect(enabled.length).toBeGreaterThan(0);
    expect(enabled.every((input) => input.classList.contains("spazio-ahp-input"))).toBe(true);
  });

  it("renders the bounding box clipping NoData selectors with the expected default", () => {
    const { app, getRegistered } = createApp();
    registerTemplateRightPanel(app);
    const panel = getRegistered();
    const container = document.createElement("div");
    panel?.render(container);

    setMethod("Suitability Modeling");
    const suitabilityClip = Array.from(container.querySelectorAll("label")).find((label) => label.textContent?.includes("Bounding Box Clipping NoData"));
    expect(suitabilityClip).not.toBeNull();
    expect((suitabilityClip?.querySelector("select") as HTMLSelectElement | null)?.value).toBe("NaN");

    setMethod("Predicting Climate Change");
    const forecastingClip = Array.from(container.querySelectorAll("label")).find((label) => label.textContent?.includes("Bounding Box Clipping NoData"));
    expect(forecastingClip).not.toBeNull();
    expect((forecastingClip?.querySelector("select") as HTMLSelectElement | null)?.value).toBe("NaN");
  });

  it("treats out-of-bounds clipping as configured and preserves source NoData as NaN", () => {
    const source = {
      width: 2,
      height: 2,
      data: new Float32Array([1, 2, 3, 4]),
      geotransform: [0, 1, 0, 2, 0, -1],
      crsCode: 4326,
      noDataValue: -9999,
      bandCount: 1,
    };
    const target = {
      width: 3,
      height: 3,
      data: new Float32Array(9),
      geotransform: [-1, 1, 0, 3, 0, -1],
      crsCode: 4326,
      noDataValue: -9999,
      bandCount: 1,
    };

    const withNaN = alignRasterToGrid(source, target, { customNoData: 2, clipNoDataTreatment: "NaN" });
    expect(Number.isNaN(withNaN[0])).toBe(true);
    expect(withNaN[4]).toBe(1);
    expect(Number.isNaN(withNaN[5])).toBe(true);

    const withZero = alignRasterToGrid(source, target, { customNoData: 2, clipNoDataTreatment: "0" });
    expect(withZero[0]).toBe(0);
    expect(withZero[4]).toBe(1);
    expect(Number.isNaN(withZero[5])).toBe(true);
  });

  it("exports the decimal rounding contract and rounds to the configured precision", () => {
    expect(DECIMAL_PLACES_ROUNDING).toBe(5);
    expect(roundToDecimals(0.333333333)).toBeCloseTo(0.33333, 5);
    expect(roundToDecimals(1.23456789, 3)).toBeCloseTo(1.235, 5);
  });

  it("allows arbitrary decimal precision for MCE and AHP inputs", () => {
    const { app, getRegistered } = createApp();
    registerTemplateRightPanel(app);
    const panel = getRegistered();
    const container = document.createElement("div");
    panel?.render(container);

    setMethod("Suitability Modeling");
    const mceWeightInputs = Array.from(container.querySelectorAll('input[type="number"]')).filter(
      (input) => input.min === "0" && input.max === "1" && input.step === "any",
    );
    expect(mceWeightInputs.length).toBeGreaterThan(0);

    const table = container.querySelector("table");
    const ahpInputs = Array.from(table?.querySelectorAll('input[type="number"]') ?? []);
    expect(ahpInputs.length).toBeGreaterThan(0);
    expect(ahpInputs.every((input) => input.step === "any")).toBe(true);

    const upperInput = ahpInputs[0] as HTMLInputElement;
    const lowerInput = (table?.querySelectorAll("input[type='text']") ?? [])[1] as HTMLInputElement | undefined;
    if (upperInput && lowerInput) {
      upperInput.value = "3";
      upperInput.dispatchEvent(new Event("input"));
      expect(lowerInput.value).toBe("0.33333");
    }
  });

  it("returns null when the host has no right sidebar", () => {
    const { app } = createApp(false);
    expect(registerTemplateRightPanel(app)).toBeNull();
  });
});

