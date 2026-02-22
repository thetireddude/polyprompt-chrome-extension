"use client";

const LOCAL_DEV_USER = {
  id: "local-dev-user",
  email: "local@eventsnap.dev",
  app_metadata: {
    provider: "google",
    providers: ["google"]
  },
  user_metadata: {
    display_name: "Local User",
    avatar_url: ""
  }
};

const SESSION_STORAGE_KEY = "eventsnap_local_session";
const authListeners = new Set();

function nowIso() {
  return new Date().toISOString();
}

function buildSession(user = LOCAL_DEV_USER) {
  return {
    access_token: "local-dev-access-token",
    token_type: "bearer",
    expires_at: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    user
  };
}

function readStoredSession() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_err) {
    return null;
  }
}

function persistSession(session) {
  if (typeof window === "undefined") return;

  if (!session) {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function notifyAuthListeners(event, session) {
  authListeners.forEach((cb) => cb(event, session));
}

function buildError(message) {
  return { message };
}

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch (_err) {
    return {};
  }
}

async function requestLocal(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const json = await parseJsonSafe(response);
  if (!response.ok || json?.ok === false) {
    const msg = json?.error || `Request failed (${response.status})`;
    return { data: null, error: buildError(msg) };
  }

  return { data: json?.data ?? null, error: null };
}

function applySelectFields(row, fields) {
  if (!row || !fields || fields === "*") return row;

  const keys = fields
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  const picked = {};
  keys.forEach((key) => {
    picked[key] = row[key] ?? null;
  });
  return picked;
}

function finalizeResult(data, error, { expectSingle = false, expectMaybeSingle = false, selectFields = "*" } = {}) {
  if (error) return { data: null, error };

  if (expectSingle) {
    if (!data) return { data: null, error: buildError("Row not found.") };
    return { data: applySelectFields(data, selectFields), error: null };
  }

  if (expectMaybeSingle) {
    return { data: data ? applySelectFields(data, selectFields) : null, error: null };
  }

  if (Array.isArray(data)) {
    return { data: data.map((item) => applySelectFields(item, selectFields)), error: null };
  }

  return { data: applySelectFields(data, selectFields), error: null };
}

class LocalQueryBuilder {
  constructor(table) {
    this.table = table;
    this.action = "select";
    this.selectFields = "*";
    this.eqFilters = [];
    this.isFilters = [];
    this.orderBy = null;
    this.rows = null;
    this.values = null;
    this.expectSingle = false;
    this.expectMaybeSingle = false;
    this.promise = null;
  }

  select(fields = "*") {
    this.selectFields = fields;
    return this;
  }

  insert(rows) {
    this.action = "insert";
    this.rows = rows;
    return this;
  }

  update(values) {
    this.action = "update";
    this.values = values;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  upsert(values) {
    this.action = "upsert";
    this.values = values;
    return this.execute();
  }

  eq(field, value) {
    this.eqFilters.push({ field, value });
    return this;
  }

  is(field, value) {
    this.isFilters.push({ field, value });
    return this;
  }

  order(field, { ascending = true } = {}) {
    this.orderBy = { field, ascending };
    return this.execute();
  }

  single() {
    this.expectSingle = true;
    return this.execute();
  }

  maybeSingle() {
    this.expectMaybeSingle = true;
    return this.execute();
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  execute() {
    if (!this.promise) {
      this.promise = this.run();
    }
    return this.promise;
  }

  async run() {
    let result;

    if (this.table === "events") {
      result = await this.runEvents();
    } else if (this.table === "profiles") {
      result = await this.runProfiles();
    } else if (this.table === "extension_tokens") {
      result = await this.runTokens();
    } else {
      result = { data: null, error: buildError(`Unsupported table: ${this.table}`) };
    }

    return finalizeResult(result.data, result.error, {
      expectSingle: this.expectSingle,
      expectMaybeSingle: this.expectMaybeSingle,
      selectFields: this.selectFields
    });
  }

  getEq(field) {
    const filter = this.eqFilters.find((entry) => entry.field === field);
    return filter ? filter.value : null;
  }

  getIs(field) {
    const filter = this.isFilters.find((entry) => entry.field === field);
    return filter ? filter.value : null;
  }

  async runEvents() {
    const id = this.getEq("id");

    if (this.action === "select") {
      if (id) {
        return requestLocal(`/api/local/events/${id}`, { method: "GET" });
      }

      const listResult = await requestLocal("/api/local/events", { method: "GET" });
      if (listResult.error || !this.orderBy) return listResult;

      const data = Array.isArray(listResult.data) ? [...listResult.data] : [];
      const { field, ascending } = this.orderBy;
      data.sort((a, b) => {
        const left = new Date(a?.[field] || 0).getTime();
        const right = new Date(b?.[field] || 0).getTime();
        return ascending ? left - right : right - left;
      });

      return { data, error: null };
    }

    if (this.action === "insert") {
      return { data: null, error: buildError("Manual dashboard event creation is disabled.") };
    }

    if (this.action === "update") {
      if (!id) return { data: null, error: buildError("Update requires eq('id', ...).") };

      return requestLocal(`/api/local/events/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ values: this.values || {} })
      });
    }

    if (this.action === "delete") {
      if (!id) return { data: null, error: buildError("Delete requires eq('id', ...).") };

      return requestLocal(`/api/local/events/${id}`, { method: "DELETE" });
    }

    return { data: null, error: buildError(`Unsupported events action: ${this.action}`) };
  }

  async runProfiles() {
    if (this.action === "select") {
      const userId = this.getEq("id");
      if (userId && userId !== LOCAL_DEV_USER.id) {
        return { data: null, error: null };
      }
      return requestLocal("/api/local/profile", { method: "GET" });
    }

    if (this.action === "upsert") {
      return requestLocal("/api/local/profile", {
        method: "PUT",
        body: JSON.stringify({ profile: this.values || {} })
      });
    }

    return { data: null, error: buildError(`Unsupported profiles action: ${this.action}`) };
  }

  async runTokens() {
    if (this.action === "select") {
      const listResult = await requestLocal("/api/local/tokens", { method: "GET" });
      if (listResult.error || !this.orderBy) return listResult;

      const data = Array.isArray(listResult.data) ? [...listResult.data] : [];
      const { field, ascending } = this.orderBy;
      data.sort((a, b) => {
        const left = new Date(a?.[field] || 0).getTime();
        const right = new Date(b?.[field] || 0).getTime();
        return ascending ? left - right : right - left;
      });

      return { data, error: null };
    }

    if (this.action === "insert") {
      return requestLocal("/api/local/tokens", {
        method: "POST",
        body: JSON.stringify({ rows: this.rows || [] })
      });
    }

    if (this.action === "update") {
      const id = this.getEq("id");
      if (!id) return { data: null, error: buildError("Update requires eq('id', ...).") };

      return requestLocal(`/api/local/tokens/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          values: this.values || {},
          require_not_revoked: this.getIs("revoked_at") === null
        })
      });
    }

    return { data: null, error: buildError(`Unsupported tokens action: ${this.action}`) };
  }
}

export function createLocalClient() {
  return {
    auth: {
      async getSession() {
        let session = readStoredSession();
        if (!session) {
          session = buildSession();
          persistSession(session);
        }

        return { data: { session }, error: null };
      },
      onAuthStateChange(callback) {
        authListeners.add(callback);
        return {
          data: {
            subscription: {
              unsubscribe: () => authListeners.delete(callback)
            }
          }
        };
      },
      async signInWithOAuth() {
        const session = buildSession();
        persistSession(session);
        notifyAuthListeners("SIGNED_IN", session);
        return { data: { session, url: null }, error: null };
      },
      async exchangeCodeForSession() {
        const session = buildSession();
        persistSession(session);
        notifyAuthListeners("SIGNED_IN", session);
        return { data: { session }, error: null };
      },
      async updateUser({ data } = {}) {
        const existingSession = readStoredSession() || buildSession();
        const currentUser = existingSession?.user || LOCAL_DEV_USER;
        const nextUser = {
          ...currentUser,
          user_metadata: {
            ...(currentUser.user_metadata || {}),
            ...(data || {})
          }
        };

        const nextSession = {
          ...existingSession,
          user: nextUser
        };

        persistSession(nextSession);
        notifyAuthListeners("USER_UPDATED", nextSession);
        return { data: { user: nextUser }, error: null };
      },
      async signOut() {
        persistSession(null);
        notifyAuthListeners("SIGNED_OUT", null);
        return { error: null };
      }
    },
    from(table) {
      return new LocalQueryBuilder(table);
    },
    _meta: {
      mode: "local-dev",
      booted_at: nowIso()
    }
  };
}
