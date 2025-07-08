package main

import (
	"encoding/json"
	"flag"
	"log"
	"marpo/internal/websocket"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
)

var addr = flag.String("addr", ":8080", "http service address")

// SPAのためのファイルサーバーハンドラー
func spaFileServer(root string) http.HandlerFunc {
	absRoot, err := filepath.Abs(root)
	if err != nil {
		log.Fatal(err)
	}

	fs := http.FileServer(http.Dir(absRoot))
	return func(w http.ResponseWriter, r *http.Request) {
		// APIエンドポイントとWebSocketは無視
		if strings.HasPrefix(r.URL.Path, "/ws/") || strings.HasPrefix(r.URL.Path, "/api/") {
			return
		}

		// パスの正規化
		path := filepath.Join(absRoot, r.URL.Path)
		path = filepath.Clean(path)

		// rootディレクトリ外へのアクセスを防ぐ
		if !strings.HasPrefix(path, absRoot) {
			log.Printf("Attempted directory traversal: %s", path)
			http.Error(w, "Invalid path", http.StatusBadRequest)
			return
		}

		// ファイルの存在確認
		info, err := os.Stat(path)
		if err != nil {
			// index.htmlを返す
			indexPath := filepath.Join(absRoot, "index.html")
			if _, err := os.Stat(indexPath); os.IsNotExist(err) {
				http.Error(w, "File not found", http.StatusNotFound)
				return
			}
			http.ServeFile(w, r, indexPath)
			return
		}

		// ディレクトリの場合はindex.htmlを確認
		if info.IsDir() {
			indexPath := filepath.Join(path, "index.html")
			if _, err := os.Stat(indexPath); os.IsNotExist(err) {
				http.Error(w, "Directory index not found", http.StatusNotFound)
				return
			}
			path = indexPath
		}

		fs.ServeHTTP(w, r)
	}
}

func main() {
	flag.Parse()

	// WebSocketハブの初期化と起動
	hub := websocket.NewHub()
	go hub.Run()

	// ルーターの設定
	r := mux.NewRouter()

	// WebSocketエンドポイント
	r.HandleFunc("/ws/{roomId}", func(w http.ResponseWriter, r *http.Request) {
		websocket.ServeWs(hub, w, r)
	})

	// APIエンドポイント
	r.HandleFunc("/api/files", handleGetFiles).Methods("GET")
	r.HandleFunc("/api/files", handleCreateFile).Methods("POST")
	r.HandleFunc("/api/files/{filename}", handleGetFile).Methods("GET")

	// 静的ファイルの提供
	staticDir := "./web/build"
	absStaticDir, err := filepath.Abs(staticDir)
	if err != nil {
		log.Fatal(err)
	}

	if _, err := os.Stat(absStaticDir); os.IsNotExist(err) {
		log.Printf("Warning: Static directory %s does not exist\n", absStaticDir)
		// 開発環境用のディレクトリを試す
		staticDir = "./web/public"
		absStaticDir, err = filepath.Abs(staticDir)
		if err != nil {
			log.Fatal(err)
		}
	}

	// 静的ファイルのルーティング
	r.PathPrefix("/static/").Handler(http.StripPrefix("/static/", http.FileServer(http.Dir(absStaticDir))))
	r.PathPrefix("/").Handler(spaFileServer(absStaticDir))

	// CORSの設定
	corsMiddleware := handlers.CORS(
		handlers.AllowedOrigins([]string{"*"}),
		handlers.AllowedMethods([]string{"GET", "POST", "OPTIONS"}),
		handlers.AllowedHeaders([]string{"Content-Type", "X-Requested-With"}),
	)

	// HTTPサーバーの起動
	server := &http.Server{
		Addr:    *addr,
		Handler: corsMiddleware(r),
	}

	log.Printf("Starting server on %s serving static files from %s\n", *addr, staticDir)
	if err := server.ListenAndServe(); err != nil {
		log.Fatal("ListenAndServe:", err)
	}
}

// ファイル一覧を取得するハンドラー
func handleGetFiles(w http.ResponseWriter, r *http.Request) {
	// storageディレクトリのパスを取得
	storageDir := "./storage"
	files, err := os.ReadDir(storageDir)
	if err != nil {
		// storageディレクトリが存在しない場合は作成
		if os.IsNotExist(err) {
			if err := os.MkdirAll(storageDir, 0755); err != nil {
				http.Error(w, "Failed to create storage directory", http.StatusInternalServerError)
				return
			}
			files = []os.DirEntry{} // 空の配列を返す
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	// Markdownファイルのみをフィルタリング
	var fileList []map[string]string
	for _, file := range files {
		if !file.IsDir() && strings.HasSuffix(file.Name(), ".md") {
			fileList = append(fileList, map[string]string{
				"name": file.Name(),
			})
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(fileList)
}

// 新規ファイルを作成するハンドラー
func handleCreateFile(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// ファイル名のバリデーション
	if !strings.HasSuffix(req.Name, ".md") {
		http.Error(w, "File must have .md extension", http.StatusBadRequest)
		return
	}

	// ファイルパスの作成
	filePath := filepath.Join("./storage", req.Name)

	// ファイルの作成
	if _, err := os.Stat(filePath); err == nil {
		http.Error(w, "File already exists", http.StatusConflict)
		return
	}

	file, err := os.Create(filePath)
	if err != nil {
		http.Error(w, "Failed to create file", http.StatusInternalServerError)
		return
	}
	defer file.Close()

	// 初期コンテンツの書き込み
	initialContent := "# " + strings.TrimSuffix(req.Name, ".md") + "\n\n"
	if _, err := file.WriteString(initialContent); err != nil {
		http.Error(w, "Failed to write initial content", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"name": req.Name,
	})
}

// ファイルを取得するハンドラー
func handleGetFile(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	filename := vars["filename"]

	filepath := path.Join("./storage", filename)
	content, err := os.ReadFile(filepath)
	if err != nil {
		if os.IsNotExist(err) {
			http.Error(w, "File not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/markdown")
	w.Write(content)
}

// ファイル名のバリデーション用ヘルパー関数
func isValidFilename(name string) bool {
	if name == "" || strings.Contains(name, "/") || strings.Contains(name, "\\") {
		return false
	}
	return true
}
