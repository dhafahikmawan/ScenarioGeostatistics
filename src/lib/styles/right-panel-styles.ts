export type RightPanelStyle = Partial<Record<keyof CSSStyleDeclaration, string>>;

export const RIGHT_PANEL_STYLES: Record<string, RightPanelStyle> = {
  "geolibre-plugin-right-panel": {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    boxSizing: "border-box",
    padding: "16px",
    backgroundColor: "#ffffff",
    color: "#111827",
    border: "1px solid #d1d5db",
    boxShadow: "0 2px 8px rgba(17, 24, 39, 0.12)",
    fontFamily: "system-ui, sans-serif",
    fontSize: "13px",
    lineHeight: "1.5",
  },
  "right-panel-heading": { margin: "0", fontSize: "16px", fontWeight: "700" },
  "right-panel-description": { margin: "0", color: "#4b5563" },
  "right-panel-text": { color: "#374151" },
  "right-panel-cell": { color: "#4b5563", fontSize: "11px" },
  "geoprocessing-method-select": { width: "100%" },
  "geoprocessing-method-option": { backgroundColor: "#ffffff", color: "#000000" },
  "geoprocessing-method-form-container": { width: "100%" },
  "right-panel-form": { display: "flex", flexDirection: "column", gap: "12px", width: "100%" },
  "right-panel-label": { display: "flex", flexDirection: "column", gap: "5px", color: "#374151", fontSize: "12px", fontWeight: "600" },
  "right-panel-control": { boxSizing: "border-box", width: "100%", minHeight: "36px", padding: "7px 9px", border: "1px solid #b8c1cc", borderRadius: "4px", color: "#111827", backgroundColor: "#ffffff", font: "inherit" },
  "right-panel-file": { minHeight: "36px", padding: "6px" },
  "right-panel-range": { minHeight: "18px", padding: "0", border: "0", accentColor: "#2563eb", cursor: "pointer" },
  "right-panel-checkbox": { width: "16px", height: "16px", minHeight: "16px", padding: "0", accentColor: "#2563eb" },
  "right-panel-button": { minHeight: "36px", padding: "7px 12px", border: "1px solid #1d4ed8", borderRadius: "4px", color: "#ffffff", backgroundColor: "#2563eb", cursor: "pointer", font: "inherit", fontWeight: "600" },
  "right-panel-fieldset": { display: "flex", flexDirection: "column", gap: "10px", minWidth: "0", margin: "0", padding: "10px", border: "1px solid #d1d5db", borderRadius: "4px" },
  "right-panel-legend": { padding: "0 5px", color: "#374151", fontSize: "11px", fontWeight: "700", textTransform: "uppercase" },
  "right-panel-section": { display: "flex", flexDirection: "column", gap: "8px" },
  "right-panel-row": { display: "grid", gap: "8px", alignItems: "end" },
  "right-panel-status": { minHeight: "1.2em", color: "#4b5563", fontSize: "11px", overflowWrap: "anywhere" },
  "right-panel-status-error": { minHeight: "1.2em", color: "#b91c1c", fontSize: "11px", overflowWrap: "anywhere" },
  "right-panel-downloads": { display: "flex", flexWrap: "wrap", gap: "8px" },
  "right-panel-option": { backgroundColor: "#ffffff", color: "#000000" },
  "right-panel-ahp-input": { width: "48px", minHeight: "28px", padding: "4px", textAlign: "center", fontSize: "11px" },
};

function toCssProperty(property: string): string {
  return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export function applyRightPanelStyle(element: HTMLElement, styleName: string): void {
  const style = RIGHT_PANEL_STYLES[styleName];
  if (!style) throw new Error(`Unknown right-panel style: ${styleName}`);

  Object.entries(style).forEach(([property, value]) => {
    if (value !== undefined) element.style.setProperty(toCssProperty(property), value);
  });
  element.classList.add(styleName);
}