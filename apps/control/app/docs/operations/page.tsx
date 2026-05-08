import { DocDetail, generateDocMetadata } from "../_detail";

export const metadata = generateDocMetadata("operations");

export default function OperationsDocsPage() {
  return <DocDetail slug="operations" />;
}
