import { Badge } from "@aqours/ui";
import { statusName, type Ticket } from "./api";

export function StatusBadge({ status }: { status: Ticket["status"] }) {
  return (
    <Badge
      tone={
        status === "Resolved"
          ? "success"
          : status === "InProgress"
            ? "warning"
            : "danger"
      }
    >
      {statusName(status)}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: Ticket["priority"] }) {
  return (
    <span
      className={`priority-mark${priority === "High" ? " priority-high" : ""}`}
    >
      {priority}
    </span>
  );
}
