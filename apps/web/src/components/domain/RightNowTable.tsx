import { OrgLink } from "@/components/OrgLink";
import { UserAvatar } from "@/components/UserAvatar";
import { ProviderBadge } from "@/components/domain/Badges";
import { formatRelative } from "@/lib/format";
import type { LiveStatus } from "@/lib/types";

type LivePerson = NonNullable<LiveStatus["people"]>[number];

/** Per-person live strip: what each connected agent did in the last two hours. */
export function RightNowTable({ people }: { people: LivePerson[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th>Person</th>
            <th>AI tool</th>
            <th>State</th>
            <th>Last model</th>
            <th>Last tool</th>
            <th className="text-right">Events this hour</th>
            <th>Last event</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.developerId}>
              <td>
                <OrgLink
                  href={`/employees/${p.developerId}`}
                  className="flex items-center gap-2.5 text-sm font-medium text-ink-900 hover:text-brand-600"
                >
                  <UserAvatar name={p.displayName} src={p.avatarUrl} size="sm" />
                  <span className="truncate">{p.displayName}</span>
                </OrgLink>
              </td>
              <td>{p.provider ? <ProviderBadge provider={p.provider} size="sm" /> : <span className="hint">—</span>}</td>
              <td>
                {p.sessionState === "active" ? (
                  <span className="badge-ok" title="Agent event in the last 10 minutes">
                    <span className="pulse-online h-1.5 w-1.5 rounded-full bg-conn-ok" aria-hidden />
                    Agent active
                  </span>
                ) : (
                  <span className="badge-neutral" title="Last agent event 10–120 minutes ago">
                    Recent
                  </span>
                )}
              </td>
              <td className="max-w-[180px] truncate text-sm text-ink-700">{p.lastModel ?? <span className="hint">—</span>}</td>
              <td className="max-w-[160px] truncate text-sm text-ink-700">{p.lastTool ?? <span className="hint">—</span>}</td>
              <td className="num text-right text-sm text-ink-700">{p.eventsThisHour}</td>
              <td className="whitespace-nowrap text-sm text-ink-500">{formatRelative(p.lastEventAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
