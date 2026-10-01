package conversation

import (
	"context"

	"sys-helper/backend/internal/architecture"
)

// Reviews resolves Proposals. Accepting saves the Architecture the client built by applying the
// Proposal (and placing its new Components) together with marking it accepted, in one transaction.
type Reviews struct {
	Conversations *Store
	Architectures *architecture.Store
}

// Accept saves doc as the next Architecture version (if base is still current) and marks Proposal
// seq accepted. It returns the new version.
func (r Reviews) Accept(ctx context.Context, userID, suffix string, seq, base int, doc architecture.Document) (int, error) {
	return r.Architectures.SaveWith(ctx, userID, suffix, base, doc, Accept(seq))
}

func (r Reviews) Reject(ctx context.Context, userID, suffix string, seq int) error {
	return r.Conversations.Reject(ctx, userID, suffix, seq)
}
