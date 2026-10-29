import type { HubConnection } from "@microsoft/signalr";

// Each new connection must subscribe again and recover events missed offline.
export function connectReport(
  connection: Pick<
    HubConnection,
    "on" | "off" | "onclose" | "start" | "stop" | "invoke"
  >,
  reportId: string,
  refresh: () => void,
) {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  const changed = () => {
    if (!disposed) refresh();
  };
  const retry = () => {
    if (disposed || timer !== undefined) return;
    const delay = [1000, 2000, 5000, 10000, 30000][Math.min(failures++, 4)];
    timer = setTimeout(() => {
      timer = undefined;
      void start();
    }, delay);
  };
  async function start() {
    try {
      await connection.start();
      if (disposed) return;
      await connection.invoke("Subscribe", reportId);
      if (disposed) return;
      failures = 0;
      changed();
    } catch {
      // Includes initial connection and subscription failures, not just drops.
      await connection.stop().catch(() => {});
      retry();
    }
  }

  connection.on("MessageCreated", changed);
  connection.on("TicketUpdated", changed);
  connection.onclose(retry);
  void start();

  return () => {
    disposed = true;
    clearTimeout(timer);
    connection.off("MessageCreated", changed);
    connection.off("TicketUpdated", changed);
    void connection.stop().catch(() => {});
  };
}
