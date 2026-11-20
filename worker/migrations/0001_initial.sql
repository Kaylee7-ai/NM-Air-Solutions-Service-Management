PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY,
 email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 full_name TEXT NOT NULL,
 phone TEXT,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('owner','manager','technician')),
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS service_requests (
 id TEXT PRIMARY KEY,
 customer_name TEXT NOT NULL,
 customer_phone TEXT NOT NULL,
 service_type TEXT NOT NULL,
 location TEXT NOT NULL,
 preferred_date TEXT,
 ac_type TEXT,
 details TEXT,
 status TEXT NOT NULL DEFAULT 'New' CHECK(status IN ('New','Assigned','In progress','Awaiting parts','Completed','Cancelled')),
 assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_requests_status ON service_requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_date ON service_requests(preferred_date);
CREATE INDEX IF NOT EXISTS idx_requests_phone ON service_requests(customer_phone);
CREATE INDEX IF NOT EXISTS idx_requests_created ON service_requests(created_at DESC);

CREATE TABLE IF NOT EXISTS activity_log (
 id TEXT PRIMARY KEY,
 request_id TEXT REFERENCES service_requests(id) ON DELETE CASCADE,
 actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 action TEXT NOT NULL,
 note TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_request ON activity_log(request_id, created_at);

CREATE TABLE IF NOT EXISTS quotes (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
 amount_minor INTEGER NOT NULL CHECK(amount_minor >= 0),
 currency TEXT NOT NULL DEFAULT 'GHS',
 description TEXT,
 status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Sent','Accepted','Declined','Expired')),
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_quotes_request ON quotes(request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS invoices (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
 quote_id TEXT REFERENCES quotes(id) ON DELETE SET NULL,
 amount_minor INTEGER NOT NULL CHECK(amount_minor >= 0),
 currency TEXT NOT NULL DEFAULT 'GHS',
 status TEXT NOT NULL DEFAULT 'Unpaid' CHECK(status IN ('Unpaid','Partially paid','Paid','Void')),
 due_date TEXT,
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_invoices_request ON invoices(request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS system_settings (
 setting_key TEXT PRIMARY KEY,
 setting_value TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS login_attempts (
 id TEXT PRIMARY KEY,
 email TEXT NOT NULL,
 attempted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 successful INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time ON login_attempts(email, attempted_at);
