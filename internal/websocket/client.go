package websocket

import (
	"log"
	"net/http"
	"time"
	"unicode/utf8"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// 開発用にオリジンチェックをスキップ
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// UpgradeはHTTP接続をWebSocketにアップグレードします。
func Upgrade(w http.ResponseWriter, r *http.Request) (*websocket.Conn, error) {
	return upgrader.Upgrade(w, r, nil)
}

// メッセージタイプ付きの送信構造体
type wsMessage struct {
	messageType int
	data        []byte
}

// ClientはWebSocket接続を持つユーザーを表します。
type Client struct {
	room *Room
	conn *websocket.Conn
	send chan wsMessage
}

func NewClient(room *Room, conn *websocket.Conn) *Client {
	return &Client{
		room: room,
		conn: conn,
		send: make(chan wsMessage, 256),
	}
}

// ReadPumpはクライアントからのメッセージを読み取り、ルームのブロードキャストチャネルに送信します。
func (c *Client) ReadPump() {
	defer func() {
		c.room.Unregister(c)
		c.conn.Close()
	}()

	c.conn.SetReadLimit(512 * 1024)     // 512KB
	c.conn.SetReadDeadline(time.Time{}) // デッドラインを無効化

	for {
		messageType, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}

		if messageType == websocket.TextMessage {
			// UTF-8の検証を追加
			if !utf8.Valid(message) {
				log.Printf("invalid UTF-8 message received")
				continue
			}
			// 空メッセージを無視
			if len(message) == 0 {
				continue
			}
		}
		// Broadcastにメッセージタイプも渡す
		c.room.Broadcast(wsMessage{messageType, message})
	}
}

// WritePumpはsendチャネルからメッセージを受け取り、クライアントに書き込みます。
func (c *Client) WritePump() {
	defer c.conn.Close()

	for msg := range c.send {
		c.conn.SetWriteDeadline(time.Time{}) // デッドラインを無効化

		if err := c.conn.WriteMessage(msg.messageType, msg.data); err != nil {
			log.Printf("error writing message: %v", err)
			return
		}
	}
}

// Sendはメッセージをクライアントの送信チャネルに送ります
func (c *Client) Send(msg wsMessage) {
	c.send <- msg
}
