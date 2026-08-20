# Implementation Plan: Right Panel Styling

This plan implements the requirements in [`Docs/Fix/Styling.md`](../Fix/Styling.md). It is intentionally written for a junior developer or a low-cost AI agent: make one small change at a time, preserve the existing DOM behavior, and run the listed checks after each stage.

## 1. Confirm the Current Behavior

1. Open [`src/lib/geolibre/right-panel.ts`](../../src/lib/geolibre/right-panel.ts) and identify the four UI areas created by `loadOptionForm` and `registerTemplateRightPanel`:
   - the right-panel wrapper and processing-function selector;
   - the Spatial Interpolation form;
   - the Suitability Modeling form;
   - the Predicting Climate Change form.
2. Search this file for `style.`, `className`, and `classList`. Treat each result as a migration point. The current inline styles include hidden labels, the interpolation submit button, interpolation status colors, and dynamic AHP grid columns.
3. Read the right-panel-specific rules in [`src/lib/styles/plugin-control.css`](../../src/lib/styles/plugin-control.css). Port rules that affect elements created by `right-panel.ts`; do not remove rules used by the floating panel or the plugin control unless they are demonstrably unused.

**Behavior baseline:** the implementation must continue to create native `select`, `input`, `button`, `output`, `fieldset`, `label`, and `div` elements. Styling must not replace a dropdown with a custom menu or a slider with a text input.

## 2. Create the TypeScript Style Registry

Create [`src/lib/styles/right-panel-styles.ts`](../../src/lib/styles/right-panel-styles.ts).

### 2.1 Define the registry shape

Use a typed record of class names to inline-style objects, for example:

```ts
export type RightPanelStyle = Partial<CSSStyleDeclaration>;
export const RIGHT_PANEL_STYLES: Record<string, RightPanelStyle> = {
  // class name -> style properties
};
```

Add a small helper in the same file, such as `applyRightPanelStyle(element, className)`, that:

1. looks up the class name in `RIGHT_PANEL_STYLES`;
2. applies each style property to `element.style`;
3. adds the class name to the element so the DOM remains inspectable;
4. throws a clear error for an unknown registry key, rather than silently producing an unstyled control.

Use CSS property names accepted by `CSSStyleDeclaration` (`backgroundColor`, `boxSizing`, `minHeight`, and so on). Do not put behavior, event handlers, element creation, or business logic in the registry.

### 2.2 Add registry entries

Create entries for the shared shell and every visual role used by the right panel. Keep names stable and descriptive. At minimum include:

- `geolibre-plugin-right-panel`: near-white/white background, dark text, `boxSizing: "border-box"`, `padding: "16px"`, neutral border, subtle shadow, and a readable font/line height;
- `right-panel-heading` and `right-panel-description`;
- `geoprocessing-method-select` and `geoprocessing-method-option`;
- `geoprocessing-method-form-container`;
- shared form, label, fieldset, legend, row, output/status, and download-container styles;
- shared control styles for text/number/file inputs and selects, including `width: "100%"`, a stable minimum height, readable padding, and `border: "1px solid #b8c1cc"`;
- `right-panel-select` and `right-panel-option`, explicitly setting option `backgroundColor: "#ffffff"` and `color: "#000000"`;
- button styles for processing, upload/load-vector, calculate/submit, generate-weights, and download actions, each with an explicit border and contrasting background/text colors;
- range/slider, checkbox, status-success, and status-error styles;
- existing interpolation, suitability, forecasting, raster-row, AHP-row, and AHP-input roles that currently depend on `plugin-control.css`.

Avoid styling by element type alone in the registry. A class should communicate the role of the element and be reusable by the interpolation, suitability, and forecasting forms.

### 2.3 Handle state without inline styling

Use registry classes for the normal, hidden, success, and error states:

- Replace `style.display = "none"`, `""`, or `"block"` with a hidden-state class or the existing semantic `hidden` property where that property already controls behavior. Do not change event logic.
- Replace `status.style.color` with a status state class, for example `right-panel-status-error`; remove the previous state class before applying the next one.
- Keep dynamic AHP `gridTemplateColumns` as a runtime value because it depends on the selected raster count. If the registry model supports a CSS custom property, set that custom property through the helper; otherwise document this one data-dependent layout value and do not hard-code a fixed number of columns.
- Do not use pseudo-selectors such as `:hover` or `:focus` in a JavaScript style object. If hover/focus behavior is required, use a small registry-compatible state handler or keep the state class and implement only the necessary rule in the existing stylesheet. The visible border and base appearance must work without hover.

## 3. Migrate `right-panel.ts`

Import the registry helper and registry keys from `../styles/right-panel-styles`.

### 3.1 Centralize element styling

Add a local helper in `right-panel.ts` only if it reduces repetition, for example `styleRightPanelElement(element, key)`, which delegates to the registry helper. Use it immediately after creating each element.

Update these construction sites:

1. In `drawDropdownOptions`, style every option with the option registry entry. Keep `option.value` and `option.textContent` unchanged.
2. In `fieldLabel`, apply the label style to every label created by all three processing forms.
3. In `numberInput` and `rangeInput`, preserve the existing `type`, value, min, max, and step attributes, then apply the appropriate input/range style.
4. In the interpolation branch, style the form, file input, both selects, load-vector button, submit button, status, downloads container, and the two conditionally displayed label containers.
5. In the suitability branch, style every file input, select, numeric input, checkbox, range input, fieldset, legend, AHP row/input, calculate button, status, and download button. Preserve the current class names when they are useful to tests or existing CSS, but make the registry the source of the visual properties.
6. In the forecasting branch, apply the same shared styles to vector/raster sections, forecast inputs/selects, raster cards, action buttons, status, and downloads.
7. In `registerTemplateRightPanel`, style the wrapper, heading, description, method select, and method-form container.

Do not alter processing calls, file parsing, event listeners, button types, input types, option values, or visibility conditions while doing this migration.

### 3.2 Remove duplicated right-panel CSS only after migration

After all elements are styled through the registry, remove or narrow duplicated right-panel rules from `plugin-control.css`, including the form/control declarations that would otherwise override registry values. Keep CSS needed by unrelated plugin-control and floating-panel surfaces.

If a rule is retained for interaction states such as `:hover`, `:focus`, or `[hidden]`, make sure its selector still targets the registry class and does not change the base border, background, text color, or element type. Avoid unrelated cleanup of the stylesheet.

## 4. Add Focused Tests

Extend [`tests/right-panel.test.ts`](../../tests/right-panel.test.ts), or add a small `tests/right-panel-styles.test.ts` if that keeps the existing tests readable.

Add tests that:

1. import the registry and verify required keys exist;
2. apply a registry entry to a DOM element and verify the expected `style` properties and class name;
3. render the panel, choose each processing method, and verify native element types remain present (`select`, file/number/range inputs, buttons, and output);
4. verify every rendered select option has white background and black text;
5. verify representative controls have visible borders, including a dropdown, input, processing button, and file upload control;
6. verify interpolation error status uses the error state and returning to a normal status removes that state;
7. verify the panel still renders and cleans up through the existing `registerTemplateRightPanel` contract.

Use DOM style assertions against the registry-applied values. Do not make tests depend on browser-specific computed-style behavior in jsdom.

## 5. Validation and Acceptance Criteria

Run these commands from the repository root:

```bash
npm test -- --run tests/right-panel.test.ts
npm run lint
npm run build:lib
```

If the focused test file is split, run the new style test alongside `right-panel.test.ts`. Fix only errors caused by this change; report unrelated existing failures separately.

The work is complete when:

- [`src/lib/styles/right-panel-styles.ts`](../../src/lib/styles/right-panel-styles.ts) is the single registry for right-panel visual style pairs;
- all elements created in [`src/lib/geolibre/right-panel.ts`](../../src/lib/geolibre/right-panel.ts) receive a registry style or an explicitly documented dynamic layout value;
- dropdowns, options, inputs, file controls, and buttons visibly have the required borders and colors;
- option text is black on a white background;
- native element types and all processing interactions remain unchanged;
- no right-panel behavior relies on the old inline display/color styles;
- focused tests, lint, and the library build pass.
