-- =============================================================================
-- Migration 0005: Central Users Table for Mobile & Portal Users
-- Stores Google / Apple profiles and user account state
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_id VARCHAR(128) UNIQUE,
    apple_id VARCHAR(128) UNIQUE,
    email VARCHAR(255) UNIQUE NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    provider VARCHAR(32) NOT NULL DEFAULT 'google' CHECK (provider IN ('google', 'apple', 'email')),
    role VARCHAR(32) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'pharmacy', 'pharmacist', 'superadmin')),
    phone VARCHAR(32),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    raw_profile JSONB,
    last_login_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON public.users (google_id);
CREATE INDEX IF NOT EXISTS idx_users_apple_id ON public.users (apple_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users (role);

-- Grant privileges to application user
GRANT ALL ON TABLE public.users TO xpharma_user;
