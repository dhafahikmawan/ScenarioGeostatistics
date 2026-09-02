### Fix List 05


### Problems
1. Currently, in both suitability modeling and raster forecasting, the process won't run if the raster dimensions mismatch. Update it so that it will run using the selected bounding box raster as the dimension to be calculated (Basically, clip the rasters to the bounding box first, then calculate), any missing data is going to be treated as `NaN`. The user input rasters are still required to use the same CRS.
2. In Suitability modeling->generate mce raster, the raster input fields is displayed in one line per input raster. Adjust it so that it is rendered the same way MCE in `Docs/Samples/MceRightPanel/right-panel.ts` renders the raster input fields.
3. In raster forecasting, the raster input fields is displayed in one line per input raster. Make it similar to how MCE in `Docs/Samples/MceRightPanel/right-panel.ts` handles it, with these specifications:
    - Each input raster field is their own card
    - The `Raster #<number>` is rendered the same as the MCE reference renders raster number
    - `Choose File` and `Select Band` is in the same line
    - Under them, is the `Timestamp Field`