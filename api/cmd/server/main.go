package main

import (
	"context"
	"log"
	"net/http"

	"devcx/internal/config"
	"devcx/internal/db"
	"devcx/internal/httpx"
)

func main() {
	cfg := config.Load()
	ctx := context.Background()
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal(err)
	}
	if err := db.MigrateUp(ctx, pool); err != nil {
		log.Fatal(err)
	}
	srv := httpx.NewServer(httpx.Deps{Pool: pool, Cfg: cfg})
	log.Printf("devcx api listening on %s", cfg.Addr)
	log.Fatal(http.ListenAndServe(cfg.Addr, srv))
}
