### Fix List 02

1. Any geojson loaded to GeoLibre must be in WGS 84 CRS, update the plugin so that if the generated vector geojson isn't in WGS 84, it is converted to WGS 84 first. Feel free to use a new package if there is any that could help.
2. Update the plugin so that it shows the form field: kriging model (gaussian, exponential, spherical. Default exponential), only when kriging method is selected (In case in the future there are additional methods). Show them in a new form container under the interpolation method dropdown (just like how the plugin draws the base form).