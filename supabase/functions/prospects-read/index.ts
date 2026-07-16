import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "content-type, x-api-key, authorization, apikey",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function secureCompare(provided: string, expected: string): boolean {
  const providedBytes = new TextEncoder().encode(provided);
  const expectedBytes = new TextEncoder().encode(expected);

  if (providedBytes.length !== expectedBytes.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < providedBytes.length; index++) {
    difference |= providedBytes[index] ^ expectedBytes[index];
  }

  return difference === 0;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (request.method !== "GET") {
    return respond(
      {
        error: "Method not allowed",
      },
      405,
    );
  }

  try {
    const suppliedKey = request.headers.get("x-api-key") ?? "";
    const expectedKey =
      Deno.env.get("SCOTT_PROSPECTS_API_KEY") ?? "";

    if (
      !suppliedKey ||
      !expectedKey ||
      !secureCompare(suppliedKey, expectedKey)
    ) {
      return respond(
        {
          error: "Unauthorized",
        },
        401,
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    );

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Missing required Supabase environment variables");

      return respond(
        {
          error: "Server configuration error",
        },
        500,
      );
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const url = new URL(request.url);

    const requestedLimit = Number.parseInt(
      url.searchParams.get("limit") ?? "50",
      10,
    );

    const requestedPage = Number.parseInt(
      url.searchParams.get("page") ?? "1",
      10,
    );

    const limit = Math.min(
      Math.max(
        Number.isNaN(requestedLimit) ? 50 : requestedLimit,
        1,
      ),
      100,
    );

    const page = Math.max(
      Number.isNaN(requestedPage) ? 1 : requestedPage,
      1,
    );

    const rangeStart = (page - 1) * limit;
    const rangeEnd = rangeStart + limit - 1;

    const { data, error, count } = await supabase
      .from("trade_show_leads")
      .select(
        `
          id,
          contact_name,
          dealer,
          email,
          additional_email,
          phone,
          address,
          trade_show,
          sales_rep,
          rep_email,
          product_interest,
          order_amount,
          status,
          notes,
          lead_date,
          prospect_types,
          created_at,
          updated_at
        `,
        {
          count: "exact",
        },
      )
      .order("updated_at", {
        ascending: false,
      })
      .range(rangeStart, rangeEnd);

    if (error) {
      console.error("Prospects database query failed:", error);

      return respond(
        {
          error: "Unable to retrieve prospects",
          details: error.message,
        },
        500,
      );
    }

    const total = count ?? 0;

    return respond({
      success: true,
      prospects: data ?? [],
      pagination: {
        page,
        limit,
        returned: data?.length ?? 0,
        total,
        total_pages: Math.ceil(total / limit),
        has_more: rangeEnd + 1 < total,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Unexpected prospects API error:", error);

    return respond(
      {
        error: "Internal server error",
      },
      500,
    );
  }
});