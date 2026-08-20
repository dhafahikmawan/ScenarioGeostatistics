### Geolibre Plugin - Spatial Interpolation Function

We want to pretty much copy the Interpolation function in the already implemented plugin in `/Docs/Samples/Interpolate/` to our plugin, following our plugin's architecture. Copy only the right panel ui and the functionality, no need to copy the plugin control behavior. Additionally, Make it so that any download functions are enabled and disabled by the developer variable in `/src/lib/geolibre/right-panel.ts`.

### Spatial Interpolation porting restrictions:
1. If the porting requires drawing a dropdown for a form or loading a new form based on an input value, use the methods already available in `/src/lib/geolibre/right-panel.ts`.
2. For geotiff/raster writing to file logic, use `/src/lib/utils/geotiff-processor` instead of the sample plugin's. Note that the rasters that is loaded to GeoLibre must be tiled rasters.
3. The processing should be done in `/src/lib/SpatioProcessing/interpolation.ts` which will utilize `/src/lib/utils/geotiff-processor.ts`. `/src/lib/geolibre/right-panel.ts` should only be in charge of UI processing and loading the generated calculation result via the plugin api `addCogLayer` method. 
4. The UI logic should only be done within the scope of 
```typescript
    else if(method === "Spatial Interpolation"){
        
    }
```
located in `/src/lib/geolibre/right-panel.ts` around line 102.
5. Make sure to port the style of the forms too.

### Implementation Plan generation guide
Make sure to also mention any new required dependencies if there is any.