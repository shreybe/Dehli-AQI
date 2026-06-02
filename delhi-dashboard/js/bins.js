/** Discrete EPA-style AQI bands — no continuous scale */
const AQI_BINS = [
  { id: 0, label: "Good", range: "0–50", min: 0, max: 50, color: "#3d8b7a" },
  { id: 1, label: "Moderate", range: "51–100", min: 51, max: 100, color: "#7cb87c" },
  { id: 2, label: "Unhealthy (sensitive)", range: "101–150", min: 101, max: 150, color: "#c9b87a" },
  { id: 3, label: "Unhealthy", range: "151–200", min: 151, max: 200, color: "#e8956a" },
  { id: 4, label: "Very unhealthy", range: "201–300", min: 201, max: 300, color: "#d45d52" },
  { id: 5, label: "Hazardous", range: "301–500", min: 301, max: 500, color: "#9e3a5c" },
  { id: 6, label: "Severe+", range: "500+", min: 501, max: 9999, color: "#4a2040" },
];

function binForAqi(aqi) {
  for (const b of AQI_BINS) {
    if (aqi >= b.min && aqi <= b.max) return b;
  }
  return AQI_BINS[AQI_BINS.length - 1];
}

function colorForBin(binId) {
  return AQI_BINS[binId]?.color ?? "#444";
}

function labelForBin(binId) {
  const b = AQI_BINS[binId];
  return b ? `${b.label} (${b.range})` : "—";
}
