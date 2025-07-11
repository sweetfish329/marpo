package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"flag"
	"html/template"
	"log"
	"marpo/internal/filehandlers" // パッケージ名を変更
	wsinternal "marpo/internal/websocket"
	"net"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	ghandlers "github.com/gorilla/handlers" // エイリアスを付与
	"github.com/gorilla/mux"
)

var addr = flag.String("addr", ":8080", "http service address")
var instanceID string

// 自身のIPv4アドレスを取得
func getLocalIPv4() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "localhost"
	}
	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() && ipnet.IP.To4() != nil {
			return ipnet.IP.String()
		}
	}
	return "localhost"
}

// SPAのためのファイルサーバーハンドラー
func spaFileServer(root string) http.HandlerFunc {
	absRoot, err := filepath.Abs(root)
	if err != nil {
		log.Fatal(err)
	}

	fs := http.FileServer(http.Dir(absRoot))
	return func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/ws/") || strings.HasPrefix(r.URL.Path, "/api/") {
			return
		}

		path := filepath.Join(absRoot, r.URL.Path)
		path = filepath.Clean(path)

		if !strings.HasPrefix(path, absRoot) {
			http.Error(w, "Invalid path", http.StatusBadRequest)
			return
		}

		indexPath := filepath.Join(absRoot, "index.html")
		if _, err := os.Stat(path); os.IsNotExist(err) {
			http.ServeFile(w, r, indexPath)
			return
		}

		if info, err := os.Stat(path); err == nil && info.IsDir() {
			path = indexPath
		}

		fs.ServeHTTP(w, r)
	}
}

func main() {
	flag.Parse()

	// インスタンスIDの生成
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		log.Fatal(err)
	}
	instanceID = hex.EncodeToString(b)
	log.Printf("Instance ID: %s", instanceID)

	// WebSocketハブの初期化と起動
	hub := wsinternal.NewHub()
	go hub.Run()

	// ハンドラー設定の初期化
	config := &filehandlers.Config{
		Addr:       addr,
		InstanceID: instanceID,
	}

	r := mux.NewRouter()

	// WebSocketエンドポイント
	r.HandleFunc("/ws/{roomId}", func(w http.ResponseWriter, r *http.Request) {
		wsinternal.ServeWs(hub, w, r, instanceID)
	})

	// APIエンドポイント
	r.HandleFunc("/api/info", config.HandleGetInfo).Methods("GET")
	r.HandleFunc("/api/files", config.HandleGetFiles).Methods("GET")
	r.HandleFunc("/api/files", config.HandleCreateFile).Methods("POST")
	r.HandleFunc("/api/files/{filename}", config.HandleGetFile).Methods("GET")
	r.HandleFunc("/api/files/{filename}", config.HandleSaveFile).Methods("PUT")

	// config.jsを生成するハンドラー
	r.HandleFunc("/config.js", config.HandleConfig)

	// 静的ファイルの設定
	staticDir := "./web/build"
	absStaticDir, err := filepath.Abs(staticDir)
	if err != nil {
		log.Fatal(err)
	}

	if _, err := os.Stat(absStaticDir); os.IsNotExist(err) {
		log.Printf("Warning: Static directory %s does not exist\n", absStaticDir)
		staticDir = "./web/public"
		absStaticDir, err = filepath.Abs(staticDir)
		if err != nil {
			log.Fatal(err)
		}
	}

	// CORSの設定
	localIP := getLocalIPv4()
	corsOrigins := []string{
		"http://localhost:5173",
		"http://localhost:8080",
		"http://" + localIP + ":5173",
		"http://" + localIP + ":8080",
	}
	corsMiddleware := ghandlers.CORS( // エイリアスを使用
		ghandlers.AllowedOrigins(corsOrigins),
		ghandlers.AllowedMethods([]string{"GET", "POST", "PUT", "OPTIONS"}),
		ghandlers.AllowedHeaders([]string{"Content-Type", "X-Requested-With"}),
	)

	// 静的ファイルの提供
	r.PathPrefix("/static/").Handler(http.StripPrefix("/static/", http.FileServer(http.Dir(absStaticDir))))
	r.PathPrefix("/").Handler(spaFileServer(absStaticDir))

	// サーバーの起動
	server := &http.Server{
		Addr:    *addr,
		Handler: corsMiddleware(r),
	}

	log.Printf("Starting server on %s\n", *addr)
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

// ファイルを保存するハンドラー
func handleSaveFile(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	filename := vars["filename"]

	// ファイル内容を取得
	var content struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&content); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// ファイルパスの作成と保存
	filepath := path.Join("./storage", filename)
	if err := os.WriteFile(filepath, []byte(content.Content), 0644); err != nil {
		http.Error(w, "Failed to save file", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// config.jsを生成するハンドラー
func handleConfig(w http.ResponseWriter, r *http.Request) {
	host := r.Host
	if strings.Contains(host, ":") {
		host = strings.Split(host, ":")[0]
	}

	w.Header().Set("Content-Type", "application/javascript")
	tmpl := template.Must(template.New("config").Parse(`
        export const config = {
            wsUrl: "ws://{{.Host}}:{{.Port}}/ws",
            httpUrl: "http://{{.Host}}:{{.Port}}/api"
        };
    `))

	data := struct {
		Host string
		Port string
	}{
		Host: host,
		Port: strings.TrimPrefix(*addr, ":"),
	}

	tmpl.Execute(w, data)
}

// ファイル名のバリデーション用ヘルパー関数
func isValidFilename(name string) bool {
	if name == "" || strings.Contains(name, "/") || strings.Contains(name, "\\") {
		return false
	}
	return true
}
