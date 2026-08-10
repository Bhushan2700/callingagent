import os
import sys
import psycopg2

conn = psycopg2.connect(os.environ["DB"])
cur = conn.cursor()
cur.execute(
    """
    INSERT INTO pending_verifications (email, otp_hash, name, password_hash, purpose, expires_at)
    VALUES ('bp28878@gmail.com', %s, 'Test User', '', 'password_reset', NOW() + INTERVAL '15 minutes')
    ON CONFLICT (email) DO UPDATE SET otp_hash=EXCLUDED.otp_hash, name=EXCLUDED.name,
        purpose='password_reset', expires_at=EXCLUDED.expires_at, attempts=0
    """,
    (sys.argv[1],),
)
conn.commit()
cur.close()
conn.close()
print("SEEDED")