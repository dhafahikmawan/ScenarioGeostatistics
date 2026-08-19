### Geolibre Plugin - Suitability Modeling Function

We want to pretty much copy the Suitability Modeling function in the already implemented plugin in `/Docs/Samples/SuitabilityModeling/` to our plugin, following our plugin's architecture. Copy only the right panel ui and the functionality, no need to copy the plugin control behavior. Additionally, Make it so that the download functions are enabled and disabled by the developer variable in `/src/lib/geolibre/right-panel.ts`.

### Suitability Modeling porting restrictions:
1. No need to port the api conversion function.
2. If the porting requires drawing a dropdown for a form or loading a new form based on an input value, use the methods already available in `/src/lib/geolibre/right-panel.ts`.
3. For geotiff/raster reading from file and writing to file logic, use `/src/lib/utils/geotiff-processor` instead of the sample plugin's. Note that the rasters that is loaded to GeoLibre must be tiled rasters.
4. The processing should be done in `/src/lib/SpatioProcessing/suitability.ts` which will utilize `/src/lib/utils/geotiff-processor.ts`. `/src/lib/geolibre/right-panel.ts` should only be in charge of UI processing and loading the generated calculation result via the plugin api `addCogLayer` method. 
5. The UI logic should only be done within the scope of 
```typescript
    else if(method === "Suitability Modeling"){
        
    }
```
located in `/src/lib/geolibre/right-panel.ts` around line 51.

### Implementation Plan generation guide
Make sure to also mention any new required dependencies if there is any.