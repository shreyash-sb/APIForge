import { Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "@/layouts/AppLayout";
import { AIAssistantPage } from "@/pages/AI/AIAssistantPage";
import { DocumentationPage } from "@/pages/AI/DocumentationPage";
import { JsonGeneratorPage } from "@/pages/AI/JsonGeneratorPage";
import { TestGeneratorPage } from "@/pages/AI/TestGeneratorPage";
import { CollectionsPage } from "@/pages/Collections/CollectionsPage";
import { DashboardPage } from "@/pages/Dashboard/DashboardPage";
import { EnvironmentsPage } from "@/pages/Environments/EnvironmentsPage";
import { HistoryPage } from "@/pages/History/HistoryPage";
import { MockServerPage } from "@/pages/MockServer/MockServerPage";
import { OpenAPIPage } from "@/pages/OpenAPI/OpenAPIPage";
import { RequestBuilderPage } from "@/pages/RequestBuilder/RequestBuilderPage";
import { ResponseValidationPage } from "@/pages/ResponseValidation/ResponseValidationPage";
import { SettingsPage } from "@/pages/Settings/SettingsPage";
import { ReportsPage } from "@/pages/Reports/ReportsPage";
import { WorkflowsPage } from "@/pages/Workflows/WorkflowsPage";

import { LoginPage } from "@/pages/Auth/LoginPage";
import { SignUpPage } from "@/pages/Auth/SignUpPage";
import { useAuthStore } from "@/store/useAuthStore";

function ProtectedWorkspace() {
  const { isAuthenticated, token } = useAuthStore();
  const isAuth = Boolean(isAuthenticated && token);
  if (!isAuth) {
    return <Navigate to="/login" replace />;
  }
  return <AppLayout />;
}

export function AppRoutes() {
  const { isAuthenticated, token } = useAuthStore();
  const isAuth = Boolean(isAuthenticated && token);

  return (
    <Routes>
      <Route path="/login" element={isAuth ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/signup" element={isAuth ? <Navigate to="/dashboard" replace /> : <SignUpPage />} />
      <Route path="/" element={<Navigate to={isAuth ? "/dashboard" : "/login"} replace />} />
      <Route element={<ProtectedWorkspace />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/collections" element={<CollectionsPage />} />
        <Route path="/workflows" element={<WorkflowsPage />} />
        <Route path="/request-builder" element={<RequestBuilderPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/environments" element={<EnvironmentsPage />} />
        <Route path="/openapi" element={<OpenAPIPage />} />
        <Route path="/mock-server" element={<MockServerPage />} />
        <Route path="/response-validation" element={<ResponseValidationPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/ai-assistant" element={<AIAssistantPage />} />
        <Route path="/test-generator" element={<TestGeneratorPage />} />
        <Route path="/documentation" element={<DocumentationPage />} />
        <Route path="/json-generator" element={<JsonGeneratorPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to={isAuth ? "/dashboard" : "/login"} replace />} />
    </Routes>
  );
}
