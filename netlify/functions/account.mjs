import { getStore } from "@netlify/blobs";

const SEED_TRANSACTIONS = [
  {
    id: "txn_001",
    type: "deposit",
    description: "Initial Deposit",
    from: "Margaret Stannard",
    amount: 100000.0,
    date: "2026-03-30T09:00:00Z",
    category: "deposit",
    reference: "Opening deposit",
  },
];

const SEED_ACCOUNT = {
  holder: "Margaret Stannard",
  iban: "GB76 REVO 0099 7048 7060 94",
  bic: "REVOGB21",
  correspondentBic: "CHASGB2L",
  sortCode: "00-99-70",
  accountNumber: "48706094",
  type: "Personal Current Account",
  balance: 100000.0,
  currency: "GBP",
  opened: "2026-03-30",
  bank: "Revolut Ltd",
  address: "30 South Colonnade, E14 5HX, London, United Kingdom",
};

const DATA_VERSION = "v2";

async function initIfNeeded(store) {
  const version = await store.get("data_version");
  if (version !== DATA_VERSION) {
    await store.setJSON("account", SEED_ACCOUNT);
    await store.setJSON("transactions", SEED_TRANSACTIONS);
    await store.setJSON("activities", [
      { id: "act_001", action: "account_created", detail: "Account opened for Margaret Stannard", timestamp: "2026-03-30T09:00:00Z" },
      { id: "act_002", action: "deposit", detail: "Initial deposit of £100,000.00", timestamp: "2026-03-30T09:00:00Z" },
    ]);
    await store.set("data_version", DATA_VERSION);
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
    const { recipient, amount, reference, recipientIban } = body;

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
      recipientIban: recipientIban || "",
      date: new Date().toISOString(),
      category: "transfer",
    };
    transactions.unshift(newTxn);
    await store.setJSON("transactions", transactions);

    await logActivity(store, "transfer", `Transfer of £${amount.toFixed(2)} to ${recipient}`);

    return Response.json({ success: true, balance: account.balance, transaction: newTxn });
  }

  if (req.method === "POST" && action === "receive") {
    const body = await req.json();
    const { sender, amount, reference } = body;

    if (!sender || !amount || amount <= 0) {
      return Response.json({ error: "Invalid payment details" }, { status: 400 });
    }

    const account = await store.get("account", { type: "json" });
    account.balance = Math.round((account.balance + amount) * 100) / 100;
    await store.setJSON("account", account);

    const transactions = (await store.get("transactions", { type: "json" })) || [];
    const newTxn = {
      id: `txn_${Date.now()}`,
      type: "deposit",
      description: `Payment from ${sender}`,
      from: sender,
      amount: amount,
      reference: reference || "",
      date: new Date().toISOString(),
      category: "deposit",
    };
    transactions.unshift(newTxn);
    await store.setJSON("transactions", transactions);

    await logActivity(store, "deposit", `Received £${amount.toFixed(2)} from ${sender}`);

    return Response.json({ success: true, balance: account.balance, transaction: newTxn });
  }

  return Response.json({ error: "Not found" }, { status: 404 });
};

export const config = {
  path: "/api/account",
};
