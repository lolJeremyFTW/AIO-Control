import { DocDetail, generateDocMetadata } from "../_detail";

export const metadata = generateDocMetadata("security");

export default function SecurityDocsPage() {
  return <DocDetail slug="security" />;
}
