package llm

import (
	"context"
	"errors"
	"fmt"
	"iter"
	"log/slog"
	"net/http"
	"slices"
	"time"
)

// ErrExhausted means no model could answer: every one tried failed or was slow to start, the
// account's free quota is used up, or OpenRouter refused the key.
var ErrExhausted = errors.New("every free model is busy or failing")

// Chain streams from the first of several models that starts answering. It moves on to the next
// model when one fails, answers nothing, or sends nothing within FirstEventTimeout, and demotes
// it. Once a model has started answering it is never abandoned, so a reply never mixes two
// models. Each event names the model that produced it.
type Chain struct {
	Models interface {
		Models() []string // best first
		Demote(model string, period time.Duration)
	}
	// Client builds the ChatModel for a model id.
	Client            func(model string) ChatModel
	FirstEventTimeout time.Duration
	// MaxAttempts caps the models tried per Stream; 0 means all of them.
	MaxAttempts int
	// Budget, if set, is spent before every attempt (each one is a request against the account's
	// quota). Its error ends the Stream.
	Budget func(ctx context.Context) error
}

// errEmpty and errSlow say why a model was passed over before it started answering.
var (
	errEmpty = errors.New("empty reply")
	errSlow  = errors.New("no answer before the first-token timeout")
)

func (c *Chain) Stream(ctx context.Context, req Request) iter.Seq2[Event, error] {
	return func(yield func(Event, error) bool) {
		// Models the request avoids (e.g. one whose Proposal was just invalid) go last.
		models := c.Models.Models()
		slices.SortStableFunc(models, func(a, b string) int {
			return boolToInt(slices.Contains(req.Avoid, a)) - boolToInt(slices.Contains(req.Avoid, b))
		})
		if c.MaxAttempts > 0 && len(models) > c.MaxAttempts {
			models = models[:c.MaxAttempts]
		}
		var last error
		for _, model := range models {
			if c.Budget != nil {
				if err := c.Budget(ctx); err != nil {
					yield(Event{}, err)
					return
				}
			}
			started, err := c.try(ctx, model, req, yield)
			if started {
				return
			}
			if ctxErr := ctx.Err(); ctxErr != nil {
				yield(Event{}, ctxErr)
				return
			}
			if stopsEveryModel(err) {
				slog.ErrorContext(ctx, "no free model can answer", "error", err)
				yield(Event{}, fmt.Errorf("%w: %w", ErrExhausted, err))
				return
			}
			slog.WarnContext(ctx, "model failed before answering, trying the next", "model", model, "error", err)
			period := DemotionPeriod
			if httpErr := (*HTTPError)(nil); errors.As(err, &httpErr) && httpErr.Gated() {
				period = GatedDemotionPeriod
			}
			c.Models.Demote(model, period)
			last = err
		}
		if last == nil {
			yield(Event{}, fmt.Errorf("%w: no free models are available", ErrExhausted))
			return
		}
		yield(Event{}, fmt.Errorf("%w (last: %w)", ErrExhausted, last))
	}
}

type result struct {
	ev  Event
	err error
}

// try streams model to yield if it starts answering in time (started is true even if it fails
// later). Otherwise it stops the model and says why it was passed over.
func (c *Chain) try(ctx context.Context, model string, req Request, yield func(Event, error) bool) (started bool, err error) {
	mctx, cancel := context.WithCancel(ctx)
	defer cancel()

	// Run the model in the background so its first event can be awaited with a timeout.
	results := make(chan result)
	go func() {
		defer close(results)
		for ev, err := range c.Client(model).Stream(mctx, req) {
			select {
			case results <- result{ev, err}:
			case <-mctx.Done():
				return
			}
			if err != nil {
				return
			}
		}
	}()

	var timeout <-chan time.Time
	if c.FirstEventTimeout > 0 {
		timer := time.NewTimer(c.FirstEventTimeout)
		defer timer.Stop()
		timeout = timer.C
	}
	select {
	case first, ok := <-results:
		switch {
		case !ok:
			return false, errEmpty
		case first.err != nil:
			return false, first.err
		}
		first.ev.Model = model
		if !yield(first.ev, nil) {
			return true, nil
		}
		for r := range results {
			r.ev.Model = model
			if !yield(r.ev, r.err) || r.err != nil {
				return true, nil
			}
		}
		// A cancelled stream can end without reporting it; the reply is cut, not complete.
		if err := ctx.Err(); err != nil {
			yield(Event{}, err)
		}
		return true, nil
	case <-timeout:
		return false, errSlow
	case <-ctx.Done():
		return false, ctx.Err()
	}
}

// stopsEveryModel says whether err would fail on any model: the account's free quota is used up,
// or the key is refused (401) or out of credit (402).
func stopsEveryModel(err error) bool {
	var httpErr *HTTPError
	if !errors.As(err, &httpErr) {
		return false
	}
	return httpErr.AccountLimited || httpErr.Status == http.StatusUnauthorized || httpErr.Status == http.StatusPaymentRequired
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
