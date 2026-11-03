package main

import (
	"log"
	"os"

	"sheetlab/backend/internal/api"
	"sheetlab/backend/internal/store"
)

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func main() {
	dbPath := env("DB_PATH", "data/sheetlab.db")
	staticDir := env("STATIC_DIR", "../frontend/dist")
	port := env("PORT", "8080")

	st, err := store.Open(dbPath)
	if err != nil {
		log.Fatalf("无法初始化数据库: %v", err)
	}
	defer st.Close()

	router := api.NewRouter(st, staticDir)
	log.Printf("SheetLab 已启动: http://localhost:%s  (数据库: %s)", port, dbPath)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("服务启动失败: %v", err)
	}
}
