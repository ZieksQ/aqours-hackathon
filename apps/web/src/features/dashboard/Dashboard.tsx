import { Link } from "react-router";
import type { Account } from "../accounts/api";
const planned = [
  {
    title: "Supply monitoring",
    text: "Manually recorded availability for each supplier site, with the last update and staff member.",
  },
  {
    title: "Weather warnings",
    text: "Forecast temperatures combined with recorded low supply to flag potential supply risks.",
  },
];
export function Dashboard({ account }: { account: Account }) {
  return (
    <section>
      <div className="title-row">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">Customer reports and supplier responses.</p>
        </div>
        {account.role === "Admin" && (
          <Link className="primary" to="/accounts/new">
            Create account
          </Link>
        )}
      </div>
      <div className="notice">
        <h2>Water reports</h2>
        <p className="mt-2 mb-4">
          Review incoming water issues, claim a ticket, and respond to
          customers.
        </p>
        <Link className="primary" to="/reports">
          Open report queue
        </Link>
      </div>
      <h2 className="mt-8 mb-4">Planned functionality</h2>
      <div className="planned-list">
        {planned.map((item) => (
          <div className="planned-row" key={item.title}>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
            <span className="muted">Planned</span>
          </div>
        ))}
      </div>
    </section>
  );
}
