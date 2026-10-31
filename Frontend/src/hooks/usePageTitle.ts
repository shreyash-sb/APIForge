import { useMemo } from "react";
import { useLocation } from "react-router-dom";

const routeTitles: Record<string, { title: string; description: string }> = {
  "/dashboard": {
    title: "Dashboard",
    description: "Monitor API activity, health, and recent workspace updates.",
  },
  "/collections": {
    title: "Collections",
    description: "Organize API workflows and shared request sets.",
  },
  "/workflows": {
    title: "Workflows",
    description: "Multi-step scenario orchestration with safe variable chaining and teardowns.",
  },
  "/request-builder": {
    title: "Request Builder",
    description: "Compose requests, payloads, headers, and auth flows.",
  },
  "/history": {
    title: "History",
    description: "Review recent request activity and debugging context.",
  },
  "/environments": {
    title: "Environments",
    description: "Manage environment variables and deployment targets.",
  },
  "/openapi": {
    title: "OpenAPI Import",
    description: "Bring external API specs into your workspace.",
  },
  "/mock-server": {
    title: "Mock Server",
    description: "Preview simulated APIs for parallel frontend development.",
  },
  "/response-validation": {
    title: "Response Validation",
    description: "Verify schemas, contracts, and response expectations.",
  },
  "/reports": {
    title: "Reports & Analytics",
    description: "Current-run execution, validation, and AI diagnosis analytics.",
  },
  "/ai-assistant": {
    title: "AI Assistant",
    description: "Use AI workflows for debugging, payloads, and insights.",
  },
  "/test-generator": {
    title: "Test Generator",
    description: "Generate API test cases and scenario coverage.",
  },
  "/documentation": {
    title: "Documentation",
    description: "Create and maintain developer-facing API docs.",
  },
  "/json-generator": {
    title: "JSON Generator",
    description: "Draft mock payloads and request bodies quickly.",
  },
  "/settings": {
    title: "Settings",
    description: "Tune product preferences and workspace defaults.",
  },
};

export function usePageTitle() {
  const { pathname } = useLocation();

  return useMemo(() => {
    return (
      routeTitles[pathname] ?? {
        title: "APIForge",
        description: "Developer platform for APIs, mocks, and AI workflows.",
      }
    );
  }, [pathname]);
}
