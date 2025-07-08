package websocket

import (
	"log"
	"net/http"
	"strings"
)

// ServeWs はWebSocket接続をハンドルします
func ServeWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	// URLからルーム名を取得
	roomName := strings.TrimPrefix(r.URL.Path, "/ws/")
	if roomName == "" {
		http.Error(w, "Room name is required", http.StatusBadRequest)
		return
	}

	// WebSocket接続にアップグレード
	conn, err := Upgrade(w, r)
	if err != nil {
		log.Println("upgrade error:", err)
		return
	}

	// ルームを取得または作成
	room := hub.GetOrCreateRoom(roomName)

	// 新しいクライアントを作成
	client := NewClient(room, conn)

	// クライアントをルームに登録
	room.Register(client)

	// クライアントの読み書きを開始
	go client.WritePump()
	go client.ReadPump()
}
