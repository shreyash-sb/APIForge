import { Boxes } from "lucide-react";

import { PlaceholderPage } from "@/pages/common/PlaceholderPage";

export function EnvironmentsPage() {
  return (
    <PlaceholderPage
      title="Environments"
      description="Prepare variables, secrets, and target configurations for local, staging, and production API work."
      icon={Boxes}
    />
  );
}
