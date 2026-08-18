import { Network } from "lucide-react";

import { PlaceholderPage } from "@/pages/common/PlaceholderPage";

export function MockServerPage() {
  return (
    <PlaceholderPage
      title="Mock Server"
      description="Preview mocked API behavior for frontend development, demos, and contract-first workflows."
      icon={Network}
    />
  );
}
