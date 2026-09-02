### Fix List 06

### Problems
1. Currently, `NoData` is handled as `NaN` in Suitability Modeling's MCE and `0` in Raster Forecasting. `NoData` that is already from the source raster and from the NoData values input by the user should always be treated as `NaN`. `NoData` from the bounding box clipping however, add a dropdown field in both MCE and Raster Forecasting on how to treat those `NoData`. `0` means to treat them as `0`, `NaN` means to treat them as `NaN`.
2. Change the rendering of the raster input files in raster forecasting so that `Choose File`, `Select Band`, `Timestamp` and `NoData` fields are on their own lines instead of splitting them into 2 lines.
