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

    for col, ddl in {
        "phone_number_id": "VARCHAR(255) DEFAULT ''",
        "phone_number": "VARCHAR(32) DEFAULT ''",
        "company_name": "VARCHAR(255) DEFAULT ''",
        "industry": "VARCHAR(120) DEFAULT ''",
        "description": "TEXT DEFAULT ''",
        "languages": "JSONB DEFAULT '[\"English\"]'",
        "timezone": "VARCHAR(64) DEFAULT 'UTC'",
        "business_hours": "VARCHAR(255) DEFAULT ''",
        "voice_id": "VARCHAR(255) DEFAULT ''",
        "greeting": "VARCHAR(500) DEFAULT ''",
        "tools_enabled": "JSONB DEFAULT '[\"search_knowledge\",\"raise_ticket\"]'",
    }.items():
        cur.execute(f"ALTER TABLE tenants ADD COLUMN IF NOT EXISTS {col} {ddl}")
    print("  ✓ tenants onboarding columns")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS pending_verifications (
            email VARCHAR(255) PRIMARY KEY,
            otp_hash VARCHAR(64) NOT NULL,
            name VARCHAR(255) NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            attempts INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW(),
            expires_at TIMESTAMP NOT NULL
        )
    """)
    print("  ✓ pending_verifications table")

    cur.execute("ALTER TABLE pending_verifications ADD COLUMN IF NOT EXISTS purpose VARCHAR(20) DEFAULT 'registration'")
    print("  ✓ pending_verifications.purpose column")

    cur.execute("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE")
    cur.execute("UPDATE tenants SET email_verified = TRUE WHERE assistant_id IS NOT NULL AND assistant_id != ''")
    cur.execute("UPDATE tenants SET onboarding_complete = TRUE WHERE assistant_id IS NOT NULL AND assistant_id != ''")
    print("  ✓ tenants.email_verified column")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS calls (
            id VARCHAR(50) PRIMARY KEY,
            tenant_id VARCHAR(36) NOT NULL,
            assistant_id VARCHAR(255) DEFAULT '',
            caller VARCHAR(255) DEFAULT '',
            phone VARCHAR(50) DEFAULT '',
            channel VARCHAR(20) DEFAULT 'phone',
            started_at TIMESTAMP,
            ended_at TIMESTAMP,
            duration_seconds INT DEFAULT 0,
            status VARCHAR(30) DEFAULT '',
            transcript JSONB DEFAULT '[]',
            summary TEXT DEFAULT '',
            intent VARCHAR(100) DEFAULT '',
            outcome VARCHAR(100) DEFAULT '',
            resolution_status VARCHAR(30) DEFAULT 'unresolved',
            resolution_reason TEXT DEFAULT '',
            resolved_by VARCHAR(30) DEFAULT '',
            recording_url TEXT DEFAULT '',
            costs JSONB DEFAULT '{}',
            raw JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_calls_tenant_started ON calls(tenant_id, started_at)")
    print("  ✓ calls table")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS conversations (
            id VARCHAR(50) PRIMARY KEY,
            tenant_id VARCHAR(36) NOT NULL,
            channel VARCHAR(20) DEFAULT 'chat',
            call_id VARCHAR(50) DEFAULT '',
            customer VARCHAR(255) DEFAULT '',
            summary TEXT DEFAULT '',
            intent VARCHAR(100) DEFAULT '',
            resolution_status VARCHAR(30) DEFAULT 'unresolved',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_conversations_tenant_created ON conversations(tenant_id, created_at)")
    print("  ✓ conversations table")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id VARCHAR(50) PRIMARY KEY,
            tenant_id VARCHAR(36) NOT NULL,
            conversation_id VARCHAR(50) NOT NULL,
            role VARCHAR(20) NOT NULL,
            content TEXT DEFAULT '',
            confidence FLOAT DEFAULT 0,
            resolved BOOLEAN DEFAULT FALSE,
            sources JSONB DEFAULT '[]',
            tools_used JSONB DEFAULT '[]',
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_messages_tenant ON messages(tenant_id)")
    print("  ✓ messages table")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS knowledge_gaps (
            id VARCHAR(50) PRIMARY KEY,
            tenant_id VARCHAR(36) NOT NULL,
            question TEXT NOT NULL,
            normalized_question TEXT NOT NULL,
            occurrence_count INT DEFAULT 1,
            confidence FLOAT DEFAULT 0,
            status VARCHAR(20) DEFAULT 'new',
            conversation_ids JSONB DEFAULT '[]',
            call_id VARCHAR(50) DEFAULT '',
            first_seen_at TIMESTAMP DEFAULT NOW(),
            last_seen_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_gaps_tenant ON knowledge_gaps(tenant_id)")
    print("  ✓ knowledge_gaps table")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS appointments (
            id VARCHAR(50) PRIMARY KEY,
            tenant_id VARCHAR(36) NOT NULL,
            cal_booking_id VARCHAR(100) DEFAULT '',
            customer_name VARCHAR(255) DEFAULT '',
            customer_email VARCHAR(255) DEFAULT '',
            customer_phone VARCHAR(50) DEFAULT '',
            start_time TIMESTAMP,
            end_time TIMESTAMP,
            timezone VARCHAR(64) DEFAULT 'UTC',
            event_type VARCHAR(100) DEFAULT '',
            status VARCHAR(30) DEFAULT 'confirmed',
            source VARCHAR(20) DEFAULT 'external',
            conversation_id VARCHAR(50) DEFAULT '',
            call_id VARCHAR(50) DEFAULT '',
            raw JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_appointments_tenant_start ON appointments(tenant_id, start_time)")
    print("  ✓ appointments table")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS assistant_versions (
            id VARCHAR(50) PRIMARY KEY,
            tenant_id VARCHAR(36) NOT NULL,
            status VARCHAR(20) DEFAULT 'draft',
            config JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW(),
            published_at TIMESTAMP
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_assistant_versions_tenant ON assistant_versions(tenant_id)")
    print("  ✓ assistant_versions table")

    conn.commit()
    cur.close()
    conn.close()
    print("Migrations complete!")


if __name__ == "__main__":
    run_migrations()
