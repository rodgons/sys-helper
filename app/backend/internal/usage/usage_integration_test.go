//go:build integration

package usage_test

import (
	"context"
	"errors"
	"sync"
	"testing"

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
			if err := meter.Record(ctx, alice); err != nil {
				t.Fatalf("call %d: %v", i+1, err)
			}
		}
		if err := meter.Record(ctx, alice); !errors.Is(err, usage.ErrDailyLimit) {
			t.Fatalf("third call: err = %v, want ErrDailyLimit", err)
		}
		if err := meter.Record(ctx, bob); err != nil {
			t.Fatalf("another User: %v", err)
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
				if err := meter.Record(ctx, user); err == nil {
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
			if err := meter.Record(ctx, user); err != nil {
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
