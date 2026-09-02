### Fix List 07


### Problems
1. In the MCE of suitability modeling, it only support up to 2 decimal places for the weights and AHP table. Accept up to any decimal places, and automatically round them the to the nearest `n` decimal places when using it the weights for the calculation. The number of the target decimal places rounding (Default 5) should be set by a new developer variable `DECIMAL_PLACES_ROUNDING` in `src/lib/geolibre/right-panel.ts`

