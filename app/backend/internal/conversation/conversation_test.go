package conversation_test

import (
	"errors"
	"strings"
	"testing"

	"sys-helper/backend/internal/conversation"
)

func TestCleanUserMessage(t *testing.T) {
	if got, err := conversation.CleanUserMessage("  hi \n"); err != nil || got != "hi" {
		t.Errorf("CleanUserMessage = %q, %v", got, err)
	}
	// Postgres can't store NUL.
	for _, bad := range []string{"", "  ", strings.Repeat("x", conversation.MaxUserMessage+1), "hi\x00"} {
		if _, err := conversation.CleanUserMessage(bad); !errors.Is(err, conversation.ErrInvalidMessage) {
			t.Errorf("CleanUserMessage(%.20q): err = %v, want ErrInvalidMessage", bad, err)
		}
	}
}

func TestCapReply(t *testing.T) {
	if got := conversation.CapReply("short"); got != "short" {
		t.Errorf("CapReply(short) = %q", got)
	}
	long := conversation.CapReply(strings.Repeat("x", conversation.MaxReply+10))
	if n := len([]rune(long)); n > conversation.MaxReply || !strings.HasSuffix(long, "[reply truncated]") {
		t.Errorf("capped reply: %d characters, ends %q", n, long[len(long)-20:])
	}
	// A model's NUL would make the reply unsavable, losing a reply that was paid for.
	if got := conversation.CapReply("a\x00b"); got != "ab" {
		t.Errorf("CapReply drops NUL: got %q", got)
	}
}
