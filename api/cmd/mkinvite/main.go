package main

import (
	"context"
	"flag"
	"fmt"
	"log"

	"devcx/internal/config"
	"devcx/internal/db"
	"devcx/internal/invite"
)

func main() {
	n := flag.Int("n", 1, "number of codes")
	uses := flag.Int("uses", 1, "max uses per code")
	note := flag.String("note", "", "batch note")
	flag.Parse()

	cfg := config.Load()
	ctx := context.Background()
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal(err)
	}
	if err := db.MigrateUp(ctx, pool); err != nil {
		log.Fatal(err)
	}
	codes, err := invite.Mint(ctx, pool, *n, *uses, *note)
	if err != nil {
		log.Fatal(err)
	}
	for _, c := range codes {
		fmt.Println(c)
	}
}
