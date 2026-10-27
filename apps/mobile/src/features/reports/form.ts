import type { Report } from "../../shared/api";

export type Coordinates = { latitude: number; longitude: number };
export type ReportDraft = {
  issueType: Report["issueType"] | null;
  description: string;
  locationCodes: string[];
  details: string;
  coordinates: Coordinates | null;
};
export function emptyDraft(): ReportDraft {
  return {
    issueType: null,
    description: "",
    locationCodes: [],
    details: "",
    coordinates: null,
  };
}
export function validCoordinates(
  coordinates: Coordinates | null,
): coordinates is Coordinates {
  return (
    !!coordinates &&
    Number.isFinite(coordinates.latitude) &&
    Number.isFinite(coordinates.longitude) &&
    Math.abs(coordinates.latitude) <= 90 &&
    Math.abs(coordinates.longitude) <= 180
  );
}
export function validateReport(draft: ReportDraft, barangaySelected: boolean) {
  const errors: Record<string, string> = {};
  if (!draft.issueType)
    errors.issueType = "Choose the water issue you are reporting.";
  if (!draft.description.trim())
    errors.description = "Describe what is happening with your water.";
  else if (draft.description.trim().length > 2000)
    errors.description = "Keep your description within 2,000 characters.";
  if (!barangaySelected)
    errors.address = "Complete the location selections through Barangay.";
  if (!draft.details.trim())
    errors.details = "Enter a street address or a nearby landmark.";
  else if (draft.details.trim().length > 500)
    errors.details = "Keep the address within 500 characters.";
  if (!validCoordinates(draft.coordinates))
    errors.coordinates =
      "Choose the problem location on the map or enter valid coordinates.";
  return errors;
}
