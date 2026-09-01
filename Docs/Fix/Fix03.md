### Fix List 03

1. In Forecasting and Suitability, for each raster upload form, add a `NoData` input field, which the user can input a number to treat as NoData. Optional, default unset. Adjust the calculations to take this into account
2. In Forecasting and Suitability, Add another field in the form after the raster uploads, which is going to be a dropdown in which the user can select which raster to be used as the bounding box. The default is the raster uploaded in the first field. This dropdown resets everytime the number of rasters or the uploaded rasters are changed.
3. Currently, the AHP interface in the Suitability Modeling isn't very intuitive in showing which field can or can't be edited. Maybe grey out the uneditable fields.