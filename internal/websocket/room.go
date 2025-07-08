package websocket

import (
	"log"
	"sync"
)

// Roomはクライアントの集合とメッセージブロードキャストを管理します。
type Room struct {
	name       string
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	mutex      sync.RWMutex
}

func NewRoom(name string) *Room {
	return &Room{
		name:       name,
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (r *Room) Register(client *Client) {
	r.mutex.Lock()
	r.clients[client] = true
	r.mutex.Unlock()
}

func (r *Room) Unregister(client *Client) {
	r.mutex.Lock()
	if _, ok := r.clients[client]; ok {
		delete(r.clients, client)
		close(client.send)
		log.Printf("Client disconnected from room '%s'. Total clients: %d\n", r.name, len(r.clients))
	}
	r.mutex.Unlock()
}

func (r *Room) Broadcast(message []byte) {
	r.mutex.RLock()
	for client := range r.clients {
		select {
		case client.send <- message:
		default:
			// 送信がブロックされる場合はクライアントを削除
			close(client.send)
			delete(r.clients, client)
		}
	}
	r.mutex.RUnlock()
}

func (r *Room) Run() {
	for {
		select {
		case client := <-r.register:
			r.clients[client] = true
			log.Printf("Client connected to room '%s'. Total clients: %d\n", r.name, len(r.clients))
		case client := <-r.unregister:
			if _, ok := r.clients[client]; ok {
				delete(r.clients, client)
				close(client.send)
				log.Printf("Client disconnected from room '%s'. Total clients: %d\n", r.name, len(r.clients))
			}
		case message := <-r.broadcast:
			for client := range r.clients {
				select {
				case client.send <- message:
				default:
					// 送信がブロックされる場合はクライアントを削除
					close(client.send)
					delete(r.clients, client)
				}
			}
		}
	}
}
