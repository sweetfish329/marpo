package websocket

// Hubは全てのアクティブなルームを管理します。
type Hub struct {
	// rooms はルーム名をキーとしたルームのマップ
	rooms map[string]*Room

	// register はルーム登録のためのチャネル
	register chan *Room

	// unregister はルーム登録解除のためのチャネル
	unregister chan *Room
}

func NewHub() *Hub {
	return &Hub{
		rooms:      make(map[string]*Room),
		register:   make(chan *Room),
		unregister: make(chan *Room),
	}
}

// Run はハブのメインループを開始します
func (h *Hub) Run() {
	for {
		select {
		case room := <-h.register:
			h.rooms[room.name] = room
		case room := <-h.unregister:
			if _, ok := h.rooms[room.name]; ok {
				delete(h.rooms, room.name)
			}
		}
	}
}

// GetOrCreateRoom は指定されたIDのルームを取得または作成します
func (h *Hub) GetOrCreateRoom(roomID string) *Room {
	if room, exists := h.rooms[roomID]; exists {
		return room
	}

	room := NewRoom(roomID)
	h.register <- room
	return room
}
