package filehandlers

import (
	"encoding/json"
	"html/template"
	"net/http"
	"os"
	"path"
	"strings"
)

// Configはサーバーの設定を保持します
type Config struct {
	Addr *string
}

// ハンドラー関数をメソッドとして定義
func (c *Config) HandleConfig(w http.ResponseWriter, r *http.Request) {
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
		Port: strings.TrimPrefix(*c.Addr, ":"),
	}

	tmpl.Execute(w, data)
}

// HandleGetFiles ファイル一覧を取得するハンドラー
func (c *Config) HandleGetFiles(w http.ResponseWriter, r *http.Request) {
	storageDir := "./storage"
	files, err := os.ReadDir(storageDir)
	if err != nil {
		if os.IsNotExist(err) {
			if err := os.MkdirAll(storageDir, 0755); err != nil {
				http.Error(w, "Failed to create storage directory", http.StatusInternalServerError)
				return
			}
			files = []os.DirEntry{}
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

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

// HandleCreateFile 新規ファイルを作成するハンドラー
func (c *Config) HandleCreateFile(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if !isValidFilename(req.Name) {
		http.Error(w, "Invalid filename", http.StatusBadRequest)
		return
	}

	filepath := path.Join("./storage", req.Name)
	if _, err := os.Stat(filepath); err == nil {
		http.Error(w, "File already exists", http.StatusConflict)
		return
	}

	if err := os.WriteFile(filepath, []byte(""), 0644); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

// HandleGetFile ファイルを取得するハンドラー
func (c *Config) HandleGetFile(w http.ResponseWriter, r *http.Request) {
	filename := path.Base(r.URL.Path)
	if !isValidFilename(filename) {
		http.Error(w, "Invalid filename", http.StatusBadRequest)
		return
	}

	filepath := path.Join("./storage", filename)
	content, err := os.ReadFile(filepath)
	if err != nil {
		if os.IsNotExist(err) {
			http.Error(w, "File not found", http.StatusNotFound)
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "text/markdown")
	w.Write(content)
}

// HandleSaveFile ファイルを保存するハンドラー
func (c *Config) HandleSaveFile(w http.ResponseWriter, r *http.Request) {
	filename := path.Base(r.URL.Path)
	if !isValidFilename(filename) {
		http.Error(w, "Invalid filename", http.StatusBadRequest)
		return
	}

	var req struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	filepath := path.Join("./storage", filename)
	if err := os.WriteFile(filepath, []byte(req.Content), 0644); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}

// isValidFilename ファイル名のバリデーション用ヘルパー関数
func isValidFilename(name string) bool {
	return strings.HasSuffix(name, ".md") && !strings.Contains(name, "/") && !strings.Contains(name, "\\")
}
