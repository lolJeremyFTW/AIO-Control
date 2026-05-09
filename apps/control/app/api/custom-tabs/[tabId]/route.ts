import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tabId: string }> },
) {
  const { tabId } = await params;
  const body = (await req.json().catch(() => null)) as {
    sort_order?: unknown;
  } | null;
  const sortOrder = Number(body?.sort_order);
  if (!Number.isInteger(sortOrder)) {
    return NextResponse.json(
      { error: "sort_order must be an integer" },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("custom_tabs")
    .update({ sort_order: sortOrder })
    .eq("id", tabId);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ tabId: string }> },
) {
  const { tabId } = await params;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("custom_tabs").delete().eq("id", tabId);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
