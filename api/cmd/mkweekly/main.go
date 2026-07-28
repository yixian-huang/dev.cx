package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"

	"devcx/internal/config"
	"devcx/internal/db"
	"devcx/internal/httpx"
	"devcx/internal/weeklymail"
)

func main() {
	year := flag.Int("year", 0, "ISO year")
	week := flag.Int("week", 0, "ISO week (1-53)")
	title := flag.String("title", "", "issue title")
	notePath := flag.String("note", "", "path to editor note markdown file")
	publish := flag.Bool("publish", false, "assemble highlights and set published_at")
	noEmail := flag.Bool("no-email", false, "publish 后不发周报邮件")
	flag.Parse()

	if *year < 1 || *week < 1 || *week > 53 || *title == "" {
		log.Fatal("usage: mkweekly -year YYYY -week N -title TITLE [-note note.md] [-publish]")
	}

	noteProvided := *notePath != ""
	note := ""
	if noteProvided {
		b, err := os.ReadFile(*notePath)
		if err != nil {
			log.Fatalf("read note: %v", err)
		}
		note = string(b)
	}

	cfg := config.Load()
	ctx := context.Background()
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal(err)
	}
	if err := db.MigrateUp(ctx, pool); err != nil {
		log.Fatal(err)
	}

	// upsert title; note only when -note provided (else keep existing / default '')
	var exists bool
	if err := pool.QueryRow(ctx,
		`select exists(select 1 from weekly_issues where year=$1 and week=$2)`,
		*year, *week).Scan(&exists); err != nil {
		log.Fatal(err)
	}
	if !exists {
		if _, err := pool.Exec(ctx,
			`insert into weekly_issues (year, week, title, editor_note_md)
			 values ($1, $2, $3, $4)`,
			*year, *week, *title, note); err != nil {
			log.Fatal(err)
		}
	} else {
		if noteProvided {
			if _, err := pool.Exec(ctx,
				`update weekly_issues set title=$3, editor_note_md=$4
				 where year=$1 and week=$2`,
				*year, *week, *title, note); err != nil {
				log.Fatal(err)
			}
		} else {
			if _, err := pool.Exec(ctx,
				`update weekly_issues set title=$3 where year=$1 and week=$2`,
				*year, *week, *title); err != nil {
				log.Fatal(err)
			}
		}
	}

	status := "draft"
	if *publish {
		hs, err := httpx.AssembleHighlights(ctx, pool, *year, *week)
		if err != nil {
			log.Fatalf("assemble: %v", err)
		}
		raw, err := json.Marshal(hs)
		if err != nil {
			log.Fatal(err)
		}
		if _, err := pool.Exec(ctx,
			`update weekly_issues
			 set highlights=$3, published_at=now()
			 where year=$1 and week=$2`,
			*year, *week, raw); err != nil {
			log.Fatal(err)
		}
		if !*noEmail {
			baseURL := os.Getenv("BASE_URL")
			if baseURL == "" {
				baseURL = "https://dev.cx"
			}
			sent, err := weeklymail.SendIssue(ctx, pool, *year, *week, baseURL)
			if err != nil {
				log.Printf("weekly email skipped: %v", err)
			} else {
				fmt.Printf("weekly email sent to %d recipients\n", sent)
			}
		}
		status = fmt.Sprintf("published (%d highlights)", len(hs))
	}

	fmt.Printf("weekly %d-W%02d %q → %s\n", *year, *week, *title, status)
}
