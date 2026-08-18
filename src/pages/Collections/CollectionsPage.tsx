import { FolderKanban } from "lucide-react";

import { PlaceholderPage } from "@/pages/common/PlaceholderPage";

export function CollectionsPage() {
  return (
    <PlaceholderPage
      title="Collections"
      description="Create, organize, and reuse grouped API requests for services, environments, and team workflows."
      icon={FolderKanban}
    />
  );
}
