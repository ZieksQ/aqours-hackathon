import { useEffect, useState } from "react";
import { HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import { useQueryClient } from "@tanstack/react-query";

export function useReportConnection(id?: string) {
  const client = useQueryClient();
  const [state, setState] = useState("Connecting");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    const connection = new HubConnectionBuilder()
      .withUrl("/api/hubs/reports")
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Error)
      .build();
    const refresh = () => {
      void client.invalidateQueries({ queryKey: ["reports"] });
    };
    const subscribe = async () => {
      if (id) await connection.invoke("Subscribe", id);
      if (!disposed) {
        setState("Connected");
        refresh();
      }
    };
    connection.on("QueueChanged", refresh);
    connection.on("MessageCreated", refresh);
    connection.on("TicketUpdated", refresh);
    connection.onreconnecting(() => {
      if (!disposed) setState("Reconnecting");
    });
    connection.onreconnected(() => {
      void subscribe().catch(() => {
        if (!disposed) setState("Unavailable");
      });
    });
    connection.onclose(() => {
      if (!disposed) setState("Disconnected");
    });
    void connection
      .start()
      .then(subscribe)
      .catch(() => {
        if (!disposed) setState("Disconnected");
      });
    return () => {
      disposed = true;
      void connection.stop();
    };
  }, [client, id, attempt]);
  return { state, retry: () => setAttempt((value) => value + 1) };
}
