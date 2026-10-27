import regionIndex from "@aqours/psgc/data/list-of-all-regions.json";

export type LocationNode = {
  psgc_code: string;
  name: string;
  geographic_level: string;
  children: LocationNode[];
};
export const regions = regionIndex;
const loaders = import.meta.glob<{ region: LocationNode }>(
  "../../../../../packages/psgc/data/*/addresses.json",
  { import: "default" },
);
export async function loadRegion(code: string) {
  const entry = regions.find((region) => region.psgc_code === code);
  const loader =
    entry && loaders[`../../../../../packages/psgc/data/${entry.file}`];
  if (!loader)
    throw new Error(
      "This region's address choices are unavailable. Please retry.",
    );
  return (await loader()).region;
}
export function resolvePath(region: LocationNode | undefined, codes: string[]) {
  const path: LocationNode[] = [];
  let node = region;
  for (const code of codes) {
    if (!node || node.psgc_code !== code) break;
    path.push(node);
    node = node.children.find(
      (child) => child.psgc_code === codes[path.length],
    );
  }
  return path;
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
export function choiceField(nodes: LocationNode[]) {
  if (nodes.some((node) => node.geographic_level === "province"))
    return {
      key: "provinceCode",
      label: nodes.some((node) => node.geographic_level === "city")
        ? "Province / independent city"
        : "Province",
    };
  if (
    nodes.some((node) =>
      ["city", "municipality"].includes(node.geographic_level),
    )
  )
    return { key: "cityMunicipalityCode", label: "City / municipality" };
  if (nodes.some((node) => node.geographic_level === "sub_municipality"))
    return { key: "subMunicipalityCode", label: "Sub-municipality" };
  return { key: "barangayCode", label: "Barangay" };
}
