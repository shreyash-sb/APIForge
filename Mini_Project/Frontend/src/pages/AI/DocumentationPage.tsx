import { BookMarked } from "lucide-react";

import { PlaceholderPage } from "@/pages/common/PlaceholderPage";

export function DocumentationPage() {
  return (
    <PlaceholderPage
      title="Documentation"
      description="Draft developer documentation, examples, and onboarding content directly from your API workspace."
      icon={BookMarked}
    />
  );
}
