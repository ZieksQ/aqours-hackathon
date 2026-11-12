import type {
  ApiClient,
  Message,
  Report,
  ReportAddress,
} from "../../shared/api";
import { MESSAGE_UPLOAD_TIMEOUT_MS, type PickedImage } from "./attachments.ts";

export type SubmitReport = {
  issueType: Report["issueType"];
  description: string;
  address: Pick<
    ReportAddress,
    | "regionCode"
    | "provinceCode"
    | "cityMunicipalityCode"
    | "subMunicipalityCode"
    | "barangayCode"
    | "details"
  >;
  latitude: number;
  longitude: number;
};
export type ReportPage = {
  items: Report[];
  page: number;
  pageSize: number;
  totalCount: number;
};
export type MessagePage = { items: Message[]; nextBefore: number | null };

export const reportKeys = {
  latest: (accountId: string) => ["reports", accountId, "latest"] as const,
  all: (accountId: string) => ["reports", accountId] as const,
  detail: (accountId: string, id: string) =>
    ["reports", accountId, "detail", id] as const,
  messages: (accountId: string, id: string) =>
    ["messages", accountId, id] as const,
};
export const reportingApi = {
  list: (api: ApiClient, page: number, signal?: AbortSignal) =>
    api.request<ReportPage>(
      `/reports?page=${page}&pageSize=20`,
      undefined,
      true,
      true,
      signal,
    ),
  detail: (api: ApiClient, id: string, signal?: AbortSignal) =>
    api.request<Report>(`/reports/${id}`, undefined, true, true, signal),
  submit: (api: ApiClient, report: SubmitReport) =>
    api.request<Report>("/reports", report),
  messages: (
    api: ApiClient,
    id: string,
    before: number | null,
    signal?: AbortSignal,
  ) =>
    api.request<MessagePage>(
      `/reports/${id}/messages?pageSize=50${before === null ? "" : `&before=${before}`}`,
      undefined,
      true,
      true,
      signal,
    ),
  reply: (
    api: ApiClient,
    id: string,
    body: string,
    files: PickedImage[] = [],
  ) => {
    if (files.length === 0)
      return api.request<Message>(`/reports/${id}/messages`, {
        body: body.trim(),
      });

    return api.request<Message>(
      `/reports/${id}/messages`,
      () => {
        const form = new FormData();
        const text = body.trim();
        if (text) form.append("body", text);
        files.forEach((file) => {
          form.append(
            "files",
            {
              uri: file.uri,
              name: file.fileName,
              type: file.contentType,
            } as unknown as Blob,
          );
        });
        return form;
      },
      true,
      true,
      undefined,
      MESSAGE_UPLOAD_TIMEOUT_MS,
    );
  },
};
