import { DocDetail, generateDocMetadata } from "../_detail";

export const metadata = generateDocMetadata("features");

export default function FeaturesDocsPage() {
  return <DocDetail slug="features" />;
}
