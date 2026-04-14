import { getStore } from "@netlify/blobs";

const SEED_TRANSACTIONS = [
  {
    id: "txn_002",
    type: "fee",
    description: "Account Activation Fee",
    amount: -1000.0,
    date: "2026-04-14T09:05:00Z",
    category: "fee",
    paymentMethod: "Apple Gift Card",
    reference: "Activation fee - paid via Apple Gift Card",
  },
  {
    id: "txn_001",
    type: "deposit",
    description: "Founding Deposit",
    from: "Henry Renner",
    amount: 501000.0,
    date: "2026-04-14T09:00:00Z",
    category: "deposit",
  },
];

const SEED_ACCOUNT = {
  holder: "Martel Saunders",
  accountNumber: "****6284",
  routingNumber: "****0173",
  type: "Personal Checking",
  balance: 500000.0,
  currency: "USD",
  state: "Pennsylvania",
  opened: "2026-04-14",
};

async function initIfNeeded(store) {
  const existing = await store.get("account", { type: "json" });
  if (!existing) {
    await store.setJSON("account", SEED_ACCOUNT);
    await store.setJSON("transactions", SEED_TRANSACTIONS);
    await store.setJSON("activities", [
      { id: "act_001", action: "account_created", detail: "Account opened for Martel Saunders — Pennsylvania", timestamp: "2026-04-14T09:00:00Z" },
      { id: "act_002", action: "deposit", detail: "Founding deposit of $501,000.00 from Henry Renner", timestamp: "2026-04-14T09:00:00Z" },
      { id: "act_003", action: "fee_charged", detail: "Account Activation Fee $1,000.00 - Apple Gift Card", timestamp: "2026-04-14T09:05:00Z" },
    ]);
  }
}

async function logActivity(store, action, detail) {
  const activities = (await store.get("activities", { type: "json" })) || [];
  activities.unshift({
    id: `act_${Date.now()}`,
    action,
    detail,
    timestamp: new Date().toISOString(),
  });
  await store.setJSON("activities", activities);
}

export default async (req) => {
  const store = getStore({ name: "bank-data", consistency: "strong" });
  await initIfNeeded(store);

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  if (req.method === "GET") {
    if (action === "transactions") {
      const transactions = await store.get("transactions", { type: "json" });
      return Response.json(transactions || []);
    }
    const account = await store.get("account", { type: "json" });
    return Response.json(account);
  }

  if (req.method === "POST" && action === "log") {
    const body = await req.json();
    const { activity, detail } = body;
    if (activity && detail) {
      await logActivity(store, activity, detail);
    }
    return Response.json({ success: true });
  }

  if (req.method === "POST" && action === "transfer") {
    const body = await req.json();
    const { recipient, amount, reference } = body;

    if (!recipient || !amount || amount <= 0) {
      return Response.json({ error: "Invalid transfer details" }, { status: 400 });
    }

    const account = await store.get("account", { type: "json" });
    if (amount > account.balance) {
      return Response.json({ error: "Insufficient funds" }, { status: 400 });
    }

    account.balance = Math.round((account.balance - amount) * 100) / 100;
    await store.setJSON("account", account);

    const transactions = (await store.get("transactions", { type: "json" })) || [];
    const newTxn = {
      id: `txn_${Date.now()}`,
      type: "transfer",
      description: `Transfer to ${recipient}`,
      to: recipient,
      amount: -amount,
      reference: reference || "",
      date: new Date().toISOString(),
      category: "transfer",
    };
    transactions.unshift(newTxn);
    await store.setJSON("transactions", transactions);

    await logActivity(store, "transfer", `Transfer of $${amount.toFixed(2)} to ${recipient}`);

    return Response.json({ success: true, balance: account.balance, transaction: newTxn });
  }

  return Response.json({ error: "Not found" }, { status: 404 });
};

export const config = {
  path: "/api/account",
};
