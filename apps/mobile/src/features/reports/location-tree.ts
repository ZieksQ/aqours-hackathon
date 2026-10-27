export type LocationNode = {
  psgc_code: string;
  name: string;
  geographic_level: string;
  children: LocationNode[];
};

export function locationLabel(nodes: LocationNode[]) {
  const levels = new Set(nodes.map((node) => node.geographic_level));
  if (levels.has("province"))
    return levels.size > 1 ? "Province / independent city" : "Province";
  if (levels.has("city") || levels.has("municipality"))
    return "City / Municipality";
  if (levels.has("sub_municipality")) return "District / Sub-municipality";
  return "Barangay";
}

export function addressCodes(path: LocationNode[]) {
  const code = (...levels: string[]) =>
    path.find((node) => levels.includes(node.geographic_level))?.psgc_code;
  return {
    regionCode: code("region") ?? "",
    provinceCode: code("province") ?? null,
    cityMunicipalityCode: code("city", "municipality") ?? "",
    subMunicipalityCode: code("sub_municipality") ?? null,
    barangayCode: code("barangay") ?? "",
  };
}

export function resolveLocationPath(
  region: LocationNode | undefined,
  codes: string[],
) {
  const path: LocationNode[] = [];
  if (!region || region.psgc_code !== codes[0]) return path;
  path.push(region);
  for (const code of codes.slice(1)) {
    const child = path[path.length - 1].children.find(
      (node) => node.psgc_code === code,
    );
    if (!child) break;
    path.push(child);
  }
  return path;
}
