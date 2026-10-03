package httpapi_test

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"sys-helper/backend/internal/httpapi"
)

// fakeAccounts records which Users were deleted.
type fakeAccounts struct {
	deleted []string
	err     error
}

func (f *fakeAccounts) Delete(_ context.Context, userID string) error {
	if f.err != nil {
		return f.err
	}
	f.deleted = append(f.deleted, userID)
	return nil
}

func TestDeleteAccount(t *testing.T) {
	t.Run("deletes the signed-in User and everything they own", func(t *testing.T) {
		accounts := &fakeAccounts{}
		deps := httpapi.Deps{DB: fakePinger{}, Auth: fakeAuth{octocat}, Allowlist: everyone, Accounts: accounts}

		rec := call(t, deps, http.MethodDelete, "/api/me", "")

		if rec.Code != http.StatusNoContent || len(accounts.deleted) != 1 || accounts.deleted[0] != octocat.ID {
			t.Fatalf("status = %d, deleted = %v", rec.Code, accounts.deleted)
		}
	})

	t.Run("answers 500 when the deletion fails", func(t *testing.T) {
		deps := httpapi.Deps{DB: fakePinger{}, Auth: fakeAuth{octocat}, Allowlist: everyone, Accounts: &fakeAccounts{err: errors.New("down")}}

		if rec := call(t, deps, http.MethodDelete, "/api/me", ""); rec.Code != http.StatusInternalServerError {
			t.Fatalf("status = %d, want 500", rec.Code)
		}
	})
}
