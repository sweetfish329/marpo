package websocket

import (
	"log"
	"net/http"

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

// ClientはWebSocket接続を持つユーザーを表します。
type Client struct {
	room *Room
	conn *websocket.Conn
	send chan []byte
}

func NewClient(room *Room, conn *websocket.Conn) *Client {
	return &Client{
		room: room,
		conn: conn,
		send: make(chan []byte, 256),
	}
}

// ReadPumpはクライアントからのメッセージを読み取り、ルームのブロードキャストチャネルに送信します。
func (c *Client) ReadPump() {
	defer func() {
		c.room.Unregister(c)
		c.conn.Close()
	}()

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}
		c.room.Broadcast(message)
	}
}

// WritePumpはsendチャネルからメッセージを受け取り、クライアントに書き込みます。
func (c *Client) WritePump() {
	defer c.conn.Close()

	for message := range c.send {
		err := c.conn.WriteMessage(websocket.TextMessage, message)
		if err != nil {
			log.Printf("error writing message: %v", err)
			return
		}
	}
}

// Sendはメッセージをクライアントの送信チャネルに送ります
func (c *Client) Send(message []byte) {
	c.send <- message
}
