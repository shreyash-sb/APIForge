import { Settings } from "lucide-react";

import { PlaceholderPage } from "@/pages/common/PlaceholderPage";

export function SettingsPage() {
  return (
    <PlaceholderPage
      title="Settings"
      description="Configure workspace defaults, user preferences, and future platform integrations."
      icon={Settings}
    />
  );
}
