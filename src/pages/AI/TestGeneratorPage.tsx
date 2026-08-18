import { TestTube2 } from "lucide-react";

import { PlaceholderPage } from "@/pages/common/PlaceholderPage";

export function TestGeneratorPage() {
  return (
    <PlaceholderPage
      title="Test Generator"
      description="Generate realistic API test coverage with scenarios for success states, failures, and edge cases."
      icon={TestTube2}
    />
  );
}
