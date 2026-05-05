import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ tabId: string }> },
) {
  const { tabId } = await params;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("custom_tabs")
    .delete()
    .eq("id", tabId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
