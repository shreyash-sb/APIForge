import { History } from "lucide-react";

import { PlaceholderPage } from "@/pages/common/PlaceholderPage";

export function HistoryPage() {
  return (
    <PlaceholderPage
      title="History"
      description="Review previous requests, compare responses, and keep debugging context close at hand."
      icon={History}
    />
  );
}
