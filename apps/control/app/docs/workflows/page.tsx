import { DocDetail, generateDocMetadata } from "../_detail";

export const metadata = generateDocMetadata("workflows");

export default function WorkflowsDocsPage() {
  return <DocDetail slug="workflows" />;
}
