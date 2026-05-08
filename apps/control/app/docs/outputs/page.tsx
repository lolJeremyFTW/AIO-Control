import { DocDetail, generateDocMetadata } from "../_detail";

export const metadata = generateDocMetadata("outputs");

export default function OutputsDocsPage() {
  return <DocDetail slug="outputs" />;
}
