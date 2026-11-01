import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return jsonResponse({ error: "Authentication required." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Supabase URL or service role key is not configured for delete-account.");
    return jsonResponse({ error: "Account deletion is not configured." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return jsonResponse({ error: "A valid signed-in user is required." }, 401);
  }

  const userId = userData.user.id;
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error("Failed to delete authenticated user.", deleteError);
    return jsonResponse({ error: "Account deletion failed." }, 500);
  }

  let storageCleanupFailed = false;
  try {
    const bucket = admin.storage.from("post-images");
    const paths: string[] = [];
    const folders = [userId];
    while (folders.length) {
      const folder = folders.pop();
      if (!folder) continue;
      let offset = 0;
      const pageSize = 100;
      while (true) {
        const { data: items, error: listError } = await bucket.list(folder, {
          limit: pageSize,
          offset,
          sortBy: { column: "name", order: "asc" }
        });
        if (listError) throw listError;
        for (const item of items) {
          const itemPath = folder + "/" + item.name;
          if (item.id === null) folders.push(itemPath);
          else paths.push(itemPath);
        }
        if (items.length < pageSize) break;
        offset += pageSize;
      }
    }
    for (let index = 0; index < paths.length; index += 100) {
      const { error: removeError } = await bucket.remove(paths.slice(index, index + 100));
      if (removeError) throw removeError;
    }
  } catch (storageError) {
    storageCleanupFailed = true;
    console.error("Account was deleted, but its storage objects could not all be removed.", storageError);
  }

  return jsonResponse({ success: true, storageCleanupFailed });
});
