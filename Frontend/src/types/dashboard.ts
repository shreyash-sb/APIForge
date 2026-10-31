import type { LucideIcon } from "lucide-react";

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  badge?: string;
};

export type StatsCardData = {
  title: string;
  value: string;
  change: string;
  trend: "up" | "down";
  tone: "primary" | "success" | "warning" | "ai";
};

export type QuickAction = {
  title: string;
  description: string;
  icon: LucideIcon;
  path: string;
};

export type RecentRequest = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "TRACE";
  endpoint: string;
  collection: string;
  status?: number;
  responseTime: string;
  time: string;
  outcome?: string;
};

export type ChartPoint = {
  day: string;
  requests: number;
  httpErrors: number;
  transportFailures: number;
};

export type ApiHealthItem = {
  service: string;
  status: "Healthy" | "Degraded" | "Incident" | "Unknown" | "Not monitored" | "Unavailable";
  responseTime: string;
};

export type CollectionSummary = {
  name: string;
  requests: number;
  updatedAt: string;
  accent: string;
};

export type AiAction = {
  title: string;
  description: string;
  path: string;
};
