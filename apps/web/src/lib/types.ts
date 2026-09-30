import type { ConnectorState } from "./vocab";
export type Role = "manager" | "developer" | "administrator" | "auditor" | "super_admin";

export interface Totals {
  activeMs: number;
  modelMs: number;
  toolMs: number;
  interactiveMs: number;
  elapsedMs: number;
  idleMs: number;
  productiveMs: number;
  sessions: number;
  modelRequests: number;
  toolCalls: number;
  fileChanges: number;
  testsRun: number;
  testsFailed: number;
  buildsRun: number;
  buildsFailed: number;
  tokenInput: number | null;
  tokenOutput: number | null;
  avgSessionMs: number;
  activeEmployees: number;
}

export interface TrendPoint {
  date: string;
  activeMs: number;
  productiveMs: number;
  idleMs: number;
  sessions: number;
  employees: number;
}

export interface ToolUsage {
  provider: string;
  activeMs: number;
  modelMs: number;
  toolMs: number;
  sessions: number;
  employees: number;
  modelRequests: number;
  fileChanges: number;
  tokenInput: number | null;
  tokenOutput: number | null;
  lastUsedAt: string | null;
}

export interface EmployeeAiSubscription {
  provider: string;
  label: string;
  periodLabel: string;
  planName?: string | null;
  usageUnit?: "tokens" | "model_requests" | "cursor_admin_requests";
  tokenInput: number | null;
  tokenOutput: number | null;
  tokensUsed: number | null;
  modelRequests?: number | null;
  completionsCount?: number | null;
  chatRequestsCount?: number | null;
  monthlyLimit: number | null;
  remaining: number | null;
  tokensFromTelemetry: boolean;
  limitConfigured: boolean;
  usageSource?: string;
  sessionsThisMonth: number;
}

export interface HourPattern {
  hour: number;
  activeMs: number;
  sessions: number;
}

export interface WeekdayPattern {
  weekday: number;
  label: string;
  activeMs: number;
  sessions: number;
}

export interface ClassificationSlice {
  classification: string;
  sessions: number;
  activeMs: number;
  idleMs: number;
}

export interface CoverageSummary {
  gapEvents: number;
  pausedConnectors: number;
  staleConnectors: number;
  offlineConnectors: number;
  partialSessions: number;
  unassignedSessions: number;
  employeesWithoutTelemetry: number;
}

/** Daily agent file changes and commits (same day keys as the usage trend). */
export interface ChangeTrendPoint {
  date: string;
  fileChanges: number;
  commits?: number;
  verifiedCommits?: number;
  shippedCommits?: number;
  committedFiles?: number;
}

export interface CommitSummary {
  commits: number;
  verified: number;
  shipped: number;
  filesChanged: number;
  linesAdded: number;
  linesDeleted: number;
  repos: { name: string; commits: number; shipped: number }[];
  recent: {
    ref: string;
    occurredAt: string;
    repo: string | null;
    filesChanged: number;
    linesAdded: number;
    linesDeleted: number;
    verified: boolean;
    shippedAt: string | null;
    developerId: string;
    developerName: string | null;
  }[];
}

export interface OrganizationAnalytics {
  workMix?: import("./vocab").WorkMix;
  changeTrend?: ChangeTrendPoint[];
  commits?: CommitSummary | null;
  preset: string;
  range: { from: string; to: string };
  totals: Totals;
  previousTotals: Totals;
  headcount: { total: number; active: number; connected: number };
  dailyTrend: TrendPoint[];
  tools: ToolUsage[];
  hourPattern: HourPattern[];
  weekdayPattern: WeekdayPattern[];
  classifications: ClassificationSlice[];
  toolCategories: { category: string; calls: number }[];
  coverage: CoverageSummary;
  teams: { team: string; activeMs: number; sessions: number; employees: number }[];
  scope: "self" | "organization";
}

export interface EmployeeRow {
  id: string;
  displayName: string;
  email: string | null;
  team: string | null;
  title: string | null;
  status: string;
  avatarUrl: string | null;
  connectorState: ConnectorState;
  lastHeartbeat: string | null;
  lastActiveAt: string | null;
  activeMs: number;
  productiveMs: number;
  idleMs: number;
  elapsedMs: number;
  sessions: number;
  modelRequests: number;
  fileChanges: number;
  avgSessionMs: number;
  tools: { provider: string; activeMs: number; sessions: number }[];
  trend: { date: string; activeMs: number }[];
  coverageWarning: boolean;
  currentHourEvents: number;
}

export interface EmployeeProfile {
  id: string;
  displayName: string;
  email: string | null;
  team: string | null;
  title: string | null;
  status: string;
  joinedAt: string | null;
  avatarUrl: string | null;
}

export interface EmployeeDevice {
  deviceId: string;
  provider: string | null;
  label: string | null;
  connectorVersion: string | null;
  lastHeartbeat: string | null;
  queueDepth: number | null;
  paused: boolean;
  state: ConnectorState;
}

export interface SessionRow {
  id: string;
  developerId: string;
  deviceId: string;
  provider: string;
  startedAt: string;
  endedAt: string | null;
  lastEventAt: string | null;
  projectId: string | null;
  workItemId: string | null;
  unassigned: boolean;
  modelDurationMs: number;
  toolDurationMs: number;
  activeDurationMs: number;
  interactiveSpanMs: number;
  elapsedSpanMs: number;
  idleDurationMs: number;
  eventCount: number;
  modelRequests: number;
  toolCalls: number;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  buildsRun: number;
  buildsFailed: number;
  fileChanges: number;
  failures: number;
  tokenInput: number | null;
  tokenOutput: number | null;
  modelsUsed: string[];
  toolCategories: Record<string, number>;
  classification: string;
  coverageState: string;
}

export interface IdlePeriod {
  from: string;
  to: string;
  durationMs: number;
  reason: "idle_gap" | "coverage_gap";
}

export interface ProviderCapability {
  id: string;
  label: string;
  tier: "A" | "B";
  hourly: boolean;
  missing: string[];
  emptyState: string;
  note?: string;
  /** FR-012: "connector" when the live report from this person's connector is shown. */
  capabilitySource?: "connector" | "catalog";
  reportedAt?: string | null;
  observedVia?: string[];
  unavailable?: string[];
}

export interface EmployeeAnalytics {
  aiProgress?: AiProgress;
  preset: string;
  range: { from: string; to: string };
  employee: EmployeeProfile;
  devices: EmployeeDevice[];
  totals: Totals;
  previousTotals: Totals;
  dailyTrend: TrendPoint[];
  tools: ToolUsage[];
  hourPattern: HourPattern[];
  weekdayPattern: WeekdayPattern[];
  classifications: ClassificationSlice[];
  toolCategories: { category: string; calls: number }[];
  models: { model: string; sessions: number }[];
  projects: { projectId: string | null; name: string; activeMs: number; sessions: number }[];
  fileChangeWorkspaces: {
    name: string;
    fileChanges: number;
    sessions: number;
    activeMs: number;
  }[];
  fileChangeTrend: ChangeTrendPoint[];
  /** Commit → Verified → Shipped (null when unavailable). */
  commits?: CommitSummary | null;
  workMix?: import("./vocab").WorkMix;
  aiSubscriptions?: EmployeeAiSubscription[];
  idlePeriods: IdlePeriod[];
  /** Total long quiet gaps in range; idlePeriods lists only the longest few. */
  idleGapCount?: number;
  recentSessions: SessionRow[];
  totalSessions: number;
}

export interface ToolAnalytics {
  workMix?: import("./vocab").WorkMix;
  preset: string;
  range: { from: string; to: string };
  employee: EmployeeProfile;
  provider: string;
  capability: ProviderCapability | null;
  totals: Totals;
  previousTotals: Totals;
  shareOfEmployeeActiveMs: number;
  dailyTrend: TrendPoint[];
  hourPattern: HourPattern[];
  classifications: ClassificationSlice[];
  toolCategories: { category: string; calls: number }[];
  models: { model: string; sessions: number }[];
  projects: { projectId: string | null; name: string; activeMs: number; sessions: number }[];
  sessions: SessionRow[];
  totalSessions: number;
}

export interface ActivityEventRow {
  event_id: string;
  event_type: string;
  occurred_at: string;
  /** Server receipt time; `late` when it arrived > 5 min after occurred_at. */
  received_at?: string;
  late?: boolean;
  provider?: string;
  session_id?: string;
  project_id?: string;
  work_item_id?: string;
  status?: string;
  duration_ms?: number;
  activity_type?: string;
  metadata?: Record<string, unknown>;
  /** Present on organisation-wide feeds. */
  developer_id?: string;
  developer_name?: string | null;
}

export interface SessionDetail {
  session: SessionRow;
  employee: EmployeeProfile | null;
  capability: ProviderCapability | null;
  project: { id: string; name: string } | null;
  workItem: { id: string; title: string } | null;
  events: ActivityEventRow[];
  contextChanges: {
    version: number;
    projectId: string | null;
    workItemId: string | null;
    label: string | null;
    recordedAt: string;
  }[];
  neighbours: { previousId: string | null; nextId: string | null };
}

export interface LiveConnector {
  deviceId: string;
  developerId: string;
  displayName: string;
  team: string | null;
  provider: string | null;
  connectorVersion: string | null;
  lastHeartbeat: string | null;
  queueDepth: number | null;
  paused: boolean;
  state: ConnectorState;
}

export interface LiveStatus {
  people?: LivePerson[];
  dbAvailable: boolean;
  hint?: string;
  connectors: LiveConnector[];
  activeSessions: {
    sessionId: string;
    developerId: string;
    displayName: string;
    provider: string;
    startedAt: string;
    lastEventAt: string | null;
    project: string | null;
    unassigned: boolean;
    activeMs: number;
    eventCount: number;
  }[];
  alerts: {
    severity: "info" | "warning" | "error";
    code: string;
    message: string;
    developerId?: string;
    displayName?: string;
    deviceId?: string;
  }[];
  recentEvents: ActivityEventRow[];
  generatedAt?: string;
}

export interface FilterMeta {
  teams: string[];
  projects: { id: string; name: string }[];
  workItems: { id: string; title: string; projectId: string | null }[];
  timezone?: string;
  providers: ProviderCapability[];
}

// ---------------------------------------------------------------------------
// AI Progress (GET /v1/employees/:id → aiProgress; see docs/ai-progress-data-lineage.md)
// ---------------------------------------------------------------------------
export interface EffectiveCapability {
  missing: string[];
  unavailable: string[];
  source: "connector" | "catalog";
  reportedAt: string | null;
  observedVia: string[];
  tier: "A" | "B";
  hourly: boolean;
  note: string | null;
  emptyState: string | null;
}

export interface ProviderProgress {
  provider: string;
  label: string;
  capability: EffectiveCapability;
  sessions: number;
  activeMs: number;
  modelMs: number;
  toolMs: number;
  modelRequests: number;
  toolCalls: number;
  fileChanges: number;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  buildsRun: number;
  buildsFailed: number;
  tokenInput: number | null;
  tokenOutput: number | null;
  models: { model: string; sessions: number }[];
  lastActivityAt: string | null;
  sharePct: number;
}

export interface TierBDay {
  date: string;
  provider: string;
  billableRequests: number | null;
  chatRequests: number | null;
  agentRequests: number | null;
  completions: number | null;
  suggestions: number | null;
  acceptances: number | null;
  linesAdded: number | null;
  linesDeleted: number | null;
}

export interface AiProgress {
  range: { from: string; to: string };
  providers: ProviderProgress[];
  tierBDaily: TierBDay[];
  coverage: { gapCount: number; gapMs: number; observedSpanMs: number; observedPct: number | null };
}

export interface ProgressTimeline {
  date: string;
  timezone: string;
  hours: {
    hour: number;
    byProvider: Record<string, { modelRequests: number; toolCalls: number; fileChanges: number; checks: number; failures: number }>;
    coverageEvents: number;
  }[];
  sessions: {
    id: string;
    provider: string;
    startedAt: string;
    endedAt: string | null;
    activeMs: number;
    classification: string;
    coverageState: string;
  }[];
}

export interface LivePerson {
  developerId: string;
  displayName: string;
  avatarUrl: string | null;
  provider: string | null;
  sessionState: "active" | "recent";
  lastEventAt: string | null;
  lastModel: string | null;
  lastTool: string | null;
  eventsThisHour: number;
}
