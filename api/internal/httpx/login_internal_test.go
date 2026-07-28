package httpx

import "testing"

// TestDecideLoginOutcomeRequiresRealHash is a differential regression test for the
// dummy-hash bypass (blocking item 1). A black-box HTTP test that only tries
// "plausible" passwords against a NULL-password_hash account can't actually prove
// the fix: it can't know dummyPasswordHash's plaintext (a bcrypt hash of a discarded
// random value — infeasible to recover even for us), so a guess that doesn't happen
// to match it would return 401 under the OLD buggy code too, making that test pass
// vacuously either way. This test instead exercises decideLoginOutcome directly with
// match forced to true — standing in for "the caller somehow supplied a password
// that equals the dummy hash's plaintext" — which is exactly the scenario the old
// `!match || uid == ""` formula got wrong for accounts with hasRealHash == false.
func TestDecideLoginOutcomeRequiresRealHash(t *testing.T) {
	cases := []struct {
		name        string
		hasRealHash bool
		match       bool
		want        bool
	}{
		{"no real hash, guess happens to match dummy plaintext -> must still reject", false, true, false},
		{"no real hash, guess does not match -> reject", false, false, false},
		{"real hash, correct password -> allow", true, true, true},
		{"real hash, wrong password -> reject", true, false, false},
	}
	for _, c := range cases {
		if got := decideLoginOutcome(c.hasRealHash, c.match); got != c.want {
			t.Errorf("%s: decideLoginOutcome(%v, %v) = %v, want %v",
				c.name, c.hasRealHash, c.match, got, c.want)
		}
	}
}
