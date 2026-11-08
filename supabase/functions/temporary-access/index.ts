import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomCode(role: "customer" | "supplier") {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const raw = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `RW-${role === "customer" ? "C" : "S"}-${raw.match(/.{1,6}/g)?.join("-") || raw}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ??
    JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}")["default"];
  const secretKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}")["default"];
  if (!url || !anonKey || !secretKey) return reply({ error: "Authentication service is not configured." }, 500);

  const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: "Invalid request body." }, 400); }

  if (body.action === "create") {
    const authorization = req.headers.get("Authorization") || "";
    const bearer = authorization.replace(/^Bearer\s+/i, "");
    if (!bearer || bearer === anonKey) return reply({ error: "Administrator authentication required." }, 401);

    const caller = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: callerData, error: callerError } = await caller.auth.getUser(bearer);
    if (callerError || !callerData.user) return reply({ error: "Administrator session is invalid." }, 401);
    const { data: allowed, error: permissionError } = await caller.rpc("is_app_admin");
    if (permissionError || allowed !== true) return reply({ error: "Administrator access required." }, 403);

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const created: Array<{ role: string; code: string; expires_at: string }> = [];
    const createdUsers: string[] = [];

    try {
      for (const role of ["customer", "customer", "supplier", "supplier"] as const) {
        const identity = crypto.randomUUID();
        const email = `rw-temp-${identity}@rootwise.invalid`;
        const password = `${crypto.randomUUID()}!Aa9`;
        const fullName = role === "customer"
          ? `RootWise Test Customer ${created.filter((x) => x.role === "customer").length + 1}`
          : `RootWise Test Supplier ${created.filter((x) => x.role === "supplier").length + 1}`;

        const { data: userData, error: userError } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName, temporary_account: true },
          app_metadata: { temporary_access_role: role, temporary_access_expires_at: expiresAt },
        });
        if (userError || !userData.user) throw new Error(userError?.message || "Could not create a temporary account.");
        const userId = userData.user.id;
        createdUsers.push(userId);

        if (role === "supplier") {
          const { error: nurseryError } = await admin.from("nurseries").insert({
            owner_id: userId,
            name: fullName,
            description: "Temporary RootWise supplier testing workspace. Listings remain subject to review.",
            is_active: false,
          });
          if (nurseryError) throw new Error(nurseryError.message);
          await admin.from("profiles").upsert({ id: userId, full_name: fullName, role: "nursery_owner" });
        }

        const code = randomCode(role);
        const { error: codeError } = await admin.from("temporary_login_codes").insert({
          code_hash: await sha256(code),
          access_role: role,
          auth_user_id: userId,
          expires_at: expiresAt,
          created_by: callerData.user.id,
        });
        if (codeError) throw new Error(codeError.message);
        created.push({ role, code, expires_at: expiresAt });
      }
      return reply({ codes: created, expires_at: expiresAt });
    } catch (error) {
      for (const userId of createdUsers) await admin.auth.admin.deleteUser(userId);
      return reply({ error: error instanceof Error ? error.message : "Could not create temporary access codes." }, 500);
    }
  }

  if (body.action === "redeem") {
    const code = String(body.code || "").trim().toUpperCase();
    if (code.length < 20 || code.length > 64) return reply({ error: "Code is invalid or expired." }, 400);
    const { data: record, error: lookupError } = await admin.schema("private")
      .from("temporary_login_codes")
      .select("id,access_role,auth_user_id,expires_at,revoked_at")
      .eq("code_hash", await sha256(code))
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (lookupError || !record) return reply({ error: "Code is invalid or expired." }, 401);

    const { data: userData, error: userError } = await admin.auth.admin.getUserById(record.auth_user_id);
    if (userError || !userData.user || userData.user.banned_until) return reply({ error: "This temporary account is unavailable." }, 401);

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: userData.user.email!,
    });
    const tokenHash = linkData?.properties?.hashed_token;
    if (linkError || !tokenHash) return reply({ error: "Could not start the temporary session." }, 500);

    const publicClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: sessionData, error: sessionError } = await publicClient.auth.verifyOtp({
      token_hash: tokenHash,
      type: "magiclink",
    });
    if (sessionError || !sessionData.session) return reply({ error: "Could not establish the temporary session." }, 500);

    await admin.from("temporary_login_codes")
      .update({ redemption_count: (await admin.from("temporary_login_codes").select("redemption_count").eq("id", record.id).single()).data?.redemption_count + 1 || 1 })
      .eq("id", record.id);

    return reply({
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
      expires_in: sessionData.session.expires_in,
      expires_at: sessionData.session.expires_at,
      user: {
        id: sessionData.user.id,
        email: sessionData.user.email,
        full_name: sessionData.user.user_metadata?.full_name || (record.access_role === "supplier" ? "Temporary Supplier" : "Temporary Customer"),
        temporary_role: record.access_role,
        temporary_expires_at: record.expires_at,
      },
    });
  }

  return reply({ error: "Unknown action." }, 400);
});
