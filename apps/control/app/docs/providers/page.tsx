import { DocDetail, generateDocMetadata } from "../_detail";

export const metadata = generateDocMetadata("providers");

export default function ProvidersDocsPage() {
  return <DocDetail slug="providers" />;
}
