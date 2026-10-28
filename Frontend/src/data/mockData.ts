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
  BarChart3,
  Settings,
  Sparkles,
  TestTube2,
  Workflow,
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
      { label: "Workflows", path: "/workflows", icon: Workflow },
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
      { label: "Reports & Analytics", path: "/reports", icon: BarChart3 },
    ],
  },
  {
    title: "AI Tools",
    items: [
      { label: "AI Assistant", path: "/ai-assistant", icon: Bot },
      { label: "Test Generator", path: "/test-generator", icon: TestTube2 },
      { label: "Documentation", path: "/documentation", icon: BookMarked },
      { label: "JSON Generator", path: "/json-generator", icon: Sparkles },
    ],
  },
];

export const secondaryNavigation = [
  { label: "Settings", path: "/settings", icon: Settings },
];

export const quickActions: QuickAction[] = [
  {
    title: "Test Suite Runner",
    description: "Synthesize contract-driven tests and run automated regression suites.",
    icon: TestTube2,
    path: "/test-generator",
  },
  {
    title: "OpenAPI 3.1 Studio",
    description: "Import, inspect, and validate OpenAPI specifications with instant schema parsing.",
    icon: FileCode2,
    path: "/openapi",
  },
  {
    title: "Request Studio",
    description: "Craft custom HTTP requests with auth, headers, and live response inspection.",
    icon: Braces,
    path: "/request-builder",
  },
  {
    title: "Ephemeral Mock Server",
    description: "Simulate backend APIs with deterministic endpoints mounted on port 3001.",
    icon: FlaskConical,
    path: "/mock-server",
  },
];

export const aiAssistantActions: AiAction[] = [
  {
    title: "Diagnose test failures",
    description: "Advisory diagnosis uses Gemini only when configured; otherwise it uses the deterministic mock provider.",
    path: "/ai-assistant",
  },
  {
    title: "Generate test cases",
    description: "Create deterministic test definitions from the imported OpenAPI specification.",
    path: "/test-generator",
  },
  {
    title: "Generate JSON samples",
    description: "Create deterministic schema-based JSON samples, with unsupported features reported clearly.",
    path: "/json-generator",
  },
];
