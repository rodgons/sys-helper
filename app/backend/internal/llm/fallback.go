package llm

import (
	"context"
	"iter"
	"log/slog"
	"time"
)

// Fallback streams from Primary, but switches to Secondary when Primary produces nothing within
// FirstEventTimeout or fails before producing anything. Once Primary has started answering it is
// never abandoned, so a reply never mixes two models.
type Fallback struct {
	Primary, Secondary ChatModel
	FirstEventTimeout  time.Duration
}

type result struct {
	ev  Event
	err error
}

func (f Fallback) Stream(ctx context.Context, req Request) iter.Seq2[Event, error] {
	return func(yield func(Event, error) bool) {
		pctx, cancel := context.WithCancel(ctx)
		defer cancel()

		// Run the primary in the background so its first event can be awaited with a timeout.
		results := make(chan result)
		go func() {
			defer close(results)
			for ev, err := range f.Primary.Stream(pctx, req) {
				select {
				case results <- result{ev, err}:
				case <-pctx.Done():
					return
				}
				if err != nil {
					return
				}
			}
		}()

		timer := time.NewTimer(f.FirstEventTimeout)
		defer timer.Stop()
		select {
		case first, ok := <-results:
			if ok && first.err == nil {
				if !yield(first.ev, nil) {
					return
				}
				for r := range results {
					if !yield(r.ev, r.err) || r.err != nil {
						return
					}
				}
				return
			}
			if !ok {
				return // the primary finished with an empty reply
			}
			slog.WarnContext(ctx, "primary model failed, falling back", "error", first.err)
		case <-timer.C:
			slog.WarnContext(ctx, "primary model too slow, falling back", "timeout", f.FirstEventTimeout)
		case <-ctx.Done():
			yield(Event{}, ctx.Err())
			return
		}
		cancel()
		for ev, err := range f.Secondary.Stream(ctx, req) {
			if !yield(ev, err) || err != nil {
				return
			}
		}
	}
}
