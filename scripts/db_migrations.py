import os
import psycopg2
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")


def get_conn():
    url = os.getenv("DATABASE_URL", "")
    if not url:
        print("DATABASE_URL not set")
        return None
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    if "?" not in url:
        url += "?sslmode=require"
    elif "sslmode" not in url:
        url += "&sslmode=require"
    return psycopg2.connect(url)


def run_migrations():
    conn = get_conn()
    if conn is None:
        print("Skipping migrations — no database URL")
        return

    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS tenants (
            id VARCHAR(36) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            assistant_id VARCHAR(255) DEFAULT '',
            plan VARCHAR(50) DEFAULT 'free',
            onboarding_complete BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    print("  ✓ tenants table")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS tickets (
            ticket_id VARCHAR(50) PRIMARY KEY,
            tenant_id VARCHAR(36) NOT NULL,
            name VARCHAR(255),
            email VARCHAR(255),
            phone VARCHAR(50),
            issue TEXT,
            status VARCHAR(20) DEFAULT 'open',
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_tickets_tenant ON tickets(tenant_id)")
    print("  ✓ tickets table")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS widget_configs (
            tenant_id VARCHAR(36) PRIMARY KEY,
            config JSONB NOT NULL DEFAULT '{}',
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """)
    print("  ✓ widget_configs table")

    try:
        cur.execute("ALTER TABLE loggix_knowledge ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36) DEFAULT ''")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_knowledge_tenant ON loggix_knowledge(tenant_id)")
        print("  ✓ loggix_knowledge.tenant_id column")
    except Exception as e:
        print(f"  - loggix_knowledge: {e}")

    conn.commit()
    cur.close()
    conn.close()
    print("Migrations complete!")


if __name__ == "__main__":
    run_migrations()
