import regionIndex from "@aqours/psgc/data/list-of-all-regions.json";

import type { LocationNode } from "./location-tree";

export const regions = regionIndex;
// Metro requires literal paths. Load only the chosen region into memory.
const loaders: Record<string, () => { region: LocationNode }> = {
  "1300000000-national-capital-region-ncr/addresses.json": () =>
    require("@aqours/psgc/data/1300000000-national-capital-region-ncr/addresses.json"),
  "1400000000-cordillera-administrative-region-car/addresses.json": () =>
    require("@aqours/psgc/data/1400000000-cordillera-administrative-region-car/addresses.json"),
  "0100000000-region-i-ilocos-region/addresses.json": () =>
    require("@aqours/psgc/data/0100000000-region-i-ilocos-region/addresses.json"),
  "0200000000-region-ii-cagayan-valley/addresses.json": () =>
    require("@aqours/psgc/data/0200000000-region-ii-cagayan-valley/addresses.json"),
  "0300000000-region-iii-central-luzon/addresses.json": () =>
    require("@aqours/psgc/data/0300000000-region-iii-central-luzon/addresses.json"),
  "0400000000-region-iv-a-calabarzon/addresses.json": () =>
    require("@aqours/psgc/data/0400000000-region-iv-a-calabarzon/addresses.json"),
  "1700000000-mimaropa-region/addresses.json": () =>
    require("@aqours/psgc/data/1700000000-mimaropa-region/addresses.json"),
  "0500000000-region-v-bicol-region/addresses.json": () =>
    require("@aqours/psgc/data/0500000000-region-v-bicol-region/addresses.json"),
  "0600000000-region-vi-western-visayas/addresses.json": () =>
    require("@aqours/psgc/data/0600000000-region-vi-western-visayas/addresses.json"),
  "1800000000-negros-island-region-nir/addresses.json": () =>
    require("@aqours/psgc/data/1800000000-negros-island-region-nir/addresses.json"),
  "0700000000-region-vii-central-visayas/addresses.json": () =>
    require("@aqours/psgc/data/0700000000-region-vii-central-visayas/addresses.json"),
  "0800000000-region-viii-eastern-visayas/addresses.json": () =>
    require("@aqours/psgc/data/0800000000-region-viii-eastern-visayas/addresses.json"),
  "0900000000-region-ix-zamboanga-peninsula/addresses.json": () =>
    require("@aqours/psgc/data/0900000000-region-ix-zamboanga-peninsula/addresses.json"),
  "1000000000-region-x-northern-mindanao/addresses.json": () =>
    require("@aqours/psgc/data/1000000000-region-x-northern-mindanao/addresses.json"),
  "1100000000-region-xi-davao-region/addresses.json": () =>
    require("@aqours/psgc/data/1100000000-region-xi-davao-region/addresses.json"),
  "1200000000-region-xii-soccsksargen/addresses.json": () =>
    require("@aqours/psgc/data/1200000000-region-xii-soccsksargen/addresses.json"),
  "1600000000-region-xiii-caraga/addresses.json": () =>
    require("@aqours/psgc/data/1600000000-region-xiii-caraga/addresses.json"),
  "1900000000-bangsamoro-autonomous-region-in-muslim-mindanao-barmm/addresses.json":
    () =>
      require("@aqours/psgc/data/1900000000-bangsamoro-autonomous-region-in-muslim-mindanao-barmm/addresses.json"),
};

export function loadRegion(code: string): LocationNode | undefined {
  const region = regions.find((item) => item.psgc_code === code);
  return region ? loaders[region.file]?.().region : undefined;
}
