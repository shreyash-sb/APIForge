import {
  BookMarked,
  Bot,
  Boxes,
  Braces,
  FileCode2,
  FlaskConical,
  FolderKanban,
  History,
  LayoutDashboard,
  Network,
  Radar,
  Settings,
  Sparkles,
  TestTube2,
  Waypoints,
} from "lucide-react";

import type {
  AiAction,
  ApiHealthItem,
  ChartPoint,
  CollectionSummary,
  NavGroup,
  QuickAction,
  RecentRequest,
  StatsCardData,
} from "@/types/dashboard";

export const navigationGroups: NavGroup[] = [
  {
    title: "Workspace",
    items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
      { label: "Collections", path: "/collections", icon: FolderKanban },
      { label: "Request Builder", path: "/request-builder", icon: Braces },
      { label: "History", path: "/history", icon: History },
      { label: "Environments", path: "/environments", icon: Boxes },
    ],
  },
  {
    title: "API Tools",
    items: [
      { label: "OpenAPI Import", path: "/openapi", icon: FileCode2 },
      { label: "Mock Server", path: "/mock-server", icon: Network },
      { label: "Response Validation", path: "/response-validation", icon: Radar },
    ],
  },
  {
    title: "AI Tools",
    items: [
      { label: "AI Assistant", path: "/ai-assistant", icon: Bot, badge: "AI" },
      { label: "Test Generator", path: "/test-generator", icon: TestTube2, badge: "AI" },
      { label: "Documentation", path: "/documentation", icon: BookMarked, badge: "AI" },
      { label: "JSON Generator", path: "/json-generator", icon: Sparkles, badge: "AI" },
    ],
  },
];

export const secondaryNavigation = [
  { label: "Settings", path: "/settings", icon: Settings },
  { label: "Help Center", path: "/documentation", icon: Waypoints },
];

export const dashboardStats: StatsCardData[] = [
  { title: "API Requests", value: "1,248", change: "+12.5% this week", trend: "up", tone: "primary" },
  { title: "Collections", value: "12", change: "3 updated today", trend: "up", tone: "success" },
  { title: "Success Rate", value: "96.4%", change: "+2.1% this week", trend: "up", tone: "success" },
  { title: "Avg Response Time", value: "184 ms", change: "-8.4% this week", trend: "down", tone: "warning" },
];

export const quickActions: QuickAction[] = [
  {
    title: "New Request",
    description: "Create and test a REST API request.",
    icon: Braces,
    path: "/request-builder",
  },
  {
    title: "Create Collection",
    description: "Organize endpoints into reusable collections.",
    icon: FolderKanban,
    path: "/collections",
  },
  {
    title: "Import OpenAPI",
    description: "Bootstrap endpoints from an API specification.",
    icon: FileCode2,
    path: "/openapi",
  },
  {
    title: "Generate Mock API",
    description: "Spin up realistic API behavior for frontend work.",
    icon: FlaskConical,
    path: "/mock-server",
  },
];

export const recentRequests: RecentRequest[] = [
  { method: "GET", endpoint: "/api/users", collection: "User Service", status: 200, responseTime: "124 ms", time: "2 min ago" },
  { method: "POST", endpoint: "/api/auth/login", collection: "Authentication", status: 200, responseTime: "87 ms", time: "8 min ago" },
  { method: "GET", endpoint: "/api/products", collection: "Product API", status: 200, responseTime: "156 ms", time: "15 min ago" },
  { method: "DELETE", endpoint: "/api/users/42", collection: "User Service", status: 204, responseTime: "103 ms", time: "24 min ago" },
  { method: "GET", endpoint: "/api/orders/123", collection: "Order Service", status: 404, responseTime: "192 ms", time: "31 min ago" },
];

export const apiActivity: ChartPoint[] = [
  { day: "Mon", requests: 142, errors: 5 },
  { day: "Tue", requests: 168, errors: 7 },
  { day: "Wed", requests: 154, errors: 4 },
  { day: "Thu", requests: 181, errors: 8 },
  { day: "Fri", requests: 205, errors: 6 },
  { day: "Sat", requests: 132, errors: 3 },
  { day: "Sun", requests: 118, errors: 2 },
];

export const apiHealth: ApiHealthItem[] = [
  { service: "User Service", status: "Healthy", responseTime: "118 ms" },
  { service: "Auth Service", status: "Healthy", responseTime: "92 ms" },
  { service: "Payment Service", status: "Degraded", responseTime: "301 ms" },
  { service: "Product Service", status: "Healthy", responseTime: "144 ms" },
];

export const collections: CollectionSummary[] = [
  { name: "User Service", requests: 12, updatedAt: "Updated 10 min ago", accent: "bg-sky-500/10 text-sky-700" },
  { name: "E-Commerce API", requests: 28, updatedAt: "Updated 1 hour ago", accent: "bg-emerald-500/10 text-emerald-700" },
  { name: "Authentication", requests: 8, updatedAt: "Updated yesterday", accent: "bg-violet-500/10 text-violet-700" },
  { name: "Payments", requests: 16, updatedAt: "Updated 2 days ago", accent: "bg-amber-500/10 text-amber-700" },
];

export const aiAssistantActions: AiAction[] = [
  {
    title: "Explain Error",
    description: "Turn failing responses into readable debugging context.",
  },
  {
    title: "Generate Test Cases",
    description: "Draft request scenarios for common success and edge flows.",
  },
  {
    title: "Generate JSON Payload",
    description: "Create structured sample bodies from endpoint intent.",
  },
];
