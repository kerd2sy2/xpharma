-- Create user and configure xpharma_db
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'xpharma_user') THEN 
    CREATE USER xpharma_user WITH PASSWORD 'Xpharma_Secure_Db_2026'; 
  ELSE
    ALTER USER xpharma_user WITH PASSWORD 'Xpharma_Secure_Db_2026';
  END IF; 
END $$;

ALTER DATABASE xpharma_db OWNER TO xpharma_user;
GRANT ALL PRIVILEGES ON DATABASE xpharma_db TO xpharma_user;

\c xpharma_db

GRANT ALL ON SCHEMA public TO xpharma_user;
GRANT ALL ON SCHEMA tenant_template TO xpharma_user;
GRANT ALL ON ALL TABLES IN SCHEMA public TO xpharma_user;
GRANT ALL ON ALL TABLES IN SCHEMA tenant_template TO xpharma_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO xpharma_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA tenant_template TO xpharma_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO xpharma_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA tenant_template GRANT ALL ON TABLES TO xpharma_user;
