import { FileCode2 } from "lucide-react";

import { PlaceholderPage } from "@/pages/common/PlaceholderPage";

export function OpenAPIPage() {
  return (
    <PlaceholderPage
      title="OpenAPI Import"
      description="Import Swagger and OpenAPI specifications to rapidly generate request structures and collections."
      icon={FileCode2}
    />
  );
}
