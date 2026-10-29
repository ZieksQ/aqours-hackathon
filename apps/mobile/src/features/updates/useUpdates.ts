import { useQuery } from "@tanstack/react-query";
import type { ApiClient } from "../../shared/api";
import { reportingApi } from "../reports/api";
import { reportActivity } from "./activity";
import { previewActivity } from "./preview";

export function useUpdates(
  api: ApiClient,
  accountId: string,
  preview: boolean,
) {
  const query = useQuery({
    queryKey: ["updates", accountId],
    enabled: !preview,
    queryFn: async ({ signal }) => {
      const reports = await reportingApi.list(api, 1, signal);
      const activity = await Promise.all(
        reports.items.map(async (report) => {
          const messages = await reportingApi.messages(
            api,
            report.id,
            null,
            signal,
          );
          return reportActivity(report, messages.items);
        }),
      );
      return {
        items: activity
          .flat()
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
        latestReport: reports.items[0],
        hasOlderReports: reports.totalCount > reports.items.length,
      };
    },
    staleTime: 30000,
    refetchInterval: 30000,
  });
  return {
    ...query,
    items: preview ? previewActivity : (query.data?.items ?? []),
    latestReport: preview
      ? previewActivity[0].report
      : query.data?.latestReport,
  };
}
