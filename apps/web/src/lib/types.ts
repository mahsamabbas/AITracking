export type Role = "manager" | "developer" | "administrator" | "auditor";

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

export interface OrganizationAnalytics {
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
  connectorState: "online" | "stale" | "paused" | "offline";
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
}

export interface EmployeeDevice {
  deviceId: string;
  provider: string | null;
  label: string | null;
  connectorVersion: string | null;
  lastHeartbeat: string | null;
  queueDepth: number | null;
  paused: boolean;
  state: "online" | "stale" | "paused" | "offline";
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
}

export interface EmployeeAnalytics {
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
  fileChangeTrend: { date: string; fileChanges: number }[];
  aiSubscriptions?: EmployeeAiSubscription[];
  idlePeriods: IdlePeriod[];
  recentSessions: SessionRow[];
  totalSessions: number;
}

export interface ToolAnalytics {
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
  provider?: string;
  session_id?: string;
  project_id?: string;
  work_item_id?: string;
  status?: string;
  duration_ms?: number;
  activity_type?: string;
  metadata?: Record<string, unknown>;
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
  state: "online" | "stale" | "paused" | "offline";
}

export interface LiveStatus {
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
