package db

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type TenantRouter struct {
	pool        *pgxpool.Pool
	schemaCache sync.Map // tenantID (string) -> schemaName (string)
}

func NewTenantRouter(databaseURL string) (*TenantRouter, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("invalid database URL: %w", err)
	}

	config.MaxConns = 25
	config.MinConns = 5
	config.MaxConnIdleTime = 5 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("failed to create db pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return &TenantRouter{pool: pool}, nil
}

func (r *TenantRouter) Pool() *pgxpool.Pool {
	return r.pool
}

// GetSchemaName resolves the isolated schema name for a given tenant ID
func (r *TenantRouter) GetSchemaName(ctx context.Context, tenantID string) (string, error) {
	if val, ok := r.schemaCache.Load(tenantID); ok {
		return val.(string), nil
	}

	var schemaName string
	query := `SELECT schema_name FROM public.tenants WHERE id = $1 AND status = 'active'`
	err := r.pool.QueryRow(ctx, query, tenantID).Scan(&schemaName)
	if err != nil {
		return "", fmt.Errorf("tenant %s not found or inactive: %w", tenantID, err)
	}

	r.schemaCache.Store(tenantID, schemaName)
	return schemaName, nil
}

// ExecInTenant runs a callback within the tenant's isolated schema context
func (r *TenantRouter) ExecInTenant(ctx context.Context, tenantID string, fn func(ctx context.Context, schema string, conn *pgxpool.Conn) error) error {
	schema, err := r.GetSchemaName(ctx, tenantID)
	if err != nil {
		return err
	}

	conn, err := r.pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("failed to acquire conn: %w", err)
	}
	defer conn.Release()

	// Set search path to isolate queries to tenant schema
	setPathQuery := fmt.Sprintf("SET search_path TO %s, public", schema)
	if _, err := conn.Exec(ctx, setPathQuery); err != nil {
		return fmt.Errorf("failed to set search_path: %w", err)
	}

	return fn(ctx, schema, conn)
}

func (r *TenantRouter) Close() {
	r.pool.Close()
}
