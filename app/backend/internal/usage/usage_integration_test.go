//go:build integration

package usage_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"sys-helper/backend/internal/testdb"
	"sys-helper/backend/internal/usage"
)

func TestMeter(t *testing.T) {
	pool := testdb.Pool(t)
	ctx := context.Background()

	t.Run("allows calls up to the daily limit, per User", func(t *testing.T) {
		alice, bob := testdb.User(t, pool, "alice"), testdb.User(t, pool, "bob")
		meter := usage.NewMeter(pool, 2)

		for i := range 2 {
			if _, err := meter.Record(ctx, alice); err != nil {
				t.Fatalf("call %d: %v", i+1, err)
			}
		}
		if _, err := meter.Record(ctx, alice); !errors.Is(err, usage.ErrDailyLimit) {
			t.Fatalf("third call: err = %v, want ErrDailyLimit", err)
		}
		if _, err := meter.Record(ctx, bob); err != nil {
			t.Fatalf("another User: %v", err)
		}
	})

	t.Run("a refunded call no longer counts", func(t *testing.T) {
		user := testdb.User(t, pool, "refunded")
		meter := usage.NewMeter(pool, 1)

		call, err := meter.Record(ctx, user)
		if err != nil {
			t.Fatal(err)
		}
		if err := meter.Refund(ctx, call); err != nil {
			t.Fatalf("Refund: %v", err)
		}
		if _, err := meter.Record(ctx, user); err != nil {
			t.Errorf("after a refund: %v, want the call allowed", err)
		}
	})

	t.Run("concurrent calls never exceed the limit", func(t *testing.T) {
		user := testdb.User(t, pool, "racer")
		meter := usage.NewMeter(pool, 3)

		var wg sync.WaitGroup
		var mu sync.Mutex
		allowed := 0
		for range 10 {
			wg.Go(func() {
				if _, err := meter.Record(ctx, user); err == nil {
					mu.Lock()
					allowed++
					mu.Unlock()
				}
			})
		}
		wg.Wait()

		if allowed != 3 {
			t.Errorf("allowed %d calls, want 3", allowed)
		}
	})

	t.Run("records without a cap when the limit is 0", func(t *testing.T) {
		user := testdb.User(t, pool, "unlimited")
		meter := usage.NewMeter(pool, 0)

		for range 3 {
			if _, err := meter.Record(ctx, user); err != nil {
				t.Fatal(err)
			}
		}
		var n int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM ai_usage WHERE user_id = $1`, user).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n != 3 {
			t.Errorf("recorded %d calls, want 3", n)
		}
	})
}

func TestBudget(t *testing.T) {
	pool := testdb.Pool(t)
	ctx := context.Background()
	// Other tests share the database, so start each case from an empty day.
	reset := func(t *testing.T) {
		t.Helper()
		if _, err := pool.Exec(ctx, `DELETE FROM ai_requests`); err != nil {
			t.Fatal(err)
		}
	}

	t.Run("allows requests up to the daily limit, for everyone together", func(t *testing.T) {
		reset(t)
		budget := usage.NewBudget(pool, 2)

		for i := range 2 {
			if err := budget.Spend(ctx); err != nil {
				t.Fatalf("request %d: %v", i+1, err)
			}
		}
		err := budget.Spend(ctx)
		if !errors.Is(err, usage.ErrGlobalLimit) || !errors.Is(err, usage.ErrDailyLimit) {
			t.Fatalf("third request: err = %v, want ErrGlobalLimit (a daily limit)", err)
		}
	})

	t.Run("ignores requests from earlier days", func(t *testing.T) {
		reset(t)
		if _, err := pool.Exec(ctx, `INSERT INTO ai_requests (id, created_at) VALUES (gen_random_uuid(), now() - interval '1 day')`); err != nil {
			t.Fatal(err)
		}

		if err := usage.NewBudget(pool, 1).Spend(ctx); err != nil {
			t.Fatalf("err = %v, want yesterday's request not to count", err)
		}
	})

	t.Run("concurrent requests never exceed the limit", func(t *testing.T) {
		reset(t)
		budget := usage.NewBudget(pool, 3)

		var wg sync.WaitGroup
		var mu sync.Mutex
		allowed := 0
		for range 10 {
			wg.Go(func() {
				if err := budget.Spend(ctx); err == nil {
					mu.Lock()
					allowed++
					mu.Unlock()
				}
			})
		}
		wg.Wait()

		if allowed != 3 {
			t.Errorf("allowed %d requests, want 3", allowed)
		}
	})

	t.Run("records without a cap when the limit is 0", func(t *testing.T) {
		reset(t)
		budget := usage.NewBudget(pool, 0)

		for range 3 {
			if err := budget.Spend(ctx); err != nil {
				t.Fatal(err)
			}
		}
	})
}

func TestPrune(t *testing.T) {
	pool := testdb.Pool(t)
	ctx := context.Background()
	user := testdb.User(t, pool, "pruned")
	// Two old rows and one from today in each table.
	for _, age := range []string{"10 days", "8 days", "1 hour"} {
		if _, err := pool.Exec(ctx, `INSERT INTO ai_usage (id, user_id, created_at) VALUES (gen_random_uuid(), $1, now() - $2::interval)`, user, age); err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, `INSERT INTO ai_requests (id, created_at) VALUES (gen_random_uuid(), now() - $1::interval)`, age); err != nil {
			t.Fatal(err)
		}
	}
	var requestsBefore int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM ai_requests WHERE created_at > now() - interval '7 days'`).Scan(&requestsBefore); err != nil {
		t.Fatal(err)
	}

	if err := usage.Prune(ctx, pool, 7*24*time.Hour); err != nil {
		t.Fatalf("Prune: %v", err)
	}

	var usageLeft, oldRequests, requestsAfter int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM ai_usage WHERE user_id = $1`, user).Scan(&usageLeft)
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM ai_requests WHERE created_at <= now() - interval '7 days'`).Scan(&oldRequests)
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM ai_requests WHERE created_at > now() - interval '7 days'`).Scan(&requestsAfter)
	if usageLeft != 1 || oldRequests != 0 || requestsAfter != requestsBefore {
		t.Errorf("after Prune: %d usage rows (want 1), %d old requests (want 0), %d recent requests (want %d)",
			usageLeft, oldRequests, requestsAfter, requestsBefore)
	}
}
