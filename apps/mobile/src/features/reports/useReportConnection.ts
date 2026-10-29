import { HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppState } from "react-native";
import type { ApiClient } from "../../shared/api";
import { reportKeys } from "./api";
import { connectReport } from "./realtime";

export function useReportConnection(
  api: ApiClient,
  accountId: string,
  reportId: string,
  enabled: boolean,
) {
  const client = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    let disconnect: (() => void) | undefined;
    const refresh = () => {
      void client.invalidateQueries({
        queryKey: reportKeys.messages(accountId, reportId),
      });
      void client.invalidateQueries({ queryKey: reportKeys.all(accountId) });
    };
    const update = () => {
      if (AppState.currentState && AppState.currentState !== "active") {
        disconnect?.();
        disconnect = undefined;
      } else if (!disconnect) {
        const connection = new HubConnectionBuilder()
          .withUrl(`${api.baseUrl}/api/hubs/reports`, {
            accessTokenFactory: () => api.getAccessToken(),
            withCredentials: false,
          })
          .configureLogging(LogLevel.None)
          .build();
        disconnect = connectReport(connection, reportId, refresh);
      }
    };
    const subscription = AppState.addEventListener("change", update);
    update();
    return () => {
      subscription.remove();
      disconnect?.();
    };
  }, [api, accountId, reportId, enabled, client]);
}
