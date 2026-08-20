import { describe, it, expect, vi } from "vitest";
import type {
  GeoLibreAppAPI,
  GeoLibreControl,
  GeoLibreRightPanelRegistration,
} from "../src/lib/geolibre/host-api";
import {
  RIGHT_PANEL_ID,
  registerTemplateRightPanel,
  setMethod,
} from "../src/lib/geolibre/right-panel";
import {
  RIGHT_PANEL_STYLES,
  applyRightPanelStyle,
} from "../src/lib/styles/right-panel-styles";

/**
 * Minimal stub of the host API. Captures the right-panel registration so the
 * test can drive its `render` callback the way GeoLibre would.
 */
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

describe("registerTemplateRightPanel", () => {
  it("exposes and applies the required registry styles", () => {
    expect(RIGHT_PANEL_STYLES["right-panel-control"]?.border).toBe("1px solid #b8c1cc");
    expect(RIGHT_PANEL_STYLES["right-panel-option"]?.backgroundColor).toBe("#ffffff");
    expect(RIGHT_PANEL_STYLES["right-panel-option"]?.color).toBe("#000000");
    expect(RIGHT_PANEL_STYLES["right-panel-button"]?.border).toBe("1px solid #1d4ed8");

    const element = document.createElement("div");
    applyRightPanelStyle(element, "right-panel-control");
    expect(element.classList).toContain("right-panel-control");
    expect(element.style.border).toContain("1px solid");
    expect(element.style.border).toContain("184");
    expect(() => applyRightPanelStyle(element, "missing-style")).toThrow("Unknown right-panel style");
  });

  it("keeps native controls styled across every processing form", () => {
    const { app, getRegistered } = createApp();
    registerTemplateRightPanel(app);
    const panel = getRegistered();
    const container = document.createElement("div");
    panel?.render(container);

    setMethod("Spatial Interpolation");
    expect(container.querySelector("form.interpolation-form select")).toBeInstanceOf(HTMLSelectElement);
    expect(container.querySelector('input[type="file"]')).toBeInstanceOf(HTMLInputElement);
    expect(container.querySelector('button[type="submit"]')?.style.border).toContain("1px solid");

    const options = Array.from(container.querySelectorAll("option"));
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((option) => option.style.backgroundColor === "rgb(255, 255, 255)" || option.style.backgroundColor === "#ffffff")).toBe(true);
    expect(options.every((option) => option.style.color === "rgb(0, 0, 0)" || option.style.color === "#000000")).toBe(true);

    setMethod("Suitability Modeling");
    expect(container.querySelector('input[type="range"]')).toBeInstanceOf(HTMLInputElement);
    expect(container.querySelector('input[type="checkbox"]')).toBeInstanceOf(HTMLInputElement);
    expect(container.querySelector("fieldset")).toBeInstanceOf(HTMLFieldSetElement);

    setMethod("Predicting Climate Change");
    expect(container.querySelector('input[type="number"]')).toBeInstanceOf(HTMLInputElement);
    expect(container.querySelector('input[type="datetime-local"]')).toBeInstanceOf(HTMLInputElement);
    expect(container.querySelector("output")?.classList).toContain("right-panel-status");
  });

  it("registers and opens the panel, and renders into the container", () => {
    const { app, getRegistered } = createApp();

    const dispose = registerTemplateRightPanel(app);
    expect(dispose).toBeTypeOf("function");

    const panel = getRegistered();
    expect(panel?.id).toBe(RIGHT_PANEL_ID);
    expect(app.openRightPanel).toHaveBeenCalledWith(RIGHT_PANEL_ID);

    const container = document.createElement("div");
    const cleanup = panel?.render(container);
    expect(container.querySelector("h2")?.textContent).toBe("Plugin Workbench");

    // The returned cleanup removes the plugin's own DOM.
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

  it("returns null when the host has no right sidebar", () => {
    const { app } = createApp(false);
    expect(registerTemplateRightPanel(app)).toBeNull();
  });
});
