import { getStore } from "@netlify/blobs";

function encryptText(text) {
  const chars = text.split("");
  return chars
    .map((c) => {
      const code = c.charCodeAt(0);
      return String.fromCharCode(code + 3);
    })
    .join("");
}

function decryptText(text) {
  const chars = text.split("");
  return chars
    .map((c) => {
      const code = c.charCodeAt(0);
      return String.fromCharCode(code - 3);
    })
    .join("");
}

export default async (req) => {
  const store = getStore({ name: "bank-data", consistency: "strong" });
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  if (req.method === "POST" && action === "login") {
    const body = await req.json();
    const { password } = body;
    if (password === "Jeremyv5$") {
      return Response.json({ success: true, token: encryptText("admin_authenticated_" + Date.now()) });
    }
    return Response.json({ error: "Invalid admin password" }, { status: 401 });
  }

  // Verify admin token
  const authHeader = req.headers.get("x-admin-token");
  if (!authHeader) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const decrypted = decryptText(authHeader);
    if (!decrypted.startsWith("admin_authenticated_")) {
      return Response.json({ error: "Invalid token" }, { status: 401 });
    }
  } catch {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  if (action === "activities") {
    const activities = (await store.get("activities", { type: "json" })) || [];
    // Return encrypted version
    const encrypted = activities.map((a) => ({
      ...a,
      detail_encrypted: encryptText(a.detail),
      detail: a.detail,
    }));
    return Response.json(encrypted);
  }

  if (action === "summary") {
    const activities = (await store.get("activities", { type: "json" })) || [];
    return Response.json({
      activityCount: activities.length,
      lastActivity: activities[0] || null,
    });
  }

  return Response.json({ error: "Not found" }, { status: 404 });
};

export const config = {
  path: "/api/admin",
};
